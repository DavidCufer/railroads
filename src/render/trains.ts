import { DIRS8 } from "../sim/map/grid";
import type { TrackGraph } from "../sim/track/graph";
import { tileXY } from "../sim/trains/geometry";
import type { Train } from "../sim/trains/types";
import type { CargoType } from "../data/cargo";
import { LOCO_LENGTH_TILES, locomotiveById, type LocomotiveDef } from "../data/trains";
import { Camera, TILE_SIZE } from "./camera";
import { TRAIN_SIGNAL_WAIT_COLOR, TRAIN_WARNING_COLOR } from "./palette";
import { drawCarSprite, drawLocoSprite, chimneyOffset } from "./art/mapSprites";
import { eraBucket, type EraBucket } from "./art/livery";
import {
  SMOKE_MIN_ZOOM,
  drawSmoke,
  emitSmoke,
  pruneSmokeEmitters,
  smokeFrameDt,
  updateSmoke,
} from "./art/smoke";
import {
  buildRouteLanePath,
  extendChainBackward,
  placeVehicles,
  type GeomEnv,
} from "./laneGeometry";

/** DIRS8[i]'s screen-space heading, in radians (grid is screen-aligned: +x right, +y down). */
const DIR_ANGLE: readonly number[] = DIRS8.map(([dx, dy]) => Math.atan2(dy, dx));

// --- Vehicle sizing (zoom 1, tile = 32px) ---------------------------------------------------
// STYLE §7's literal pixel spec was loco 16×7, cars 12×7, 2px gaps; PLAN Phase 15 (play-test:
// "vehicles read too small at zoom 1") bumps every dimension ~20% and tightens the coupler gap to
// ~1px. (Render-only sizing here — LOCO_LENGTH_TILES/CAR_LENGTH_TILES in data/trains.ts already
// carry the 20% bump since the signaling model's tail-length math shares them.)
export const VEHICLE_WIDTH_TILES = 8.4 / TILE_SIZE;
export const CAR_DRAW_LEN_TILES = 14.4 / TILE_SIZE;
export const VEHICLE_GAP_TILES = 1 / TILE_SIZE;

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export interface VehiclePlacement {
  kind: "loco" | "car";
  /** Tile-space center and heading (radians) of the vehicle's drawn rectangle. */
  x: number;
  y: number;
  angle: number;
  /** Drawn length in tiles. */
  length: number;
}

export type LayoutTrain = Pick<
  Train,
  | "route"
  | "routeIndex"
  | "edgeProgress"
  | "renderFromX"
  | "renderFromY"
  | "renderToX"
  | "renderToY"
  | "direction"
  | "lastApproachNode"
> & { cars: readonly unknown[] };

/** Fraction (0..1, clamped) of the way from tile `a` to tile `b` that world point `(x, y)`
 * projects to along that straight edge — used to recover the head's progress at the *start* of
 * the current render tick from `renderFromX/Y` (a straight tile-space snapshot the sim already
 * keeps for alpha-smoothing) without needing any new sim state. */
function progressAlongEdge(mapWidth: number, a: number, b: number, x: number, y: number): number {
  const [ax, ay] = tileXY(a, mapWidth);
  const [bx, by] = tileXY(b, mapWidth);
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy || 1;
  const px = x - (ax + 0.5);
  const py = y - (ay + 0.5);
  return Math.max(0, Math.min(1, (px * dx + py * dy) / lenSq));
}

/** Total drawn length of a consist with `carCount` cars, coupler gaps included (tiles). */
export function consistLengthTiles(carCount: number): number {
  return (
    LOCO_LENGTH_TILES + carCount * (CAR_DRAW_LEN_TILES + VEHICLE_GAP_TILES) + (carCount > 0 ? 0 : 0)
  );
}

/** The node a stationary train (route has no edge ahead) trails back toward: the previous route
 * node, else the node it last arrived from, else any neighbour of its tile. */
function historyNodeFor(env: GeomEnv, train: LayoutTrain, node: number): number | undefined {
  const prev = train.route[train.routeIndex - 1];
  if (prev !== undefined) return prev;
  if (train.lastApproachNode >= 0 && env.graph.hasEdge(train.lastApproachNode, node)) {
    return train.lastApproachNode;
  }
  return env.graph.neighborsOf(node).sort((p, q) => p - q)[0];
}

/**
 * Where every vehicle of `train` is drawn (tile space), loco first then cars front to back
 * (PLAN Phase 17 A). One source of truth with the rails: the consist is laid out by *arc length*
 * along the same lane path `track.ts` draws from — the loco's nose is the head position, each
 * vehicle occupies the next `length` tiles behind it, and consecutive vehicles are separated by
 * exactly `VEHICLE_GAP_TILES` along the rails, whatever the angle or curvature.
 */
export function layoutConsist(env: GeomEnv, train: LayoutTrain, alpha: number): VehiclePlacement[] {
  const carCount = train.cars.length;
  const lengths = [LOCO_LENGTH_TILES, ...train.cars.map(() => CAR_DRAW_LEN_TILES)];
  const kinds: Array<"loco" | "car"> = lengths.map((_, i) => (i === 0 ? "loco" : "car"));
  const tail = consistLengthTiles(carCount);
  const { mapWidth } = env;
  const route = train.route;
  const idx = train.routeIndex;
  const nodeAt = route[idx];
  const nextNode = route[idx + 1];

  let chain: number[] | null = null;
  let i0 = 0;
  let progress = 1;
  if (nodeAt !== undefined && nextNode !== undefined) {
    // Moving: recent history + the next few nodes (lane easing looks up to TURNOUT_EASE_TILES
    // ahead, and the fillet at each node needs the node after it).
    let lo = idx;
    let behind = 0;
    while (lo > 0 && behind < tail + 2) {
      const [ax, ay] = tileXY(route[lo - 1] as number, mapWidth);
      const [bx, by] = tileXY(route[lo] as number, mapWidth);
      behind += Math.hypot(bx - ax, by - ay);
      lo--;
    }
    chain = route.slice(lo, Math.min(route.length, idx + 4));
    i0 = idx - lo;
    // A route that doubles back on itself (reversal at a terminal) can't be followed backwards
    // through the fold — the consist would land on top of the head. Start after the fold and let
    // the tail continue along whatever track really lies behind it.
    for (let k = i0; k >= 1; k--) {
      if (chain[k + 1] !== undefined && chain[k - 1] === chain[k + 1]) {
        chain = chain.slice(k);
        i0 -= k;
        break;
      }
    }
    const progressStart = progressAlongEdge(
      mapWidth,
      nodeAt,
      nextNode,
      train.renderFromX,
      train.renderFromY,
    );
    progress = lerp(progressStart, train.edgeProgress, alpha);
  } else if (nodeAt !== undefined) {
    // Parked (or at the end of its route): head at the node, tail back along the approach track.
    const prev = historyNodeFor(env, train, nodeAt);
    if (prev !== undefined) {
      chain = [prev, nodeAt];
      i0 = 0;
      progress = 1;
    }
  }

  if (!chain || chain.length < 2) {
    // No track to follow at all: a straight consist along the last known heading.
    const x = lerp(train.renderFromX, train.renderToX, alpha);
    const y = lerp(train.renderFromY, train.renderToY, alpha);
    const angle = train.direction >= 0 ? (DIR_ANGLE[train.direction] as number) : 0;
    const out: VehiclePlacement[] = [];
    let back = 0;
    lengths.forEach((length, i) => {
      out.push({
        kind: kinds[i] as "loco" | "car",
        x: x - Math.cos(angle) * (back + length / 2),
        y: y - Math.sin(angle) * (back + length / 2),
        angle,
        length,
      });
      back += length + VEHICLE_GAP_TILES;
    });
    return out;
  }

  const before = chain.length;
  chain = extendChainBackward(env, chain, tail + 2 + 4);
  i0 += chain.length - before;
  const lane = buildRouteLanePath(env, chain);
  const s0 = lane.nodeS[i0] as number;
  const s1 = lane.nodeS[i0 + 1] as number;
  const headS = s0 + (s1 - s0) * progress;
  return placeVehicles(lane, headS, lengths, VEHICLE_GAP_TILES).map((v, i) => ({
    kind: kinds[i] as "loco" | "car",
    ...v,
  }));
}

function worldToScreenScaled(
  camera: Camera,
  tileX: number,
  tileY: number,
  viewportW: number,
  viewportH: number,
): { x: number; y: number } {
  return camera.worldToScreen(tileX * TILE_SIZE, tileY * TILE_SIZE, viewportW, viewportH);
}

/** Manual rounded-rect path (kept independent of `CanvasRenderingContext2D.roundRect` so this
 * renders identically on any browser/engine version). */
function roundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** Zoom at which sprites gain their extra detail (STYLE §9.5: zoom ≥ 1.5 → 48 px tiles). */
const DETAIL_SIZE = TILE_SIZE * 1.5;

/** Draws a locomotive in local space: +x is the direction of travel (the front/leading end), so a
 * steam loco's chimney sits near +x and its cab/tender trail toward -x, where the cars follow. */
function drawLoco(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
  size: number,
  def: LocomotiveDef,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  drawLocoSprite(
    ctx,
    size * LOCO_LENGTH_TILES,
    size * VEHICLE_WIDTH_TILES,
    size,
    def,
    size >= DETAIL_SIZE,
  );
  ctx.restore();
}

/** Draws one car in local space (+x = direction of travel) in its cargo/era livery; open cars show
 * the load, closed cars don't (the UI shows the fill). */
function drawCar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
  size: number,
  cargoType: CargoType,
  era: EraBucket,
  loaded: boolean,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  drawCarSprite(
    ctx,
    size * CAR_DRAW_LEN_TILES,
    size * VEHICLE_WIDTH_TILES,
    size,
    cargoType,
    era,
    loaded,
    size >= DETAIL_SIZE,
  );
  ctx.restore();
}

function drawStatusIcon(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  train: Train,
): void {
  if (train.status === "broken") {
    // Breakdown indicator (SPEC §7.6, PLAN Phase 8 screenshot ask) — distinct from the ⚠ used for
    // stuck/no-route so a glance at the map tells "under repair" apart from "needs the player's
    // attention to fix the network".
    ctx.font = `${Math.max(10, size * 0.4)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText("🔧", x, y - size * 0.35);
  } else if (train.status === "waitingForBlock" || train.status === "waitingForStation") {
    ctx.fillStyle = TRAIN_SIGNAL_WAIT_COLOR;
    ctx.beginPath();
    ctx.arc(x, y - size * 0.45, size * 0.09, 0, Math.PI * 2);
    ctx.fill();
  } else if (train.status === "stuck" || train.status === "noRoute") {
    ctx.font = `${Math.max(10, size * 0.4)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillStyle = TRAIN_WARNING_COLOR;
    ctx.fillText("⚠", x, y - size * 0.35);
  }
}

export function drawTrains(
  ctx: CanvasRenderingContext2D,
  camera: Camera,
  viewportW: number,
  viewportH: number,
  mapWidth: number,
  graph: TrackGraph,
  trains: readonly Train[],
  alpha: number,
  nowMs: number,
  stationTiles: ReadonlySet<number>,
  year = 1900,
): void {
  const era = eraBucket(year);
  const dt = smokeFrameDt(nowMs);
  const smokeOn = camera.zoom >= SMOKE_MIN_ZOOM;
  const liveTrains = new Set<number>();
  const size = TILE_SIZE * camera.zoom;
  const env: GeomEnv = { mapWidth, graph, stationTiles, splitCache: new Map() };
  for (const train of trains) {
    const loco = locomotiveById(train.locoModelId);
    if (!loco) continue;

    // Cheap cull on the head position before laying out the whole consist.
    const rough = worldToScreenScaled(
      camera,
      lerp(train.renderFromX, train.renderToX, alpha),
      lerp(train.renderFromY, train.renderToY, alpha),
      viewportW,
      viewportH,
    );
    const reach = size * (2 + consistLengthTiles(train.cars.length));
    if (
      rough.x < -reach ||
      rough.y < -reach ||
      rough.x > viewportW + reach ||
      rough.y > viewportH + reach
    ) {
      continue;
    }

    const vehicles = layoutConsist(env, train, alpha);
    for (let i = vehicles.length - 1; i >= 1; i--) {
      const v = vehicles[i] as VehiclePlacement;
      const screen = worldToScreenScaled(camera, v.x, v.y, viewportW, viewportH);
      const car = train.cars[i - 1];
      drawCar(
        ctx,
        screen.x,
        screen.y,
        v.angle,
        size,
        car?.cargoType ?? "goods",
        era,
        (car?.loadedUnits ?? 0) > 0,
      );
    }
    const head = vehicles[0] as VehiclePlacement;
    const headScreen = worldToScreenScaled(camera, head.x, head.y, viewportW, viewportH);
    drawLoco(ctx, headScreen.x, headScreen.y, head.angle, size, loco);
    if (smokeOn) {
      liveTrains.add(train.id);
      const hx = Math.cos(head.angle);
      const hy = Math.sin(head.angle);
      const off = chimneyOffset(LOCO_LENGTH_TILES);
      const wx = (head.x + hx * off) * TILE_SIZE;
      const wy = (head.y + hy * off) * TILE_SIZE;
      if (loco.type === "steam") {
        const moving = train.speed > 0 && train.status !== "broken";
        emitSmoke(
          train.id,
          dt,
          moving ? 1.5 + Math.min(5, train.speed / 25) : 0.7,
          wx,
          wy,
          hx,
          hy,
          moving ? "steam" : "wisp",
        );
      } else if (
        loco.type === "diesel" &&
        train.speed > 0 &&
        train.speed < loco.maxSpeedKmh * 0.5
      ) {
        emitSmoke(
          train.id,
          dt,
          1.2,
          (head.x - hx * off) * TILE_SIZE,
          (head.y - hy * off) * TILE_SIZE,
          hx,
          hy,
          "haze",
        );
      }
    }
    drawStatusIcon(ctx, headScreen.x, headScreen.y, size, train);
  }
  if (smokeOn) {
    updateSmoke(dt);
    pruneSmokeEmitters(liveTrains);
    drawSmoke(ctx, (wx, wy) => camera.worldToScreen(wx, wy, viewportW, viewportH), camera.zoom);
  }
}

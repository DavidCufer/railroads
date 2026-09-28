import { DIRS8 } from "../sim/map/grid";
import type { TrackGraph } from "../sim/track/graph";
import { tileXY } from "../sim/trains/geometry";
import type { Train } from "../sim/trains/types";
import { CARGO, type CargoType } from "../data/cargo";
import { LOCO_LENGTH_TILES, locomotiveById } from "../data/trains";
import { Camera, TILE_SIZE } from "./camera";
import {
  CAR_EMPTY_COLOR,
  CAR_OUTLINE_COLOR,
  LOCO_COLORS,
  LOCO_SMOKE_COLOR,
  TRAIN_SIGNAL_WAIT_COLOR,
  TRAIN_WARNING_COLOR,
} from "./palette";
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
const VEHICLE_WIDTH_TILES = 8.4 / TILE_SIZE;
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

/** Draws a locomotive in local space: +x is the direction of travel (the front/leading end), so a
 * steam loco's chimney sits near +x and its cab/tender trail toward -x, where the cars follow. */
function drawLoco(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
  size: number,
  type: "steam" | "diesel" | "electric",
  nowMs: number,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  const len = size * LOCO_LENGTH_TILES;
  const w = size * VEHICLE_WIDTH_TILES;

  if (type === "steam") {
    const c = LOCO_COLORS.steam;
    const front = len / 2;
    const rear = -len / 2;
    const cabLen = len * 0.28;
    const tenderLen = len * 0.22;
    const boilerFront = front - len * 0.08; // leave a nose for the smokebox cap
    const boilerRear = rear + tenderLen + cabLen;

    // Tender, directly behind the cab (SPEC §7.7).
    ctx.fillStyle = c.tender;
    ctx.fillRect(rear, -w * 0.46, tenderLen, w * 0.92);

    // Cab at the rear, boxier/taller than the boiler.
    ctx.fillStyle = c.cab;
    ctx.fillRect(rear + tenderLen, -w * 0.5, cabLen, w);
    ctx.fillStyle = c.cabRoof;
    ctx.fillRect(rear + tenderLen + cabLen * 0.15, -w * 0.5, cabLen * 0.7, w * 0.16);

    // Boiler cylinder with a few bands, from the cab to the smokebox nose.
    roundedRectPath(ctx, boilerRear, -w * 0.4, boilerFront - boilerRear, w * 0.8, w * 0.32);
    ctx.fillStyle = c.boiler;
    ctx.fill();
    ctx.strokeStyle = c.band;
    ctx.lineWidth = Math.max(1, w * 0.09);
    for (let i = 1; i <= 3; i++) {
      const bx = boilerRear + ((boilerFront - boilerRear) * i) / 4;
      ctx.beginPath();
      ctx.moveTo(bx, -w * 0.38);
      ctx.lineTo(bx, w * 0.38);
      ctx.stroke();
    }

    // Smokebox nose cap.
    ctx.fillStyle = c.chimney;
    ctx.fillRect(boilerFront, -w * 0.42, front - boilerFront, w * 0.84);

    // Chimney and dome (PLAN Phase 15 play-test fix — these previously drew as rects offset to one
    // side, reading as sticking out sideways): both dark circles centered on the boiler's own
    // centerline (y=0 in this local, direction-of-travel-aligned space), each with a tiny lighter
    // rim, chimney near the front and the smaller dome just behind it.
    const chimneyX = boilerFront - len * 0.12;
    const chimneyR = w * 0.16;
    const domeX = chimneyX - len * 0.16;
    const domeR = w * 0.11;
    for (const [cx, r] of [
      [chimneyX, chimneyR],
      [domeX, domeR],
    ] as const) {
      ctx.fillStyle = c.chimney;
      ctx.beginPath();
      ctx.arc(cx, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
      ctx.lineWidth = Math.max(1, w * 0.035);
      ctx.stroke();
    }

    // Cheap smoke puffs rising from the chimney (on the centerline) and drifting back toward the
    // cars, cycling with real time so they animate independent of sim tick rate.
    const puffPhase = (nowMs / 550) % 1;
    for (let i = 0; i < 2; i++) {
      const t = (puffPhase + i * 0.5) % 1;
      ctx.globalAlpha = 0.5 * (1 - t);
      ctx.fillStyle = LOCO_SMOKE_COLOR;
      ctx.beginPath();
      ctx.arc(chimneyX - t * len * 0.35, -t * w * 1.4, chimneyR * (1 + t * 1.8), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  } else if (type === "diesel") {
    const c = LOCO_COLORS.diesel;
    roundedRectPath(ctx, -len / 2, -w / 2, len, w, w * 0.18);
    ctx.fillStyle = c.body;
    ctx.fill();
    ctx.fillStyle = c.window;
    ctx.fillRect(len * 0.22, -w * 0.28, len * 0.22, w * 0.5);
    ctx.fillStyle = c.stripe;
    ctx.fillRect(-len / 2, w * 0.14, len, w * 0.16);
    ctx.fillStyle = c.trim;
    ctx.fillRect(len / 2 - w * 0.1, -w * 0.5, w * 0.1, w);
  } else {
    const c = LOCO_COLORS.electric;
    roundedRectPath(ctx, -len / 2, -w / 2, len, w, w * 0.16);
    ctx.fillStyle = c.body;
    ctx.fill();
    ctx.fillStyle = c.roof;
    ctx.fillRect(-len * 0.35, -w * 0.5, len * 0.7, w * 0.18);
    ctx.fillStyle = c.window;
    ctx.fillRect(len * 0.18, -w * 0.3, len * 0.28, w * 0.5);
    ctx.fillRect(-len * 0.46, -w * 0.3, len * 0.22, w * 0.5);
    // Pantograph: a small diamond frame on the roof.
    ctx.strokeStyle = c.pantograph;
    ctx.lineWidth = Math.max(1, w * 0.09);
    ctx.beginPath();
    ctx.moveTo(-w * 0.22, -w * 0.5);
    ctx.lineTo(-w * 0.06, -w * 1.05);
    ctx.lineTo(w * 0.06, -w * 1.05);
    ctx.lineTo(w * 0.22, -w * 0.5);
    ctx.stroke();
  }
  ctx.restore();
}

type CarShape = "passenger" | "mail" | "hopper" | "tanker" | "flatcar" | "boxcar" | "livestock";

/** STYLE §7's car body shapes, keyed by the cargo carried — matches `CARGO[type].car`'s naming
 * (e.g. "Coal hopper", "Ore hopper", "Grain hopper" all draw as a hopper). Body *color* still
 * follows the existing SPEC §7 rule (each cargo's own color when loaded, grey when empty) rather
 * than STYLE's literal "green/maroon" passenger suggestion, so a car's cargo stays readable at a
 * glance exactly as it already was — only the silhouette changes here. */
const CARGO_CAR_SHAPE: Record<CargoType, CarShape> = {
  passengers: "passenger",
  mail: "mail",
  coal: "hopper",
  ironOre: "hopper",
  wood: "flatcar",
  grain: "hopper",
  livestock: "livestock",
  oil: "tanker",
  steel: "flatcar",
  lumber: "flatcar",
  food: "boxcar",
  goods: "boxcar",
  fuel: "tanker",
};

const DECK_COLOR = "#5A4632";

/** Draws one car in local space (+x = direction of travel), shaped per STYLE §7 by the cargo it
 * carries, colored by cargo when loaded (SPEC §7's rendering rule), grey when empty so a full vs.
 * running-empty consist reads at a glance. */
function drawCar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
  size: number,
  cargoType: CargoType,
  loaded: boolean,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  const len = size * CAR_DRAW_LEN_TILES;
  const w = size * VEHICLE_WIDTH_TILES;
  const outline = (): void => {
    ctx.strokeStyle = CAR_OUTLINE_COLOR;
    ctx.lineWidth = Math.max(1, size * 0.025);
    ctx.stroke();
  };
  const bodyColor = loaded ? CARGO[cargoType].color : CAR_EMPTY_COLOR;
  const shape = CARGO_CAR_SHAPE[cargoType];

  switch (shape) {
    case "tanker": {
      // A rounded cylinder (fully round ends) with a lighter top-lit center stripe.
      roundedRectPath(ctx, -len / 2, -w / 2, len, w, w * 0.5);
      ctx.fillStyle = bodyColor;
      ctx.fill();
      outline();
      ctx.fillStyle = "rgba(255, 255, 255, 0.28)";
      ctx.fillRect(-len * 0.4, -w * 0.1, len * 0.8, w * 0.16);
      break;
    }
    case "hopper": {
      // Dark frame with an open top showing the load (heap in the cargo color, dark when empty).
      roundedRectPath(ctx, -len / 2, -w / 2, len, w, w * 0.15);
      ctx.fillStyle = CAR_EMPTY_COLOR;
      ctx.fill();
      const inset = w * 0.16;
      ctx.fillStyle = loaded ? bodyColor : "#1A1A1A";
      ctx.fillRect(-len / 2 + inset, -w / 2 + inset, len - inset * 2, w - inset * 2);
      if (loaded) {
        ctx.beginPath();
        ctx.ellipse(0, -w * 0.08, len * 0.28, w * 0.22, 0, 0, Math.PI * 2);
        ctx.fillStyle = bodyColor;
        ctx.fill();
      }
      roundedRectPath(ctx, -len / 2, -w / 2, len, w, w * 0.15);
      outline();
      break;
    }
    case "flatcar": {
      // A bare wood deck, with cargo-colored load blocks stacked on it when loaded.
      ctx.fillStyle = DECK_COLOR;
      ctx.fillRect(-len / 2, -w * 0.28, len, w * 0.56);
      if (loaded) {
        ctx.fillStyle = bodyColor;
        const blocks = 3;
        const blockW = (len / blocks) * 0.8;
        for (let i = 0; i < blocks; i++) {
          const bx = -len / 2 + (i + 0.5) * (len / blocks);
          ctx.fillRect(bx - blockW / 2, -w * 0.4, blockW, w * 0.8);
        }
      }
      ctx.strokeStyle = CAR_OUTLINE_COLOR;
      ctx.lineWidth = Math.max(1, size * 0.02);
      ctx.strokeRect(-len / 2, -w * 0.28, len, w * 0.56);
      break;
    }
    case "boxcar": {
      // A boxy body with a ribbed roof.
      roundedRectPath(ctx, -len / 2, -w / 2, len, w, w * 0.2);
      ctx.fillStyle = bodyColor;
      ctx.fill();
      outline();
      ctx.strokeStyle = "rgba(0, 0, 0, 0.25)";
      ctx.lineWidth = Math.max(0.5, w * 0.05);
      const ribs = 4;
      for (let r = 1; r < ribs; r++) {
        const rx = -len / 2 + (len * r) / ribs;
        ctx.beginPath();
        ctx.moveTo(rx, -w * 0.42);
        ctx.lineTo(rx, w * 0.42);
        ctx.stroke();
      }
      break;
    }
    case "livestock": {
      // A boxy body with a slatted roof (ventilation slats).
      roundedRectPath(ctx, -len / 2, -w / 2, len, w, w * 0.18);
      ctx.fillStyle = bodyColor;
      ctx.fill();
      outline();
      ctx.strokeStyle = "rgba(0, 0, 0, 0.32)";
      ctx.lineWidth = Math.max(0.5, w * 0.07);
      const slats = 5;
      for (let s = 0; s < slats; s++) {
        const sx = -len / 2 + (len * (s + 0.5)) / slats;
        ctx.beginPath();
        ctx.moveTo(sx, -w * 0.46);
        ctx.lineTo(sx, w * 0.46);
        ctx.stroke();
      }
      break;
    }
    case "mail": {
      roundedRectPath(ctx, -len / 2, -w / 2, len, w, w * 0.2);
      ctx.fillStyle = bodyColor;
      ctx.fill();
      outline();
      break;
    }
    case "passenger":
    default: {
      // A boxy body with a lighter roof center line (top-lit).
      roundedRectPath(ctx, -len / 2, -w / 2, len, w, w * 0.24);
      ctx.fillStyle = bodyColor;
      ctx.fill();
      outline();
      ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
      ctx.lineWidth = Math.max(1, w * 0.12);
      ctx.beginPath();
      ctx.moveTo(-len * 0.42, 0);
      ctx.lineTo(len * 0.42, 0);
      ctx.stroke();
      break;
    }
  }
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
): void {
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
        (car?.loadedUnits ?? 0) > 0,
      );
    }
    const head = vehicles[0] as VehiclePlacement;
    const headScreen = worldToScreenScaled(camera, head.x, head.y, viewportW, viewportH);
    drawLoco(ctx, headScreen.x, headScreen.y, head.angle, size, loco.type, nowMs);
    drawStatusIcon(ctx, headScreen.x, headScreen.y, size, train);
  }
}

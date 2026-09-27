/**
 * Train rendering (SPEC §7, PLAN Phase 6): loco drawn by type (steam/diesel/electric), cars
 * trailing behind colored by cargo, both rotated to the local track direction, with smooth
 * interpolation between sim ticks using the game loop's alpha. A handful of trains at once, drawn
 * directly every frame (same reasoning as render/stations.ts — too few to need chunk caching).
 */
import { DIRS8 } from "../sim/map/grid";
import type { TrackGraph } from "../sim/track/graph";
import { directionBetween, edgeLengthTiles, tileXY } from "../sim/trains/geometry";
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
  buildEdgeGeometry,
  doubleTrackOffsetAt,
  hasDoubleNeighborAt,
  isFilletBend,
  type EdgePath,
} from "./trackPath";

/** DIRS8[i]'s screen-space heading, in radians (grid is screen-aligned: +x right, +y down). */
const DIR_ANGLE: readonly number[] = DIRS8.map(([dx, dy]) => Math.atan2(dy, dx));

// --- Vehicle sizing (zoom 1, tile = 32px) ---------------------------------------------------
// STYLE §7's literal pixel spec was loco 16×7, cars 12×7, 2px gaps; PLAN Phase 15 (play-test:
// "vehicles read too small at zoom 1") bumps every dimension ~20% and tightens the coupler gap to
// ~1px. (Render-only sizing here — LOCO_LENGTH_TILES/CAR_LENGTH_TILES in data/trains.ts already
// carry the 20% bump since the signaling model's tail-length math shares them.)
const VEHICLE_WIDTH_TILES = 8.4 / TILE_SIZE;
const CAR_DRAW_LEN_TILES = 14.4 / TILE_SIZE;
const VEHICLE_GAP_TILES = 1 / TILE_SIZE;

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

interface Sample {
  x: number;
  y: number;
  angle: number;
}

/** STYLE §7: "vehicles rotate smoothly along curves... each vehicle's position/angle is sampled
 * on the curved track path at its own offset behind the head, so couplings follow the curve" —
 * resolves the fillet partner direction at `node`'s end of edge `(nodeAwayDir)`, from whichever
 * *other* tile the route actually continues to there (`otherNode`), or `null` if there's no route
 * continuation (end of known route) or the bend isn't the one 45° angle a train can traverse. */
function routePartnerDir(
  mapWidth: number,
  node: number,
  nodeAwayDir: number,
  otherNode: number | undefined,
): number | null {
  if (otherNode === undefined) return null;
  const otherAwayDir = directionBetween(node, otherNode, mapWidth);
  return isFilletBend(nodeAwayDir, otherAwayDir) ? otherAwayDir : null;
}

/** A train's lateral lane offset (tiles) to apply to a `path.pointAt(...)` sample taken while
 * traveling from `a` to `b` (in that order — `path`'s own forward direction) — PLAN Phase 16 (play-
 * test 2: "trains run on the centerline between the two tracks and pass through each other"). 0 on
 * single track. On double track, one direction rides the "through" track (offset 0, exactly the
 * track renderer's own centerline) and the other rides the "diverging" track (`track.ts`'s
 * `offsetAt`), so opposing trains are always on the two different rails actually drawn, easing in/
 * out over the same turnout the track renderer tapers — see `src/render/trackPath.ts`'s
 * `doubleTrackOffsetAt` doc comment for why one side needs no taper handling at all. */
function laneOffsetTiles(
  graph: TrackGraph,
  a: number,
  b: number,
  path: EdgePath,
  distanceAlongPath: number,
  stationTiles: ReadonlySet<number>,
): number {
  const edge = graph.getEdge(a, b);
  if (!edge?.double) return 0;
  const throughDirection = a === edge.a; // traveling a->b matches the edge's own canonical a->b
  if (throughDirection) return 0;
  // PLAN Phase 16.1: a station never pinches a touching double edge's taper to 0 at itself (see
  // `track.ts`'s matching taper flags) — a train stays in its own lane all the way up to the
  // platform instead of sliding back onto the centerline just before arriving.
  const taperAtA = !hasDoubleNeighborAt(graph, edge.a, edge.b) && !stationTiles.has(edge.a);
  const taperAtB = !hasDoubleNeighborAt(graph, edge.b, edge.a) && !stationTiles.has(edge.b);
  // `path` runs b->a here (reversed from canonical a->b), so distance from *canonical* start (a of
  // the edge, i.e. this path's own end) is the remainder.
  const distanceFromCanonicalStart = path.length - distanceAlongPath;
  const magnitude = doubleTrackOffsetAt(
    distanceFromCanonicalStart,
    path.length,
    taperAtA,
    taperAtB,
  );
  // `path`'s own forward direction is reversed from canonical, so its perpendicular convention is
  // negated relative to the canonical centerline's — negate the magnitude to land on the same
  // world-space "diverging" position the track renderer draws.
  return -magnitude;
}

/** Curved (x, y, heading) at `progress` (0..1) along `route[idx] -> route[idx+1]`, following the
 * same fillet geometry the track renderer draws — the neighboring route tiles just before/after
 * this edge (if any) decide whether either end bends. Offsets sideways into this direction's own
 * lane on double track (see `laneOffsetTiles`). */
export function curvedRouteSample(
  mapWidth: number,
  graph: TrackGraph,
  route: readonly number[],
  idx: number,
  progress: number,
  stationTiles: ReadonlySet<number> = new Set(),
): Sample {
  const a = route[idx] as number;
  const b = route[idx + 1] as number;
  const dirAB = directionBetween(a, b, mapWidth);
  // PLAN Phase 16.1: never fillet at a station's own node (matches `track.ts`'s drawn geometry —
  // "the station tile is always straight").
  const partnerA = stationTiles.has(a) ? null : routePartnerDir(mapWidth, a, dirAB, route[idx - 1]);
  const partnerB = stationTiles.has(b)
    ? null
    : routePartnerDir(mapWidth, b, (dirAB + 4) % 8, route[idx + 2]);
  const path = buildEdgeGeometry(mapWidth, a, b, partnerA, partnerB);
  const [ax, ay] = tileXY(a, mapWidth);
  const [bx, by] = tileXY(b, mapWidth);
  const straightLen = Math.hypot(bx - ax, by - ay);
  const distanceAlongPath = progress * straightLen;
  const sample = path.pointAt(distanceAlongPath);
  const lane = laneOffsetTiles(graph, a, b, path, distanceAlongPath, stationTiles);
  if (lane === 0) return sample;
  const perpX = -Math.sin(sample.angle);
  const perpY = Math.cos(sample.angle);
  return { x: sample.x + perpX * lane, y: sample.y + perpY * lane, angle: sample.angle };
}

/** Walks backward from the train's head along its route by `distanceBehind` tiles, returning the
 * curved (tile-space) point and local heading there — used to lay cars out behind the loco. Clamps
 * at the start of the known route (a train that has barely left a station won't have enough route
 * history yet; its cars simply bunch up near the head, a minor cosmetic simplification). */
function sampleBehindHead(
  mapWidth: number,
  graph: TrackGraph,
  train: Train,
  distanceBehind: number,
  stationTiles: ReadonlySet<number>,
): Sample {
  let idx = train.routeIndex;
  const firstB = train.route[idx + 1];
  if (firstB === undefined) {
    const [x, y] = tileXY(train.route[idx] as number, mapWidth);
    return { x: x + 0.5, y: y + 0.5, angle: DIR_ANGLE[Math.max(train.direction, 0)] as number };
  }

  const firstEdge = graph.getEdge(train.route[idx] as number, firstB);
  let edgeLen = firstEdge ? edgeLengthTiles(firstEdge) : 1;
  let coveredOnEdge = train.edgeProgress * edgeLen;
  let remaining = distanceBehind;

  while (remaining > coveredOnEdge && idx > 0) {
    remaining -= coveredOnEdge;
    idx--;
    const a = train.route[idx] as number;
    const b = train.route[idx + 1] as number;
    const edge = graph.getEdge(a, b);
    edgeLen = edge ? edgeLengthTiles(edge) : 1;
    coveredOnEdge = edgeLen;
  }

  const a = train.route[idx];
  const b = train.route[idx + 1];
  if (a === undefined || b === undefined) {
    const [x, y] = tileXY((a ?? train.route[idx]) as number, mapWidth);
    return { x: x + 0.5, y: y + 0.5, angle: DIR_ANGLE[Math.max(train.direction, 0)] as number };
  }
  const progress = Math.max(0, Math.min(1, (coveredOnEdge - remaining) / edgeLen));
  return curvedRouteSample(mapWidth, graph, train.route, idx, progress, stationTiles);
}

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
  for (const train of trains) {
    const loco = locomotiveById(train.locoModelId);
    if (!loco) continue;

    const a = train.route[train.routeIndex];
    const b = train.route[train.routeIndex + 1];
    let headTileX: number;
    let headTileY: number;
    let angle: number;
    if (a !== undefined && b !== undefined) {
      // Blend the head's progress along the *current* curved edge between its tick-start
      // (`renderFromX/Y`, a straight tile-space snapshot the sim already keeps) and tick-end
      // (`train.edgeProgress`, authoritative) positions, so it follows the same fillet the cars
      // do while keeping the existing smooth sub-tick interpolation (`alpha`).
      const progressStart = progressAlongEdge(mapWidth, a, b, train.renderFromX, train.renderFromY);
      const progress = lerp(progressStart, train.edgeProgress, alpha);
      const sample = curvedRouteSample(
        mapWidth,
        graph,
        train.route,
        train.routeIndex,
        progress,
        stationTiles,
      );
      headTileX = sample.x;
      headTileY = sample.y;
      angle = sample.angle;
    } else {
      headTileX = lerp(train.renderFromX, train.renderToX, alpha);
      headTileY = lerp(train.renderFromY, train.renderToY, alpha);
      angle = train.direction >= 0 ? (DIR_ANGLE[train.direction] as number) : Math.atan2(0, 1);
    }
    const head = worldToScreenScaled(camera, headTileX, headTileY, viewportW, viewportH);
    if (
      head.x < -size * 2 ||
      head.y < -size * 2 ||
      head.x > viewportW + size * 2 ||
      head.y > viewportH + size * 2
    ) {
      continue;
    }

    for (let i = train.cars.length - 1; i >= 0; i--) {
      const distanceBehind =
        LOCO_LENGTH_TILES +
        VEHICLE_GAP_TILES +
        i * (CAR_DRAW_LEN_TILES + VEHICLE_GAP_TILES) +
        CAR_DRAW_LEN_TILES / 2;
      const sample = sampleBehindHead(mapWidth, graph, train, distanceBehind, stationTiles);
      const screen = worldToScreenScaled(camera, sample.x, sample.y, viewportW, viewportH);
      const car = train.cars[i];
      drawCar(
        ctx,
        screen.x,
        screen.y,
        sample.angle,
        size,
        car?.cargoType ?? "goods",
        (car?.loadedUnits ?? 0) > 0,
      );
    }

    drawLoco(ctx, head.x, head.y, angle, size, loco.type, nowMs);
    drawStatusIcon(ctx, head.x, head.y, size, train);
  }
}

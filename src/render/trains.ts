/**
 * Train rendering (SPEC §7, PLAN Phase 6): loco drawn by type (steam/diesel/electric), cars
 * trailing behind colored by cargo, both rotated to the local track direction, with smooth
 * interpolation between sim ticks using the game loop's alpha. A handful of trains at once, drawn
 * directly every frame (same reasoning as render/stations.ts — too few to need chunk caching).
 */
import { DIRS8 } from "../sim/map/grid";
import type { TrackGraph } from "../sim/track/graph";
import { edgeLengthTiles, tileXY } from "../sim/trains/geometry";
import type { Train } from "../sim/trains/types";
import { CARGO } from "../data/cargo";
import { CAR_LENGTH_TILES, LOCO_LENGTH_TILES, locomotiveById } from "../data/trains";
import { Camera, TILE_SIZE } from "./camera";
import {
  CAR_EMPTY_COLOR,
  CAR_OUTLINE_COLOR,
  LOCO_COLORS,
  LOCO_SMOKE_COLOR,
  TRAIN_SIGNAL_WAIT_COLOR,
  TRAIN_WARNING_COLOR,
} from "./palette";

/** DIRS8[i]'s screen-space heading, in radians (grid is screen-aligned: +x right, +y down). */
const DIR_ANGLE: readonly number[] = DIRS8.map(([dx, dy]) => Math.atan2(dy, dx));

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

interface Sample {
  x: number;
  y: number;
  angle: number;
}

/** Walks backward from the train's head along its route by `distanceBehind` tiles, returning the
 * world (tile-space) point and local heading there — used to lay cars out behind the loco. Clamps
 * at the start of the known route (a train that has barely left a station won't have enough route
 * history yet; its cars simply bunch up near the head, a minor cosmetic simplification). */
function sampleBehindHead(
  mapWidth: number,
  graph: TrackGraph,
  train: Train,
  distanceBehind: number,
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

  const a = train.route[idx] as number;
  const b = train.route[idx + 1];
  if (b === undefined) {
    const [x, y] = tileXY(a, mapWidth);
    return { x: x + 0.5, y: y + 0.5, angle: DIR_ANGLE[Math.max(train.direction, 0)] as number };
  }
  const [ax, ay] = tileXY(a, mapWidth);
  const [bx, by] = tileXY(b, mapWidth);
  const progress = Math.max(0, Math.min(1, (coveredOnEdge - remaining) / edgeLen));
  return {
    x: ax + 0.5 + (bx - ax) * progress,
    y: ay + 0.5 + (by - ay) * progress,
    angle: Math.atan2(by - ay, bx - ax),
  };
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
  const w = size * 0.34;

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

    // Chimney, set back a little from the very front.
    const chimneyX = boilerFront - len * 0.12;
    ctx.fillRect(chimneyX - w * 0.13, -w * 0.85, w * 0.26, w * 0.5);

    // Cheap smoke puffs drifting up and back (toward the cars) from the chimney, cycling with
    // real time so they animate independent of sim tick rate.
    const puffPhase = (nowMs / 550) % 1;
    for (let i = 0; i < 2; i++) {
      const t = (puffPhase + i * 0.5) % 1;
      ctx.globalAlpha = 0.5 * (1 - t);
      ctx.fillStyle = LOCO_SMOKE_COLOR;
      ctx.beginPath();
      ctx.arc(
        chimneyX - t * len * 0.4,
        -w * 1.1 - t * w * 1.6,
        w * (0.25 + t * 0.3),
        0,
        Math.PI * 2,
      );
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

/** Draws one car in local space, colored by cargo when loaded (SPEC §7's rendering rule), grey
 * when empty so a full vs. running-empty consist reads at a glance. */
function drawCar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
  size: number,
  color: string,
  loaded: boolean,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  const len = size * CAR_LENGTH_TILES * 2.2;
  const w = size * 0.3;
  roundedRectPath(ctx, -len / 2, -w / 2, len, w, w * 0.22);
  ctx.fillStyle = loaded ? color : CAR_EMPTY_COLOR;
  ctx.fill();
  ctx.strokeStyle = CAR_OUTLINE_COLOR;
  ctx.lineWidth = Math.max(1, size * 0.025);
  ctx.stroke();
  ctx.restore();
}

function drawStatusIcon(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  train: Train,
): void {
  if (train.status === "waitingForBlock" || train.status === "waitingForStation") {
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
): void {
  const size = TILE_SIZE * camera.zoom;
  for (const train of trains) {
    const loco = locomotiveById(train.locoModelId);
    if (!loco) continue;

    const headTileX = lerp(train.renderFromX, train.renderToX, alpha);
    const headTileY = lerp(train.renderFromY, train.renderToY, alpha);
    const head = worldToScreenScaled(camera, headTileX, headTileY, viewportW, viewportH);
    if (
      head.x < -size * 2 ||
      head.y < -size * 2 ||
      head.x > viewportW + size * 2 ||
      head.y > viewportH + size * 2
    ) {
      continue;
    }

    const angle = train.direction >= 0 ? (DIR_ANGLE[train.direction] as number) : Math.atan2(0, 1);

    for (let i = train.cars.length - 1; i >= 0; i--) {
      const distanceBehind = LOCO_LENGTH_TILES / 2 + (i + 0.5) * CAR_LENGTH_TILES;
      const sample = sampleBehindHead(mapWidth, graph, train, distanceBehind);
      const screen = worldToScreenScaled(camera, sample.x, sample.y, viewportW, viewportH);
      const car = train.cars[i];
      const color = car ? CARGO[car.cargoType].color : CAR_EMPTY_COLOR;
      drawCar(ctx, screen.x, screen.y, sample.angle, size, color, car?.loaded ?? false);
    }

    drawLoco(ctx, head.x, head.y, angle, size, loco.type, nowMs);
    drawStatusIcon(ctx, head.x, head.y, size, train);
  }
}

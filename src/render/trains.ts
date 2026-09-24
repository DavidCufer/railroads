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
  const w = size * 0.32;

  if (type === "steam") {
    const c = LOCO_COLORS.steam;
    ctx.fillStyle = c.boiler;
    ctx.fillRect(-len / 2, -w / 2, len * 0.75, w);
    ctx.fillStyle = c.body;
    ctx.fillRect(len * 0.15, -w * 0.6, len * 0.35, w * 1.2);
    ctx.fillStyle = c.chimney;
    ctx.fillRect(-len * 0.35, -w * 0.85, w * 0.35, w * 0.5);
    // Cheap smoke puffs: a couple of soft circles drifting up-back from the chimney, cycling with
    // real time so they animate independent of sim tick rate.
    const puffPhase = (nowMs / 550) % 1;
    for (let i = 0; i < 2; i++) {
      const t = (puffPhase + i * 0.5) % 1;
      ctx.globalAlpha = 0.5 * (1 - t);
      ctx.fillStyle = LOCO_SMOKE_COLOR;
      ctx.beginPath();
      ctx.arc(
        -len * 0.35 - t * len * 0.4,
        -w * 1.0 - t * w * 1.6,
        w * (0.25 + t * 0.3),
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  } else if (type === "diesel") {
    const c = LOCO_COLORS.diesel;
    ctx.fillStyle = c.body;
    ctx.fillRect(-len / 2, -w / 2, len, w);
    ctx.fillStyle = c.window;
    ctx.fillRect(len * 0.2, -w * 0.3, len * 0.25, w * 0.5);
    ctx.fillStyle = c.trim;
    ctx.fillRect(-len / 2, w * 0.3, len, w * 0.14);
  } else {
    const c = LOCO_COLORS.electric;
    ctx.fillStyle = c.body;
    ctx.fillRect(-len / 2, -w / 2, len, w);
    ctx.fillStyle = c.window;
    ctx.fillRect(-len * 0.1, -w * 0.3, len * 0.4, w * 0.5);
    // Pantograph: a small zig-zag on the roof.
    ctx.strokeStyle = c.pantograph;
    ctx.lineWidth = Math.max(1, w * 0.08);
    ctx.beginPath();
    ctx.moveTo(-w * 0.2, -w / 2);
    ctx.lineTo(0, -w);
    ctx.lineTo(w * 0.2, -w / 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawCar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
  size: number,
  color: string,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  const len = size * CAR_LENGTH_TILES * 2.2;
  const w = size * 0.3;
  ctx.fillStyle = color;
  ctx.fillRect(-len / 2, -w / 2, len, w);
  ctx.strokeStyle = CAR_OUTLINE_COLOR;
  ctx.lineWidth = Math.max(1, size * 0.02);
  ctx.strokeRect(-len / 2, -w / 2, len, w);
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
      const cargo = train.cars[i]?.cargoType;
      drawCar(ctx, screen.x, screen.y, sample.angle, size, cargo ? CARGO[cargo].color : "#888");
    }

    drawLoco(ctx, head.x, head.y, angle, size, loco.type, nowMs);
    drawStatusIcon(ctx, head.x, head.y, size, train);
  }
}

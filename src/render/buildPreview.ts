/**
 * Ghost path preview while dragging in a build mode (SPEC §5.2): green when the whole path is
 * buildable and affordable, red otherwise; small red dots at any vertex where the path itself
 * turns sharper than 45° (still buildable, just not through-traversable, SPEC §5.1).
 */
import { Camera, TILE_SIZE } from "./camera";
import {
  GHOST_BLOCKED_COLOR,
  GHOST_BUILDABLE_COLOR,
  GHOST_BULLDOZE_COLOR,
  GHOST_ELECTRIFY_COLOR,
  GHOST_UPGRADE_COLOR,
} from "./palette";
import { directionIndex, directionSteps } from "../sim/track/graph";

export type BuildMode = "track" | "double" | "electrify" | "bulldoze";

export interface GhostPreview {
  mode: BuildMode;
  /** Tile indices along the path, in drag order. */
  path: readonly number[];
  /** True if the whole path is currently buildable and within cash. */
  ok: boolean;
  /** Segments (tile pairs) that break the 45° turn rule (PLAN Phase 18 A) — drawn as a heavy red
   * overlay so the player sees which part to redraw. */
  badSegments?: ReadonlyArray<readonly [number, number]>;
  /** Bulldoze (Phase 28B): exactly the edges the drag will remove, and the tiles of stations removed with
   * them. When set, these are drawn instead of the raw drag path. */
  removeEdges?: ReadonlyArray<readonly [number, number]>;
  removeStationTiles?: readonly number[];
}

function tileCenterWorld(tile: number, mapWidth: number): [number, number] {
  const x = tile % mapWidth;
  const y = Math.floor(tile / mapWidth);
  return [(x + 0.5) * TILE_SIZE, (y + 0.5) * TILE_SIZE];
}

function modeColor(mode: BuildMode, ok: boolean): string {
  if (!ok) return GHOST_BLOCKED_COLOR;
  if (mode === "bulldoze") return GHOST_BULLDOZE_COLOR;
  if (mode === "double") return GHOST_UPGRADE_COLOR;
  if (mode === "electrify") return GHOST_ELECTRIFY_COLOR;
  return GHOST_BUILDABLE_COLOR;
}

export function drawBuildPreview(
  ctx: CanvasRenderingContext2D,
  camera: Camera,
  viewportW: number,
  viewportH: number,
  mapWidth: number,
  preview: GhostPreview,
): void {
  if (preview.path.length < 2) return;
  const color = modeColor(preview.mode, preview.ok);
  if (preview.mode === "bulldoze" && preview.removeEdges) {
    drawRemovalPreview(ctx, camera, viewportW, viewportH, mapWidth, preview);
    return;
  }

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(2, 5 * camera.zoom);
  ctx.globalAlpha = 0.85;
  ctx.beginPath();
  for (let i = 0; i < preview.path.length; i++) {
    const [wx, wy] = tileCenterWorld(preview.path[i] as number, mapWidth);
    const s = camera.worldToScreen(wx, wy, viewportW, viewportH);
    if (i === 0) ctx.moveTo(s.x, s.y);
    else ctx.lineTo(s.x, s.y);
  }
  ctx.stroke();

  if (preview.badSegments && preview.badSegments.length > 0) {
    ctx.globalAlpha = 1;
    ctx.strokeStyle = "rgba(20, 10, 10, 0.9)";
    ctx.lineWidth = Math.max(4, 9 * camera.zoom);
    for (const pass of [0, 1]) {
      if (pass === 1) {
        ctx.strokeStyle = GHOST_BLOCKED_COLOR;
        ctx.lineWidth = Math.max(2.5, 5.5 * camera.zoom);
      }
      ctx.beginPath();
      for (const [a, b] of preview.badSegments) {
        const [ax, ay] = tileCenterWorld(a, mapWidth);
        const [bx, by] = tileCenterWorld(b, mapWidth);
        const sa = camera.worldToScreen(ax, ay, viewportW, viewportH);
        const sb = camera.worldToScreen(bx, by, viewportW, viewportH);
        ctx.moveTo(sa.x, sa.y);
        ctx.lineTo(sb.x, sb.y);
      }
      ctx.stroke();
    }
  }

  // Endpoint dots.
  ctx.globalAlpha = 1;
  ctx.fillStyle = color;
  for (const tile of [preview.path[0] as number, preview.path[preview.path.length - 1] as number]) {
    const [wx, wy] = tileCenterWorld(tile, mapWidth);
    const s = camera.worldToScreen(wx, wy, viewportW, viewportH);
    ctx.beginPath();
    ctx.arc(s.x, s.y, Math.max(2.5, 4 * camera.zoom), 0, Math.PI * 2);
    ctx.fill();
  }

  // Sharp-turn (>45°) markers at interior vertices of the path itself.
  for (let i = 1; i < preview.path.length - 1; i++) {
    const prev = preview.path[i - 1] as number;
    const node = preview.path[i] as number;
    const next = preview.path[i + 1] as number;
    const px = prev % mapWidth;
    const py = Math.floor(prev / mapWidth);
    const nx = node % mapWidth;
    const ny = Math.floor(node / mapWidth);
    const qx = next % mapWidth;
    const qy = Math.floor(next / mapWidth);
    const dirIn = directionIndex(Math.sign(nx - px), Math.sign(ny - py));
    const dirOut = directionIndex(Math.sign(qx - nx), Math.sign(qy - ny));
    if (directionSteps(dirIn, dirOut) <= 1) continue;

    const [wx, wy] = tileCenterWorld(node, mapWidth);
    const s = camera.worldToScreen(wx, wy, viewportW, viewportH);
    ctx.fillStyle = GHOST_BLOCKED_COLOR;
    ctx.beginPath();
    ctx.arc(s.x, s.y, Math.max(3, 4.5 * camera.zoom), 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(20, 10, 10, 0.85)";
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  ctx.restore();
}

/** Bulldoze ghost: the drag's route as a thin dashed guide, every edge that will go as a thick red line,
 * and a ring on each station that goes with it (PLAN Phase 28B). */
function drawRemovalPreview(
  ctx: CanvasRenderingContext2D,
  camera: Camera,
  viewportW: number,
  viewportH: number,
  mapWidth: number,
  preview: GhostPreview,
): void {
  const at = (tile: number): { x: number; y: number } => {
    const [wx, wy] = tileCenterWorld(tile, mapWidth);
    return camera.worldToScreen(wx, wy, viewportW, viewportH);
  };
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.globalAlpha = 0.9;
  ctx.setLineDash([4, 5]);
  ctx.strokeStyle = "rgba(240, 240, 240, 0.55)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  preview.path.forEach((tile, i) => {
    const s = at(tile);
    if (i === 0) ctx.moveTo(s.x, s.y);
    else ctx.lineTo(s.x, s.y);
  });
  ctx.stroke();
  ctx.setLineDash([]);
  const edges = preview.removeEdges ?? [];
  if (edges.length > 0) {
    for (const pass of [0, 1]) {
      ctx.strokeStyle = pass === 0 ? "rgba(20, 10, 10, 0.9)" : GHOST_BULLDOZE_COLOR;
      ctx.lineWidth = Math.max(pass === 0 ? 5 : 3, (pass === 0 ? 9 : 6) * camera.zoom);
      ctx.beginPath();
      for (const [a, b] of edges) {
        const sa = at(a);
        const sb = at(b);
        ctx.moveTo(sa.x, sa.y);
        ctx.lineTo(sb.x, sb.y);
      }
      ctx.stroke();
    }
  }
  ctx.lineWidth = Math.max(2, 3 * camera.zoom);
  ctx.strokeStyle = GHOST_BULLDOZE_COLOR;
  for (const tile of preview.removeStationTiles ?? []) {
    const s = at(tile);
    ctx.beginPath();
    ctx.arc(s.x, s.y, Math.max(10, 18 * camera.zoom), 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

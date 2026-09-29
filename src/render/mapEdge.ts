/**
 * The margin around the map (PLAN Phase 26B): the camera may pan a little past the edge, and that
 * strip is drawn as deep sea with a soft shoreline shadow along the map border instead of black.
 * Draw the backdrop first (before terrain) and the edge shadow right after the terrain.
 */
import type { Camera } from "./camera";
import { WATER_DEEP_COLOR } from "./palette";

const EDGE_SHADOW_PX = 14;

/** Paints the whole viewport deep-sea blue; the terrain then covers the map area. */
export function drawSeaBackdrop(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.fillStyle = WATER_DEEP_COLOR;
  ctx.fillRect(0, 0, w, h);
}

/** A soft dark falloff just outside the map's border so the world edge reads as a coast. */
export function drawMapEdge(
  ctx: CanvasRenderingContext2D,
  camera: Camera,
  w: number,
  h: number,
): void {
  const tl = camera.worldToScreen(0, 0, w, h);
  const br = camera.worldToScreen(camera.worldWidth, camera.worldHeight, w, h);
  if (tl.x <= 0 && tl.y <= 0 && br.x >= w && br.y >= h) return;
  const fade = (x0: number, y0: number, x1: number, y1: number): CanvasGradient => {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, "rgba(10, 24, 44, 0.45)");
    g.addColorStop(1, "rgba(10, 24, 44, 0)");
    return g;
  };
  const sw = EDGE_SHADOW_PX;
  const left = Math.max(0, tl.x);
  const top = Math.max(0, tl.y);
  const right = Math.min(w, br.x);
  const bottom = Math.min(h, br.y);
  if (tl.x > 0) {
    ctx.fillStyle = fade(tl.x, 0, tl.x - sw, 0);
    ctx.fillRect(tl.x - sw, top, sw, bottom - top);
  }
  if (br.x < w) {
    ctx.fillStyle = fade(br.x, 0, br.x + sw, 0);
    ctx.fillRect(br.x, top, sw, bottom - top);
  }
  if (tl.y > 0) {
    ctx.fillStyle = fade(0, tl.y, 0, tl.y - sw);
    ctx.fillRect(left, tl.y - sw, right - left, sw);
  }
  if (br.y < h) {
    ctx.fillStyle = fade(0, br.y, 0, br.y + sw);
    ctx.fillRect(left, br.y, right - left, sw);
  }
}

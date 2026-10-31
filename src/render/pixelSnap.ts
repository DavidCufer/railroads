/**
 * Seamless compositing of cached chunk canvases (PLAN Phase 24B). Chunks are drawn scaled by the
 * camera zoom, so their edges land on fractional device pixels; each canvas then anti-aliases its own
 * edge against whatever is behind it and a faint hairline shows between neighbours. Snapping every
 * chunk *boundary* to a whole device pixel — computed from the same world coordinate for both
 * neighbours, so they agree exactly — makes adjacent chunks abut without a gap or an overlap.
 */
import type { Camera } from "./camera";

/** World-space x/y of a chunk boundary to the device-pixel-snapped screen position (CSS px). */
export function snappedScreenX(
  camera: Camera,
  worldX: number,
  viewportW: number,
  viewportH: number,
  dpr: number,
): number {
  return Math.round(camera.worldToScreen(worldX, 0, viewportW, viewportH).x * dpr) / dpr;
}

export function snappedScreenY(
  camera: Camera,
  worldY: number,
  viewportW: number,
  viewportH: number,
  dpr: number,
): number {
  return Math.round(camera.worldToScreen(0, worldY, viewportW, viewportH).y * dpr) / dpr;
}

/** Highest backing-store scale the map canvas and its cached sprites use (owner, 2026-10-31). A phone at DPR 3 paints
 * 2.25x the pixels of DPR 2 for detail hard to see at arm's length; Phase 72 measured most of a frame in the raster. */
export const MAP_PIXEL_RATIO_CAP = 2;

/** The map's pixel ratio: the device's, capped at `MAP_PIXEL_RATIO_CAP` (menus and panels keep the full ratio). */
export function devicePixelRatioNow(): number {
  const dpr = (typeof window !== "undefined" && window.devicePixelRatio) || 1;
  return Math.min(MAP_PIXEL_RATIO_CAP, Math.max(1, dpr));
}

/** Draws the `[sx, sy, sw, sh]` source rect of a chunk canvas covering the world rect
 * `[wx0, wx1] × [wy0, wy1]`, with both rect edges snapped to device pixels. */
export function drawChunkSnapped(
  ctx: CanvasRenderingContext2D,
  camera: Camera,
  viewportW: number,
  viewportH: number,
  canvas: HTMLCanvasElement,
  src: { x: number; y: number; w: number; h: number },
  world: { x0: number; y0: number; x1: number; y1: number },
): void {
  const dpr = devicePixelRatioNow();
  const x0 = snappedScreenX(camera, world.x0, viewportW, viewportH, dpr);
  const x1 = snappedScreenX(camera, world.x1, viewportW, viewportH, dpr);
  const y0 = snappedScreenY(camera, world.y0, viewportW, viewportH, dpr);
  const y1 = snappedScreenY(camera, world.y1, viewportW, viewportH, dpr);
  if (x1 <= x0 || y1 <= y0) return;
  ctx.drawImage(canvas, src.x, src.y, src.w, src.h, x0, y0, x1 - x0, y1 - y0);
}

/**
 * Floating `+$` labels at stations on delivery (SPEC §8.1), cargo-colored, rising and fading.
 * Purely a rendering concern — src/main.ts drains `GameState.pendingDeliveries` each tick into a
 * short-lived list of these (with a real-time `startMs`) and this module just draws whatever is
 * still active this frame.
 */
import { tileXY } from "../sim/trains/geometry";
import { Camera, TILE_SIZE } from "./camera";

export interface FloatingLabel {
  stationTile: number;
  text: string;
  color: string;
  startMs: number;
}

const DURATION_MS = 1400;
const RISE_PX = 46;

export function isLabelExpired(label: FloatingLabel, nowMs: number): boolean {
  return nowMs - label.startMs > DURATION_MS;
}

export function drawDeliveryLabels(
  ctx: CanvasRenderingContext2D,
  camera: Camera,
  viewportW: number,
  viewportH: number,
  mapWidth: number,
  labels: readonly FloatingLabel[],
  nowMs: number,
): void {
  const size = TILE_SIZE * camera.zoom;
  for (const label of labels) {
    const t = (nowMs - label.startMs) / DURATION_MS;
    if (t < 0 || t > 1) continue;

    const [tx, ty] = tileXY(label.stationTile, mapWidth);
    const screen = camera.worldToScreen(
      (tx + 0.5) * TILE_SIZE,
      (ty + 0.5) * TILE_SIZE,
      viewportW,
      viewportH,
    );
    const y = screen.y - size * 0.6 - t * RISE_PX;

    ctx.save();
    ctx.globalAlpha = 1 - t;
    ctx.font = "700 13px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(10, 10, 10, 0.65)";
    ctx.strokeText(label.text, screen.x, y);
    ctx.fillStyle = label.color;
    ctx.fillText(label.text, screen.x, y);
    ctx.restore();
  }
}

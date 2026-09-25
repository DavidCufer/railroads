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

/** Phase 7.1 review: dark cargo colors (coal `#2A2A2A`, wood, ...) as label fill, over a dark
 * stroke halo, was unreadable against almost any terrain (docs/screenshots/phase-7-delivery-
 * label.png). Cargo colors light enough to read on their own stay cargo-colored (still useful for
 * "what got delivered" at a glance); anything darker falls back to bold white. */
function labelFillColor(cargoColor: string): string {
  const r = parseInt(cargoColor.slice(1, 3), 16);
  const g = parseInt(cargoColor.slice(3, 5), 16);
  const b = parseInt(cargoColor.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance < 0.45 ? "#FFFFFF" : cargoColor;
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
    ctx.font = "700 15px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.lineWidth = 4;
    ctx.strokeStyle = "rgba(0, 0, 0, 0.85)";
    ctx.strokeText(label.text, screen.x, y);
    ctx.fillStyle = labelFillColor(label.color);
    ctx.fillText(label.text, screen.x, y);
    ctx.restore();
  }
}

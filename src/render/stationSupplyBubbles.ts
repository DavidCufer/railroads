/**
 * Station supply bubbles on the map (STYLE §5: "Reuse the same pictograms on the map (station
 * supply bubbles) and in panels"). A small, self-contained addition — deliberately its own file
 * rather than a change to src/render/stations.ts, so it stays out of the way of any other work
 * touching that renderer.
 */
import { CARGO, type CargoType } from "../data/cargo";
import { cargoIconDataUrl } from "../ui/icons";
import type { GameState } from "../sim/state";
import { Camera, TILE_SIZE } from "./camera";

const BUBBLE_RADIUS = 9;
const MAX_BUBBLES_PER_STATION = 2;
const MIN_ZOOM = 0.75;

/** Converts `#rrggbb` to `rgba(r,g,b,alpha)` — same tint STYLE §5 gives the DOM cargo pictogram
 * tiles, so a bubble reads the same way whether it's a dark cargo (coal) or a light one. */
function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const bubbleImages = new Map<CargoType, HTMLImageElement>();

function getBubbleImage(cargo: CargoType): HTMLImageElement {
  let img = bubbleImages.get(cargo);
  if (!img) {
    img = new Image();
    img.src = cargoIconDataUrl(cargo, CARGO[cargo].color);
    bubbleImages.set(cargo, img);
  }
  return img;
}

/** Draws up to two small pictogram bubbles above each station showing its top supplied cargo
 * types, once the camera is zoomed in enough for them to be legible. */
export function drawStationSupplyBubbles(
  ctx: CanvasRenderingContext2D,
  camera: Camera,
  viewportW: number,
  viewportH: number,
  state: GameState,
): void {
  if (camera.zoom < MIN_ZOOM) return;
  const size = TILE_SIZE * camera.zoom;
  const r = BUBBLE_RADIUS * Math.min(1.3, camera.zoom);

  for (const station of state.stations) {
    const economy = state.stationEconomy.get(station.id);
    if (!economy) continue;
    const top = (Object.entries(economy.supply) as Array<[CargoType, number]>)
      .filter(([, amount]) => amount > 0.5)
      .sort((a, b) => b[1] - a[1])
      .slice(0, MAX_BUBBLES_PER_STATION)
      .map(([cargo]) => cargo);
    if (top.length === 0) continue;

    const tx = station.tile % state.map.width;
    const ty = Math.floor(station.tile / state.map.width);
    const screen = camera.worldToScreen(
      (tx + 0.5) * TILE_SIZE,
      (ty + 0.5) * TILE_SIZE,
      viewportW,
      viewportH,
    );
    if (
      screen.x < -size ||
      screen.x > viewportW + size ||
      screen.y < -size * 2 ||
      screen.y > viewportH + size
    ) {
      continue;
    }

    const rowY = screen.y - size * 0.7 - r;
    const spacing = r * 2 + 3;
    const startX = screen.x - ((top.length - 1) * spacing) / 2;
    top.forEach((cargo, i) => {
      const bx = startX + i * spacing;
      ctx.beginPath();
      ctx.arc(bx, rowY, r, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(28, 36, 48, 0.75)";
      ctx.fill();
      ctx.fillStyle = hexToRgba(CARGO[cargo].color, 0.55);
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = "rgba(238, 231, 218, 0.6)";
      ctx.stroke();
      const img = getBubbleImage(cargo);
      if (img.complete && img.naturalWidth > 0) {
        const s = r * 1.3;
        ctx.drawImage(img, bx - s / 2, rowY - s / 2, s, s);
      }
    });
  }
}

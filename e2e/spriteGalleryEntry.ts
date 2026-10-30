/** Bundled by `phase70.spec.ts` (esbuild) and run in the page: lays out every top-down map sprite
 * (all locomotive models, then the car types by era) at zoom 2 using the real cached sprites. */
import type { CargoType } from "../src/data/cargo";
import { LOCOMOTIVES, LOCO_LENGTH_TILES } from "../src/data/trains";
import { drawCarCached, drawLocoCached } from "../src/render/art/spriteCache";
import type { EraBucket } from "../src/render/art/livery";

const SIZE = 64; // zoom 2
const WIDTH_TILES = 7.2 / 32;
const CAR_LEN_TILES = 9 / 32;

const CARS: Array<[CargoType, boolean]> = [
  ["passengers", false],
  ["mail", false],
  ["coal", true],
  ["coal", false],
  ["ironOre", true],
  ["grain", true],
  ["oil", true],
  ["wood", true],
  ["wood", false],
  ["lumber", true],
  ["steel", true],
  ["livestock", true],
  ["goods", true],
  ["food", true],
  ["silverBars", true],
];

export function renderGallery(canvas: HTMLCanvasElement): void {
  const W = 800;
  const H = 230;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width = `${W}px`;
  canvas.style.height = `${H}px`;
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
  ctx.scale(dpr, dpr);
  ctx.fillStyle = "#9db86a";
  ctx.fillRect(0, 0, W, H);
  ctx.font = "8px sans-serif";
  ctx.textAlign = "center";
  const rail = (y: number, x0: number, x1: number): void => {
    ctx.fillStyle = "rgba(60,50,40,0.35)";
    ctx.fillRect(x0, y - 6, x1 - x0, 12);
    ctx.fillStyle = "rgba(60,60,64,0.8)";
    ctx.fillRect(x0, y - 4, x1 - x0, 1.2);
    ctx.fillRect(x0, y + 3, x1 - x0, 1.2);
  };
  LOCOMOTIVES.forEach((def, i) => {
    const col = i % 8;
    const row = Math.floor(i / 8);
    const cx = 50 + col * 100;
    const cy = 22 + row * 34;
    rail(cy, cx - 48, cx + 48);
    drawLocoCached(ctx, cx, cy, 0, SIZE, LOCO_LENGTH_TILES, WIDTH_TILES, def, dpr);
    ctx.fillStyle = "#1c2a14";
    ctx.fillText(def.id, cx, cy + 15);
  });
  const eras: EraBucket[] = ["early", "mid", "modern"];
  eras.forEach((era, r) => {
    const cy = 135 + r * 32;
    CARS.forEach(([cargo, loaded], i) => {
      const cx = 28 + i * 52.5;
      rail(cy, cx - 26, cx + 26);
      drawCarCached(ctx, cx, cy, 0, SIZE, CAR_LEN_TILES, WIDTH_TILES, cargo, era, loaded, dpr);
    });
    ctx.fillStyle = "#1c2a14";
    ctx.textAlign = "left";
    ctx.fillText(era, 2, cy - 11);
    ctx.textAlign = "center";
  });
}

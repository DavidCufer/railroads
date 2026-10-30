/** Cached offscreen top-down sprites (STYLE §7, §9.5). A vehicle is baked once per model / era /
 * load state / size bucket / quarter-turn of heading (the light is baked into the bevels, so it
 * follows the heading to the nearest 90 degrees) and then blitted rotated. The soft drop shadow is
 * a second cached image, blurred once and drawn offset down-right in screen space, so it ignores
 * the vehicle's rotation. Renderer-owned state only. */

import type { CargoType } from "../../data/cargo";
import type { LocomotiveDef } from "../../data/trains";
import { drawCarSprite, drawLocoSprite, setSpriteHeading } from "./mapSprites";
import type { EraBucket } from "./livery";

interface Baked {
  body: HTMLCanvasElement;
  /** Logical (CSS px) size of the baked canvases, centred on the vehicle. */
  w: number;
  h: number;
  /** Baked sprite size (tile px) the canvas was drawn at; actual size / this = blit scale. */
  baseSize: number;
}

const BUCKET_STEP = 1.12;
const MAX_ENTRIES = 600;
const bodies = new Map<string, Baked>();
const shadows = new Map<string, HTMLCanvasElement>();

function makeCanvas(w: number, h: number, dpr: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.ceil(w * dpr));
  c.height = Math.max(1, Math.ceil(h * dpr));
  return c;
}

function bake(
  len: number,
  width: number,
  size: number,
  quarter: number,
  dpr: number,
  draw: (ctx: CanvasRenderingContext2D) => void,
): Baked {
  const padX = width * 0.6;
  const padY = width * 1.25; // room for pantographs
  const w = len + padX * 2;
  const h = width + padY * 2;
  const canvas = makeCanvas(w, h, dpr);
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
  ctx.scale(canvas.width / w, canvas.height / h);
  ctx.translate(w / 2, h / 2);
  setSpriteHeading((quarter * Math.PI) / 2);
  draw(ctx);
  return { body: canvas, w, h, baseSize: size };
}

function shadowOf(key: string, b: Baked, dpr: number): HTMLCanvasElement {
  let sh = shadows.get(key);
  if (!sh) {
    sh = makeCanvas(b.w, b.h, dpr);
    const ctx = sh.getContext("2d") as CanvasRenderingContext2D;
    ctx.scale(sh.width / b.w, sh.height / b.h);
    ctx.filter = `blur(${Math.max(1, b.baseSize * 0.035)}px)`;
    ctx.drawImage(b.body, 0, 0, b.w, b.h);
    ctx.filter = "none";
    ctx.globalCompositeOperation = "source-in";
    ctx.fillStyle = "rgba(15, 14, 10, 0.42)";
    ctx.fillRect(0, 0, b.w, b.h);
    shadows.set(key, sh);
  }
  return sh;
}

function bucketOf(size: number): { bucket: number; baseSize: number } {
  const bucket = Math.round(Math.log(size / 32) / Math.log(BUCKET_STEP));
  return { bucket, baseSize: 32 * Math.pow(BUCKET_STEP, bucket) };
}

function quarterOf(angle: number): number {
  return (((Math.round(angle / (Math.PI / 2)) % 4) + 4) % 4) as number;
}

/** Zoom at which sprites gain their extra detail (STYLE §9.5: zoom >= 1.5, i.e. 48 px tiles). */
export const DETAIL_SIZE = 48;

function blit(
  ctx: CanvasRenderingContext2D,
  b: Baked,
  shadow: HTMLCanvasElement,
  x: number,
  y: number,
  angle: number,
  size: number,
): void {
  const k = size / b.baseSize;
  const off = Math.max(0.7, size * 0.04);
  ctx.save();
  ctx.translate(x + off * 0.8, y + off * 1.3);
  ctx.rotate(angle);
  ctx.scale(k, k);
  ctx.drawImage(shadow, -b.w / 2, -b.h / 2, b.w, b.h);
  ctx.restore();
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.scale(k, k);
  ctx.drawImage(b.body, -b.w / 2, -b.h / 2, b.w, b.h);
  ctx.restore();
}

function lookup(
  key: string,
  quarter: number,
  dpr: number,
  create: (quarter: number) => Baked,
): { baked: Baked; shadow: HTMLCanvasElement } {
  if (bodies.size > MAX_ENTRIES) {
    bodies.clear();
    shadows.clear();
  }
  const full = `${key}|q${quarter}`;
  let baked = bodies.get(full);
  if (!baked) {
    baked = create(quarter);
    bodies.set(full, baked);
  }
  return { baked, shadow: shadowOf(key, baked, dpr) };
}

export function drawLocoCached(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
  size: number,
  lenTiles: number,
  widthTiles: number,
  def: LocomotiveDef,
  dpr: number,
): void {
  const { bucket, baseSize } = bucketOf(size);
  const detail = baseSize >= DETAIL_SIZE;
  const key = `L|${def.id}|${detail ? 1 : 0}|${bucket}|${dpr}`;
  const q = quarterOf(angle);
  const { baked, shadow } = lookup(key, q, dpr, (quarter) =>
    bake(baseSize * lenTiles, baseSize * widthTiles, baseSize, quarter, dpr, (c) =>
      drawLocoSprite(c, baseSize * lenTiles, baseSize * widthTiles, baseSize, def, detail),
    ),
  );
  blit(ctx, baked, shadow, x, y, angle, size);
}

export function drawCarCached(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
  size: number,
  lenTiles: number,
  widthTiles: number,
  cargo: CargoType,
  era: EraBucket,
  loaded: boolean,
  dpr: number,
): void {
  const { bucket, baseSize } = bucketOf(size);
  const detail = baseSize >= DETAIL_SIZE;
  const key = `C|${cargo}|${era}|${loaded ? 1 : 0}|${detail ? 1 : 0}|${bucket}|${dpr}`;
  const q = quarterOf(angle);
  const { baked, shadow } = lookup(key, q, dpr, (quarter) =>
    bake(baseSize * lenTiles, baseSize * widthTiles, baseSize, quarter, dpr, (c) =>
      drawCarSprite(
        c,
        baseSize * lenTiles,
        baseSize * widthTiles,
        baseSize,
        cargo,
        era,
        loaded,
        detail,
      ),
    ),
  );
  blit(ctx, baked, shadow, x, y, angle, size);
}

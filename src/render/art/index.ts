/** Public API of the rolling-stock art module (STYLE §9.1): builder's-drawing side views of every
 * locomotive and car, cached as offscreen canvases keyed by id + height + devicePixelRatio. */

import type { CargoType } from "../../data/cargo";
import { locomotiveById, type LocomotiveDef } from "../../data/trains";
import { ctx2d, devicePixelRatioSafe, makeArtCanvas, type ArtCanvas } from "./canvas";
import { carWidth, drawCar } from "./cars";
import { drawPowerLoco, powerLayout } from "./diesel";
import type { Pen } from "./draw";
import { eraBucket, type EraBucket } from "./livery";
import { drawSteamLoco, steamLayout } from "./steam";
import { drawGround } from "./draw";

export { parseWhyte, wheelArrangementGlyph } from "./whyte";
export { eraBucket, type EraBucket } from "./livery";
export { setArtCanvasFactory } from "./canvas";

/** Art units per drawing height (u = height / ART_HEIGHT_UNITS). */
export const ART_HEIGHT_UNITS = 24;
/** Gap between coupled vehicles in art units. */
const COUPLER_GAP = 1.2;

export interface DrawOpts {
  /** Rail, ties and shadow under the vehicle (default true). */
  ground?: boolean;
}

/** Width of a locomotive drawing in art units (height is always 24). */
export function locoWidthUnits(def: LocomotiveDef): number {
  if (def.type === "steam") {
    const l = steamLayout(def);
    return l.maxX - l.minX;
  }
  return powerLayout(def).w;
}

export function carWidthUnits(cargo: CargoType, era: EraBucket): number {
  return carWidth(cargo, era);
}

function penFor(ctx: CanvasRenderingContext2D, x: number, y: number, height: number): Pen {
  const u = height / ART_HEIGHT_UNITS;
  ctx.translate(x, y);
  ctx.scale(u, u);
  return { ctx, u, ow: Math.min(0.5, 1 / Math.max(u, 0.5)) };
}

/** Draws `def` with its top-left at (x, y), `height` px tall; returns the drawn width in px. */
export function drawLocoSide(
  ctx: CanvasRenderingContext2D,
  def: LocomotiveDef,
  x: number,
  y: number,
  height: number,
  opts: DrawOpts = {},
): number {
  ctx.save();
  const p = penFor(ctx, x, y, height);
  const wUnits = locoWidthUnits(def);
  if (opts.ground !== false) drawGround(p, 0, wUnits);
  if (def.type === "steam") {
    const lay = steamLayout(def);
    ctx.translate(-lay.minX, 0);
    drawSteamLoco(p, def, lay);
  } else {
    drawPowerLoco(p, def, powerLayout(def));
  }
  ctx.restore();
  return wUnits * p.u;
}

export function drawCarSide(
  ctx: CanvasRenderingContext2D,
  cargo: CargoType,
  era: EraBucket,
  fill01: number,
  x: number,
  y: number,
  height: number,
  opts: DrawOpts = {},
): number {
  ctx.save();
  const p = penFor(ctx, x, y, height);
  const wUnits = carWidth(cargo, era);
  if (opts.ground !== false) drawGround(p, 0, wUnits);
  drawCar(p, cargo, era, Math.max(0, Math.min(1, fill01)));
  ctx.restore();
  return wUnits * p.u;
}

// --- cached canvases ---------------------------------------------------------------------------

const cache = new Map<string, ArtCanvas>();
export function artCacheSize(): number {
  return cache.size;
}
export function clearArtCache(): void {
  cache.clear();
}

function cached(
  key: string,
  wUnits: number,
  height: number,
  paint: (ctx: CanvasRenderingContext2D, scale: number) => void,
): ArtCanvas {
  const dpr = devicePixelRatioSafe();
  const k = `${key}@${height}x${dpr}`;
  const hit = cache.get(k);
  if (hit) return hit;
  const scale = dpr;
  const c = makeArtCanvas((wUnits * height * scale) / ART_HEIGHT_UNITS, height * scale);
  const ctx = ctx2d(c);
  paint(ctx, scale);
  cache.set(k, c);
  return c;
}

/** Canvas holding the locomotive drawing (CSS size = width × `height`; backing store × dpr). */
export function locoSideCanvas(def: LocomotiveDef, height: number): ArtCanvas {
  return cached(`loco:${def.id}`, locoWidthUnits(def), height, (ctx, s) => {
    drawLocoSide(ctx, def, 0, 0, height * s);
  });
}

export function carSideCanvas(
  cargo: CargoType,
  era: EraBucket,
  fill01: number,
  height: number,
): ArtCanvas {
  const fq = Math.round(Math.max(0, Math.min(1, fill01)) * 8) / 8;
  return cached(`car:${cargo}:${era}:${fq}`, carWidth(cargo, era), height, (ctx, s) => {
    drawCarSide(ctx, cargo, era, fq, 0, 0, height * s);
  });
}

export interface ConsistSpec {
  locoModelId: string;
  cars: ReadonlyArray<{ cargoType: CargoType; fill01: number }>;
  /** Calendar year (selects the car era bucket). */
  year: number;
}

/** Whole train side view: cars (rear, left) … locomotive (front, right), 1.2u couplers. */
export function consistSideCanvas(spec: ConsistSpec, height: number): ArtCanvas {
  const def = locomotiveById(spec.locoModelId);
  if (!def) throw new Error(`unknown locomotive ${spec.locoModelId}`);
  const era = eraBucket(spec.year);
  const fills = spec.cars.map((c) => Math.round(c.fill01 * 8) / 8);
  const key = `consist:${def.id}:${era}:${spec.cars.map((c, i) => `${c.cargoType}${fills[i]}`).join(",")}`;
  const widths = spec.cars.map((c) => carWidth(c.cargoType, era));
  const total = widths.reduce((a, b) => a + b + COUPLER_GAP, 0) + locoWidthUnits(def);
  return cached(key, total, height, (ctx, s) => {
    const h = height * s;
    const u = h / ART_HEIGHT_UNITS;
    const p: Pen = { ctx, u, ow: Math.min(0.5, 1 / Math.max(u, 0.5)) };
    ctx.save();
    ctx.scale(u, u);
    drawGround(p, 0, total);
    ctx.restore();
    let x = 0;
    spec.cars
      .slice()
      .reverse()
      .forEach((c, i) => {
        const idx = spec.cars.length - 1 - i;
        const w = drawCarSide(ctx, c.cargoType, era, fills[idx] as number, x * u, 0, h, {
          ground: false,
        });
        // 2px coupler between vehicles.
        ctx.fillStyle = "#2b2d31";
        ctx.fillRect(
          x * u + w - 0.2 * u,
          h * (20 / 24),
          (COUPLER_GAP + 0.4) * u,
          Math.max(1, 0.5 * u),
        );
        x += (widths[idx] as number) + COUPLER_GAP;
      });
    drawLocoSide(ctx, def, x * u, 0, h, { ground: false });
  });
}

/** Engraved-print drawing primitives for the locomotive art (Phase 49B): flat period colour, thin ink
 * outlines, fine hatching for shade instead of cartoon highlight bands. Units are art units (u = h/24). */

import { darken, lighten, type Pen } from "./draw";

export const INK = "#18140f";
const STEEL_LIGHT = "#C7C2B4";

/** Thin ink line width: about one device pixel but never heavier than a quarter unit. */
export function hair(p: Pen, k = 1): number {
  return Math.max(0.2, Math.min(0.3, p.ow * 0.8)) * k;
}

function luma(hex: string): number {
  const h = hex.length === 4 ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}` : hex;
  return (
    0.3 * parseInt(h.slice(1, 3), 16) +
    0.59 * parseInt(h.slice(3, 5), 16) +
    0.11 * parseInt(h.slice(5, 7), 16)
  );
}

export interface EngraveOpts {
  /** Hatch line spacing in units (default 0.55). 0 disables hatching. */
  hatch?: number;
  /** Skip the ink outline. */
  noInk?: boolean;
  /** Outline weight multiplier. */
  ink?: number;
}

/** Fills the path built by `build`, hatches the lower part (or, on near-black fills, the lit upper part),
 * then strokes a hairline ink outline. `b` is the path bounds [x, y, w, h]. */
export function engrave(
  p: Pen,
  fill: string,
  b: readonly [number, number, number, number],
  build: () => void,
  o: EngraveOpts = {},
): void {
  const { ctx } = p;
  const [x, y, w, h] = b;
  build();
  ctx.fillStyle = fill;
  ctx.fill();
  const sp = o.hatch ?? 0.55;
  if (sp > 0 && w > 0.8 && h > 0.8) {
    ctx.save();
    build();
    ctx.clip();
    const dark = luma(fill) < 70;
    // Soft tonal base: a pale top edge, a darker underside.
    ctx.fillStyle = dark ? lighten(fill, 0.1) : lighten(fill, 0.16);
    ctx.fillRect(x - 1, y - 1, w + 2, h * 0.2 + 1);
    ctx.strokeStyle = dark ? lighten(fill, 0.3) : darken(fill, 0.42);
    ctx.lineWidth = Math.max(0.1, hair(p) * 0.55);
    const y0 = dark ? y + h * 0.08 : y + h * 0.5;
    const y1 = dark ? y + h * 0.42 : y + h + 1;
    ctx.beginPath();
    ctx.rect(x - 1, y0, w + 2, y1 - y0);
    ctx.clip();
    ctx.beginPath();
    for (let t = -h - 1; t < w + 1; t += sp) {
      ctx.moveTo(x + t, y + h + 1);
      ctx.lineTo(x + t + h + 1, y - 1);
    }
    ctx.stroke();
    if (!dark) {
      // Cross-hatch the darkest quarter.
      ctx.beginPath();
      ctx.rect(x - 1, y + h * 0.78, w + 2, h * 0.3);
      ctx.clip();
      ctx.beginPath();
      for (let t = -1; t < w + h + 2; t += sp * 1.1) {
        ctx.moveTo(x + t, y + h + 1);
        ctx.lineTo(x + t - h - 1, y - 1);
      }
      ctx.stroke();
    }
    ctx.restore();
  }
  if (!o.noInk) {
    build();
    ctx.strokeStyle = INK;
    ctx.lineWidth = hair(p, o.ink ?? 1);
    ctx.lineJoin = "round";
    ctx.stroke();
  }
}

export function box(
  p: Pen,
  x: number,
  y: number,
  w: number,
  h: number,
  fill: string,
  o: EngraveOpts = {},
): void {
  engrave(
    p,
    fill,
    [x, y, w, h],
    () => {
      p.ctx.beginPath();
      p.ctx.rect(x, y, w, h);
    },
    o,
  );
}

export function poly(
  p: Pen,
  pts: ReadonlyArray<readonly [number, number]>,
  fill: string,
  o: EngraveOpts = {},
): void {
  const xs = pts.map((q) => q[0]);
  const ys = pts.map((q) => q[1]);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  engrave(
    p,
    fill,
    [x, y, Math.max(...xs) - x, Math.max(...ys) - y],
    () => {
      p.ctx.beginPath();
      pts.forEach(([a, c], i) => (i === 0 ? p.ctx.moveTo(a, c) : p.ctx.lineTo(a, c)));
      p.ctx.closePath();
    },
    o,
  );
}

/** Ink line (optionally coloured) of a given weight in hairlines. */
export function ink(
  p: Pen,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  k = 1,
  color: string = INK,
): void {
  const { ctx } = p;
  ctx.strokeStyle = color;
  ctx.lineWidth = hair(p, k);
  ctx.lineCap = "butt";
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

/** A bar (rod, beam) drawn as a ring of ink around a pale steel core. */
export function rod(
  p: Pen,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  width: number,
  core = "#8B8F94",
): void {
  const { ctx } = p;
  ctx.lineCap = "butt";
  ctx.strokeStyle = INK;
  ctx.lineWidth = width + hair(p) * 1.6;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.strokeStyle = core;
  ctx.lineWidth = width;
  ctx.stroke();
}

export function pin(p: Pen, x: number, y: number, r: number): void {
  const { ctx } = p;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = "#B8B6AE";
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = hair(p);
  ctx.stroke();
}

export interface EWheel {
  /** Rim (tyre) tone: a thin light ring. */
  rim?: string;
  /** Spoke tone. */
  spoke?: string;
  spokes?: number;
  /** Crank-pin angle for a counterweight crescent. */
  counterweight?: number;
  disc?: string;
}

/** A dark wheel with a thin light tyre, hairline spokes, ringed hub. */
export function wheel(p: Pen, cx: number, cy: number, r: number, s: EWheel = {}): void {
  const { ctx } = p;
  const disc = s.disc ?? "#24221F";
  const rim = s.rim ?? STEEL_LIGHT;
  const spoke = s.spoke ?? "#8E8A80";
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = disc;
  ctx.fill();
  if (s.counterweight !== undefined && r > 2.8) {
    const a = s.counterweight + Math.PI;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r * 0.8, a - 0.9, a + 0.9);
    ctx.closePath();
    ctx.fillStyle = "#34312C";
    ctx.fill();
    ctx.strokeStyle = "#5B574E";
    ctx.lineWidth = hair(p, 0.6);
    ctx.stroke();
  }
  const n = s.spokes ?? (r > 3 ? 14 : 8);
  ctx.strokeStyle = spoke;
  ctx.lineWidth = Math.max(0.14, r * 0.05);
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + 0.2;
    ctx.moveTo(cx + Math.cos(a) * r * 0.2, cy + Math.sin(a) * r * 0.2);
    ctx.lineTo(cx + Math.cos(a) * r * 0.86, cy + Math.sin(a) * r * 0.86);
  }
  ctx.stroke();
  // Thin light tyre, then the ink edge.
  ctx.beginPath();
  ctx.arc(cx, cy, r - Math.max(0.15, r * 0.07), 0, Math.PI * 2);
  ctx.strokeStyle = rim;
  ctx.lineWidth = Math.max(0.2, r * 0.09);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = INK;
  ctx.lineWidth = hair(p);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.22, 0, Math.PI * 2);
  ctx.fillStyle = "#5A564D";
  ctx.fill();
  ctx.strokeStyle = rim;
  ctx.lineWidth = hair(p, 0.7);
  ctx.stroke();
}

/** Row of tiny rivet dots along a horizontal line. */
export function rivets(p: Pen, x0: number, x1: number, y: number, color: string, step = 0.9): void {
  const { ctx } = p;
  ctx.fillStyle = color;
  for (let x = x0; x < x1; x += step) ctx.fillRect(x, y, 0.2, 0.2);
}

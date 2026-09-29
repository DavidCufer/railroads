/**
 * Shared top-down map drawing primitives (industries, cities, station improvements). Callers
 * `ctx.translate` + `ctx.scale` so **1 unit = 1 tile**; light comes from the upper left, so the upper
 * left roof half is lit and every object throws a soft shadow to the lower right. Render-only.
 */
import { shadeColor } from "./color";
import { rand } from "./rng";

export interface Paint {
  ctx: CanvasRenderingContext2D;
  /** Screen pixels per unit (tile). */
  t: number;
  /** One screen pixel in units. */
  px: number;
  /** Ridge lines, outlines. */
  detail: boolean;
  /** Texture courses, small props. */
  fine: boolean;
}

export const SHADOW = "rgba(24, 18, 10, 0.30)";
/** Shadow offset per unit of object height. */
export const SH_X = 0.05;
export const SH_Y = 0.065;

export function makePaint(ctx: CanvasRenderingContext2D, t: number): Paint {
  return { ctx, t, px: 1 / t, detail: t >= 20, fine: t >= 40 };
}

export function lighten(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgb(${Math.round(r + (255 - r) * k)}, ${Math.round(g + (255 - g) * k)}, ${Math.round(b + (255 - b) * k)})`;
}

export function darken(hex: string, k: number): string {
  return shadeColor(hex, k);
}

/** An irregular soft ground patch (dirt yard, cleared land): jittered ellipse with a darker rim. */
export function ground(
  p: Paint,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  color: string,
  jitter = 0.09,
): void {
  const { ctx } = p;
  const n = 18;
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const k = 1 + (rand() - 0.5) * 2 * jitter;
    pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
  }
  const trace = (dx: number, dy: number, scale: number): void => {
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const [x, y] = pts[i] as [number, number];
      const px = cx + (x - cx) * scale + dx;
      const py = cy + (y - cy) * scale + dy;
      const [nx, ny] = pts[(i + 1) % n] as [number, number];
      const mx = (px + cx + (nx - cx) * scale + dx) / 2;
      const my = (py + cy + (ny - cy) * scale + dy) / 2;
      if (i === 0) ctx.moveTo((px + mx) / 2, (py + my) / 2);
      ctx.quadraticCurveTo(px, py, mx, my);
    }
    ctx.closePath();
  };
  ctx.fillStyle = darken(color, 0.86);
  trace(0, 0, 1);
  ctx.fill();
  ctx.fillStyle = color;
  trace(-0.012, -0.012, 0.93);
  ctx.fill();
  if (p.fine) {
    // Gravel speckle.
    for (let i = 0; i < 26; i++) {
      const a = rand() * Math.PI * 2;
      const r = Math.sqrt(rand()) * 0.85;
      ctx.fillStyle = rand() < 0.5 ? "rgba(255,255,255,0.16)" : "rgba(0,0,0,0.13)";
      ctx.fillRect(cx + Math.cos(a) * rx * r, cy + Math.sin(a) * ry * r, p.px * 1.5, p.px * 1.5);
    }
  }
}

function shadowRect(p: Paint, x: number, y: number, w: number, h: number, height: number): void {
  p.ctx.fillStyle = SHADOW;
  p.ctx.fillRect(x + SH_X * height, y + SH_Y * height, w, h);
}

export interface RoofOptions {
  /** Ridge runs along x (halves top/bottom) or along y (halves left/right). */
  ridgeX?: boolean;
  /** Wall colour visible as a thin rim; defaults to a darkened roof. */
  wall?: string;
  /** Object height in tiles: scales the cast shadow. */
  height?: number;
  /** Suppress the cast shadow (roofs that merge with a bigger roof). */
  noShadow?: boolean;
}

/** A pitched roof from above: cast shadow, wall rim, lit upper-left half / shaded half, ridge. */
export function gable(
  p: Paint,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
  o: RoofOptions = {},
): void {
  const { ctx, px } = p;
  const ridgeX = o.ridgeX ?? true;
  const height = o.height ?? 1;
  if (!o.noShadow) shadowRect(p, x, y, w, h, height);
  const rim = Math.max(px * 1.2, 0.01);
  ctx.fillStyle = o.wall ?? darken(color, 0.55);
  ctx.fillRect(x - rim, y - rim, w + rim * 2, h + rim * 2);
  const lit = lighten(color, 0.22);
  const shade = darken(color, 0.72);
  if (ridgeX) {
    ctx.fillStyle = lit;
    ctx.fillRect(x, y, w, h / 2);
    ctx.fillStyle = shade;
    ctx.fillRect(x, y + h / 2, w, h / 2);
  } else {
    ctx.fillStyle = lit;
    ctx.fillRect(x, y, w / 2, h);
    ctx.fillStyle = shade;
    ctx.fillRect(x + w / 2, y, w / 2, h);
  }
  if (p.fine) {
    ctx.strokeStyle = "rgba(0, 0, 0, 0.13)";
    ctx.lineWidth = px * 0.8;
    ctx.beginPath();
    const step = 0.05;
    if (ridgeX) {
      for (let yy = y + step; yy < y + h - 0.01; yy += step) {
        if (Math.abs(yy - (y + h / 2)) < 0.02) continue;
        ctx.moveTo(x, yy);
        ctx.lineTo(x + w, yy);
      }
    } else {
      for (let xx = x + step; xx < x + w - 0.01; xx += step) {
        if (Math.abs(xx - (x + w / 2)) < 0.02) continue;
        ctx.moveTo(xx, y);
        ctx.lineTo(xx, y + h);
      }
    }
    ctx.stroke();
  }
  if (p.detail) {
    ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
    ctx.lineWidth = px * 1.2;
    ctx.beginPath();
    if (ridgeX) {
      ctx.moveTo(x, y + h / 2);
      ctx.lineTo(x + w, y + h / 2);
    } else {
      ctx.moveTo(x + w / 2, y);
      ctx.lineTo(x + w / 2, y + h);
    }
    ctx.stroke();
    ctx.strokeStyle = "rgba(20, 12, 6, 0.5)";
    ctx.lineWidth = px;
    ctx.strokeRect(x, y, w, h);
  }
}

/** A hipped roof: four sloping faces meeting at a short ridge (or a point for squares). */
export function hip(
  p: Paint,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
  o: RoofOptions = {},
): void {
  const { ctx, px } = p;
  const height = o.height ?? 1;
  if (!o.noShadow) shadowRect(p, x, y, w, h, height);
  const inset = Math.min(w, h) / 2;
  const cx0 = x + inset;
  const cx1 = x + w - inset;
  const cy = y + h / 2;
  const faces: Array<[Array<[number, number]>, string]> = [
    // top (lit), left (lit), right (shade), bottom (shade)
    [
      [
        [x, y],
        [x + w, y],
        [cx1, cy],
        [cx0, cy],
      ],
      lighten(color, 0.24),
    ],
    [
      [
        [x, y],
        [cx0, cy],
        [x, y + h],
      ],
      lighten(color, 0.1),
    ],
    [
      [
        [x + w, y],
        [x + w, y + h],
        [cx1, cy],
      ],
      darken(color, 0.72),
    ],
    [
      [
        [x, y + h],
        [cx0, cy],
        [cx1, cy],
        [x + w, y + h],
      ],
      darken(color, 0.62),
    ],
  ];
  for (const [pts, fill] of faces) {
    ctx.fillStyle = fill;
    ctx.beginPath();
    pts.forEach(([a, b], i) => (i === 0 ? ctx.moveTo(a, b) : ctx.lineTo(a, b)));
    ctx.closePath();
    ctx.fill();
  }
  if (p.detail) {
    ctx.strokeStyle = "rgba(20, 12, 6, 0.42)";
    ctx.lineWidth = px;
    ctx.beginPath();
    ctx.strokeRect(x, y, w, h);
    ctx.moveTo(x, y);
    ctx.lineTo(cx0, cy);
    ctx.moveTo(x + w, y);
    ctx.lineTo(cx1, cy);
    ctx.moveTo(x, y + h);
    ctx.lineTo(cx0, cy);
    ctx.moveTo(x + w, y + h);
    ctx.lineTo(cx1, cy);
    ctx.stroke();
  }
}

/** Flat (parapet) roof with lit top/left edges. */
export function flat(
  p: Paint,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
  height = 1,
): void {
  const { ctx, px } = p;
  shadowRect(p, x, y, w, h, height);
  ctx.fillStyle = darken(color, 0.72);
  ctx.fillRect(x - px, y - px, w + px * 2, h + px * 2);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
  if (p.detail) {
    ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
    ctx.fillRect(x, y, w, px * 1.4);
    ctx.fillRect(x, y, px * 1.4, h);
    ctx.fillStyle = "rgba(0, 0, 0, 0.22)";
    ctx.fillRect(x, y + h - px * 1.4, w, px * 1.4);
    ctx.fillRect(x + w - px * 1.4, y, px * 1.4, h);
  }
}

/** A round tank/silo from above: shadow, body, lit crown, roof rim. */
export function tank(p: Paint, cx: number, cy: number, r: number, color: string, height = 1): void {
  const { ctx, px } = p;
  ctx.fillStyle = SHADOW;
  ctx.beginPath();
  ctx.ellipse(cx + SH_X * height * 1.1, cy + SH_Y * height * 1.1, r, r * 0.97, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = darken(color, 0.72);
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = lighten(color, 0.14);
  ctx.beginPath();
  ctx.arc(cx - r * 0.12, cy - r * 0.14, r * 0.8, 0, Math.PI * 2);
  ctx.fill();
  if (p.detail) {
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = px * 1.2;
    ctx.beginPath();
    ctx.arc(cx - r * 0.12, cy - r * 0.14, r * 0.5, Math.PI * 1.05, Math.PI * 1.6);
    ctx.stroke();
    ctx.strokeStyle = "rgba(0,0,0,0.3)";
    ctx.lineWidth = px;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  }
}

/** A tall chimney/tower from above: a long shadow to the lower right and a ringed top. */
export function chimneyTop(
  p: Paint,
  cx: number,
  cy: number,
  r: number,
  length: number,
  color = "#4A4A50",
): void {
  const { ctx } = p;
  ctx.strokeStyle = SHADOW;
  ctx.lineCap = "round";
  ctx.lineWidth = r * 1.6;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + length * 0.6, cy + length * 0.8);
  ctx.stroke();
  ctx.lineCap = "butt";
  ctx.fillStyle = darken(color, 0.7);
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = lighten(color, 0.3);
  ctx.beginPath();
  ctx.arc(cx - r * 0.15, cy - r * 0.15, r * 0.62, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#17171A";
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.32, 0, Math.PI * 2);
  ctx.fill();
}

/** A heap (spoil, ore, sawdust, hay): layered mound, lit upper left, with a few glints. */
export function mound(p: Paint, cx: number, cy: number, r: number, color: string): void {
  const { ctx } = p;
  ctx.fillStyle = SHADOW;
  ctx.beginPath();
  ctx.ellipse(cx + r * 0.32, cy + r * 0.4, r * 1.05, r * 0.86, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = darken(color, 0.7);
  ctx.beginPath();
  ctx.ellipse(cx, cy, r, r * 0.84, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(cx - r * 0.1, cy - r * 0.12, r * 0.72, r * 0.58, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = lighten(color, 0.28);
  ctx.beginPath();
  ctx.ellipse(cx - r * 0.26, cy - r * 0.28, r * 0.34, r * 0.24, 0, 0, Math.PI * 2);
  ctx.fill();
  if (p.fine) {
    for (let i = 0; i < 9; i++) {
      const a = rand() * Math.PI * 2;
      const d = Math.sqrt(rand()) * 0.8;
      ctx.fillStyle = rand() < 0.5 ? lighten(color, 0.45) : darken(color, 0.55);
      ctx.fillRect(cx + Math.cos(a) * r * d, cy + Math.sin(a) * r * 0.8 * d, p.px * 2, p.px * 2);
    }
  }
}

/** Two-tone tree canopy with ground shadow. `tone` 0 = broadleaf, 1 = conifer. */
export function treeTop(p: Paint, cx: number, cy: number, r: number, tone = 0): void {
  const { ctx } = p;
  ctx.fillStyle = "rgba(16, 36, 16, 0.34)";
  ctx.beginPath();
  ctx.ellipse(cx + r * 0.5, cy + r * 0.6, r * 0.95, r * 0.8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = tone ? "#24503A" : "#2F5A3A";
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = tone ? "#3A6E4C" : "#4C7A3E";
  ctx.beginPath();
  ctx.arc(cx - r * 0.2, cy - r * 0.22, r * 0.66, 0, Math.PI * 2);
  ctx.fill();
  if (p.fine) {
    ctx.fillStyle = "rgba(255,255,220,0.2)";
    ctx.beginPath();
    ctx.arc(cx - r * 0.34, cy - r * 0.38, r * 0.24, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** A straight belt / pipe / rail with a soft shadow. */
export function line(
  p: Paint,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  width: number,
  color: string,
  shadow = true,
): void {
  const { ctx } = p;
  if (shadow) {
    ctx.strokeStyle = SHADOW;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(x0 + SH_X * 0.6, y0 + SH_Y * 0.6);
    ctx.lineTo(x1 + SH_X * 0.6, y1 + SH_Y * 0.6);
    ctx.stroke();
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
}

/** A short rail spur: ballast, ties, two rails; runs from (x0,y) to (x1,y) horizontally or vertically. */
export function spur(p: Paint, x0: number, y0: number, x1: number, y1: number, stop = true): void {
  const { ctx, px } = p;
  const horizontal = Math.abs(x1 - x0) >= Math.abs(y1 - y0);
  const len = Math.hypot(x1 - x0, y1 - y0);
  const ux = (x1 - x0) / len;
  const uy = (y1 - y0) / len;
  const nx = -uy;
  const ny = ux;
  ctx.fillStyle = "rgba(112, 104, 92, 0.6)";
  ctx.beginPath();
  ctx.moveTo(x0 + nx * 0.085, y0 + ny * 0.085);
  ctx.lineTo(x1 + nx * 0.085, y1 + ny * 0.085);
  ctx.lineTo(x1 - nx * 0.085, y1 - ny * 0.085);
  ctx.lineTo(x0 - nx * 0.085, y0 - ny * 0.085);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#5A4634";
  ctx.lineWidth = px * 1.6;
  ctx.beginPath();
  for (let d = 0.03; d < len; d += 0.055) {
    const cx = x0 + ux * d;
    const cy = y0 + uy * d;
    ctx.moveTo(cx + nx * 0.07, cy + ny * 0.07);
    ctx.lineTo(cx - nx * 0.07, cy - ny * 0.07);
  }
  ctx.stroke();
  ctx.strokeStyle = "#C3C8D0";
  ctx.lineWidth = px * 1.3;
  ctx.beginPath();
  for (const s of [-0.04, 0.04]) {
    ctx.moveTo(x0 + nx * s, y0 + ny * s);
    ctx.lineTo(x1 + nx * s, y1 + ny * s);
  }
  ctx.stroke();
  if (stop) {
    ctx.fillStyle = "#B8452F";
    ctx.beginPath();
    ctx.moveTo(x1 + nx * 0.07, y1 + ny * 0.07);
    ctx.lineTo(x1 - nx * 0.07, y1 - ny * 0.07);
    ctx.lineTo(x1 - nx * 0.07 + ux * 0.03, y1 - ny * 0.07 + uy * 0.03);
    ctx.lineTo(x1 + nx * 0.07 + ux * 0.03, y1 + ny * 0.07 + uy * 0.03);
    ctx.closePath();
    ctx.fill();
  }
  void horizontal;
}

/** Log ends (round) or a log row (long rects). */
export function logPile(p: Paint, x: number, y: number, w: number, h: number, rows: number): void {
  const { ctx } = p;
  ctx.fillStyle = SHADOW;
  ctx.fillRect(x + 0.03, y + 0.04, w, h);
  const rh = h / rows;
  for (let i = 0; i < rows; i++) {
    const yy = y + i * rh;
    ctx.fillStyle = i % 2 ? "#6E4A2C" : "#83603B";
    ctx.beginPath();
    ctx.roundRect(x, yy, w, rh * 0.94, rh * 0.45);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.14)";
    ctx.fillRect(x + rh * 0.4, yy + rh * 0.12, w - rh * 0.9, rh * 0.2);
    ctx.fillStyle = "#DDBE8E";
    ctx.beginPath();
    ctx.arc(x + w - rh * 0.4, yy + rh * 0.47, rh * 0.3, 0, Math.PI * 2);
    ctx.fill();
  }
}

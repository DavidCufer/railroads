/** Small drawing helpers shared by the side-view painters. All coordinates are in "art units"
 * (u = height / 24) — the caller scales the context once. */

export interface Pen {
  ctx: CanvasRenderingContext2D;
  /** Pixels per art unit (already applied to the context transform). */
  u: number;
  /** Width of a 1-device-pixel outline, in art units. */
  ow: number;
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.length === 4 ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}` : hex;
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}

function toHex(n: number): string {
  return Math.max(0, Math.min(255, Math.round(n)))
    .toString(16)
    .padStart(2, "0");
}

/** Linear mix of two `#rrggbb` colours (t=0 → a, t=1 → b). */
export function mix(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  return `#${toHex(ar + (br - ar) * t)}${toHex(ag + (bg - ag) * t)}${toHex(ab + (bb - ab) * t)}`;
}
export const lighten = (c: string, t: number): string => mix(c, "#ffffff", t);
export const darken = (c: string, t: number): string => mix(c, "#000000", t);

export function rrectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

export function polyPath(
  ctx: CanvasRenderingContext2D,
  pts: ReadonlyArray<[number, number]>,
): void {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.closePath();
}

export interface ShadeOpts {
  /** Fraction of the height taken by the lighter top band. */
  hi?: number;
  /** Fraction of the height taken by the darker bottom band. */
  lo?: number;
  outline?: boolean;
}

/** Fills the current path with `color` plus a top-lit light band and a darker under band (clipped
 * to the path, bounds x,y,w,h), then a 1px darker outline. */
export function shadePath(
  p: Pen,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
  o: ShadeOpts = {},
): void {
  const { ctx } = p;
  const hi = o.hi ?? 0.3;
  const lo = o.lo ?? 0.24;
  ctx.save();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.clip();
  if (hi > 0) {
    ctx.fillStyle = lighten(color, 0.2);
    ctx.fillRect(x - 1, y - 1, w + 2, h * hi + 1);
  }
  if (lo > 0) {
    ctx.fillStyle = darken(color, 0.22);
    ctx.fillRect(x - 1, y + h * (1 - lo), w + 2, h * lo + 1);
  }
  ctx.restore();
  if (o.outline !== false) {
    ctx.strokeStyle = darken(color, 0.6);
    ctx.lineWidth = p.ow;
    ctx.stroke();
  }
}

export function shadedBox(
  p: Pen,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  color: string,
  o: ShadeOpts = {},
): void {
  rrectPath(p.ctx, x, y, w, h, r);
  shadePath(p, x, y, w, h, color, o);
}

export function shadedPoly(
  p: Pen,
  pts: ReadonlyArray<[number, number]>,
  color: string,
  o: ShadeOpts = {},
): void {
  polyPath(p.ctx, pts);
  const xs = pts.map((q) => q[0]);
  const ys = pts.map((q) => q[1]);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  shadePath(p, x, y, Math.max(...xs) - x, Math.max(...ys) - y, color, o);
}

export function line(
  p: Pen,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: string,
  width: number,
): void {
  const { ctx } = p;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = "butt";
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

export function disc(
  p: Pen,
  cx: number,
  cy: number,
  r: number,
  fill: string,
  stroke?: string,
): void {
  const { ctx } = p;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = p.ow;
    ctx.stroke();
  }
}

export interface WheelStyle {
  /** Disc / spoke tone. */
  wheel: string;
  /** Outer tyre edge colour. */
  tyre: string;
  spokes: number;
  hub: string;
  /** Crank-pin angle (radians) for the counterweight; undefined → no counterweight. */
  counterweight?: number;
}

/** Spoked wheel centred at (cx, cy): dark disc, spokes in the wheel tone, tyre ring, hub. */
export function drawWheel(p: Pen, cx: number, cy: number, r: number, s: WheelStyle): void {
  const { ctx } = p;
  const ground = darken(s.wheel, 0.68);
  disc(p, cx, cy, r, ground);
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  if (s.counterweight !== undefined) {
    const a = s.counterweight + Math.PI;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r * 0.82, a - 0.85, a + 0.85);
    ctx.closePath();
    ctx.fillStyle = s.wheel;
    ctx.fill();
  }
  ctx.strokeStyle = s.wheel;
  ctx.lineWidth = Math.max(p.ow, r * 0.09);
  for (let i = 0; i < s.spokes; i++) {
    const a = (i / s.spokes) * Math.PI * 2 + 0.2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    ctx.stroke();
  }
  ctx.restore();
  // Tyre ring.
  ctx.beginPath();
  ctx.arc(cx, cy, r - Math.max(0.2, r * 0.07), 0, Math.PI * 2);
  ctx.strokeStyle = s.tyre;
  ctx.lineWidth = Math.max(0.35, r * 0.13);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = darken(s.wheel, 0.75);
  ctx.lineWidth = p.ow;
  ctx.stroke();
  disc(p, cx, cy, Math.max(0.45, r * 0.17), s.hub, darken(s.hub, 0.5));
}

/** Rail head + tie row under the wheels at y = 23..24 spanning [x0, x1], and a soft shadow. */
export function drawGround(p: Pen, x0: number, x1: number): void {
  const { ctx } = p;
  ctx.fillStyle = "rgba(0, 0, 0, 0.16)";
  ctx.beginPath();
  ctx.ellipse((x0 + x1) / 2, 23.7, (x1 - x0) / 2, 0.55, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#6E5A45";
  for (let x = x0 + 0.5; x < x1; x += 2.6) ctx.fillRect(x, 23.55, 1.1, 0.45);
  ctx.fillStyle = "#8C9199";
  ctx.fillRect(x0, 23, x1 - x0, 0.6);
  ctx.fillStyle = "#4E535B";
  ctx.fillRect(x0, 23.6, x1 - x0, 0.15);
}

/** Deterministic pseudo-random in [0,1) from an integer seed (for specks). */
export function hash01(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** Closed path through `pts` with each corner rounded by up to `r` (arcTo joints). */
export function roundedPolyPath(
  ctx: CanvasRenderingContext2D,
  pts: ReadonlyArray<[number, number]>,
  r: number | number[],
): void {
  const n = pts.length;
  const rad = (i: number): number => (Array.isArray(r) ? (r[i] ?? 0) : r);
  const mid = (a: [number, number], b: [number, number]): [number, number] => [
    (a[0] + b[0]) / 2,
    (a[1] + b[1]) / 2,
  ];
  const start = mid(pts[n - 1] as [number, number], pts[0] as [number, number]);
  ctx.beginPath();
  ctx.moveTo(start[0], start[1]);
  for (let i = 0; i < n; i++) {
    const cur = pts[i] as [number, number];
    const nxt = pts[(i + 1) % n] as [number, number];
    const m = mid(cur, nxt);
    ctx.arcTo(cur[0], cur[1], m[0], m[1], rad(i));
  }
  ctx.closePath();
}

export function shadedRoundedPoly(
  p: Pen,
  pts: ReadonlyArray<[number, number]>,
  r: number | number[],
  color: string,
  o: ShadeOpts = {},
): void {
  roundedPolyPath(p.ctx, pts, r);
  const xs = pts.map((q) => q[0]);
  const ys = pts.map((q) => q[1]);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  shadePath(p, x, y, Math.max(...xs) - x, Math.max(...ys) - y, color, o);
}

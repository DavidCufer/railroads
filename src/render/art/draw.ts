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
  ctx.fillStyle = color;
  ctx.fill();
  // The hairline outline goes first: the clip and the hatch below reuse (and then replace) the context's path.
  if (o.outline !== false) {
    ctx.strokeStyle = "#18140f";
    ctx.lineWidth = Math.max(0.2, Math.min(0.3, p.ow * 0.8));
    ctx.lineJoin = "round";
    ctx.stroke();
  }
  ctx.save();
  ctx.clip();
  // Engraved-print shading (Phase 49B): a faint pale top edge, then fine diagonal hatching on the underside
  // instead of a solid dark band.
  if (hi > 0) {
    ctx.fillStyle = lighten(color, 0.12);
    ctx.fillRect(x - 1, y - 1, w + 2, h * hi * 0.6 + 1);
  }
  if (lo > 0 && w > 0.8 && h > 0.8) {
    const y0 = y + h * (1 - lo * 1.6);
    ctx.beginPath();
    ctx.rect(x - 1, y0, w + 2, y + h + 1 - y0);
    ctx.clip();
    ctx.strokeStyle = darken(color, 0.4);
    ctx.lineWidth = 0.09;
    ctx.beginPath();
    for (let t = -h - 1; t < w + 1; t += 0.5) {
      ctx.moveTo(x + t, y + h + 1);
      ctx.lineTo(x + t + h + 1, y - 1);
    }
    ctx.stroke();
  }
  ctx.restore();
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

/** Spoked wheel centred at (cx, cy): dark disc, hairline spokes, thin light tyre, ringed hub. */
export function drawWheel(p: Pen, cx: number, cy: number, r: number, s: WheelStyle): void {
  const { ctx } = p;
  const hair = Math.max(0.2, Math.min(0.3, p.ow * 0.8));
  disc(p, cx, cy, r, "#24221F");
  if (s.counterweight !== undefined) {
    const a = s.counterweight + Math.PI;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r * 0.8, a - 0.85, a + 0.85);
    ctx.closePath();
    ctx.fillStyle = "#34312C";
    ctx.fill();
  }
  ctx.strokeStyle = "#8E8A80";
  ctx.lineWidth = Math.max(0.14, r * 0.05);
  ctx.beginPath();
  for (let i = 0; i < s.spokes; i++) {
    const a = (i / s.spokes) * Math.PI * 2 + 0.2;
    ctx.moveTo(cx + Math.cos(a) * r * 0.2, cy + Math.sin(a) * r * 0.2);
    ctx.lineTo(cx + Math.cos(a) * r * 0.86, cy + Math.sin(a) * r * 0.86);
  }
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, r - Math.max(0.15, r * 0.07), 0, Math.PI * 2);
  ctx.strokeStyle = "#C7C2B4";
  ctx.lineWidth = Math.max(0.2, r * 0.09);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = "#18140f";
  ctx.lineWidth = hair;
  ctx.stroke();
  disc(p, cx, cy, Math.max(0.4, r * 0.2), "#5A564D", "#C7C2B4");
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

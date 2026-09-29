/** Smoke & steam particles for the map (STYLE §9.5). Renderer-owned, pooled, capped; positions in
 * world px so puffs stay put while the train moves on (a trail) and while the camera pans. */

export const MAX_SMOKE = 400;
/** Below this zoom no smoke is emitted or drawn. */
export const SMOKE_MIN_ZOOM = 0.75;
const LIFE_S = 0.8;

export type SmokeKind = "steam" | "wisp" | "haze";

const X = new Float32Array(MAX_SMOKE);
const Y = new Float32Array(MAX_SMOKE);
const VX = new Float32Array(MAX_SMOKE);
const VY = new Float32Array(MAX_SMOKE);
const AGE = new Float32Array(MAX_SMOKE);
const LIFE = new Float32Array(MAX_SMOKE);
const R0 = new Float32Array(MAX_SMOKE);
const A0 = new Float32Array(MAX_SMOKE);
const KIND = new Uint8Array(MAX_SMOKE);
let count = 0;
let seed = 12345;
const accum = new Map<number, number>();
let lastMs = -1;

function rnd(): number {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
}

export function smokeCount(): number {
  return count;
}

export function resetSmoke(): void {
  count = 0;
  accum.clear();
  lastMs = -1;
}

/** Real seconds since the previous call (clamped), driven by the renderer's clock. */
export function smokeFrameDt(nowMs: number): number {
  const dt = lastMs < 0 ? 0 : Math.min(0.1, Math.max(0, (nowMs - lastMs) / 1000));
  lastMs = nowMs;
  return dt;
}

export function updateSmoke(dt: number): void {
  for (let i = 0; i < count;) {
    AGE[i] = (AGE[i] as number) + dt;
    if ((AGE[i] as number) >= (LIFE[i] as number)) {
      // Swap-remove.
      const last = count - 1;
      X[i] = X[last] as number;
      Y[i] = Y[last] as number;
      VX[i] = VX[last] as number;
      VY[i] = VY[last] as number;
      AGE[i] = AGE[last] as number;
      LIFE[i] = LIFE[last] as number;
      R0[i] = R0[last] as number;
      A0[i] = A0[last] as number;
      KIND[i] = KIND[last] as number;
      count--;
      continue;
    }
    X[i] = (X[i] as number) + (VX[i] as number) * dt;
    Y[i] = (Y[i] as number) + (VY[i] as number) * dt;
    i++;
  }
}

function spawn(x: number, y: number, hx: number, hy: number, kind: SmokeKind): void {
  if (count >= MAX_SMOKE) return;
  const i = count++;
  X[i] = x;
  Y[i] = y;
  // Drift back along the track, plus a little scatter (world px / s).
  VX[i] = -hx * 3 + (rnd() - 0.3) * 6;
  VY[i] = -hy * 3 + (rnd() - 0.5) * 3 - 6;
  AGE[i] = 0;
  LIFE[i] = LIFE_S * (kind === "haze" ? 1.2 : 0.85 + rnd() * 0.3);
  R0[i] = kind === "steam" ? 1.3 : kind === "wisp" ? 1 : 1.6;
  A0[i] = kind === "steam" ? 0.5 : kind === "wisp" ? 0.25 : 0.12;
  KIND[i] = kind === "steam" ? 0 : kind === "wisp" ? 1 : 2;
}

/** Emits for one vehicle at `rate` particles per second. */
export function emitSmoke(
  key: number,
  dt: number,
  rate: number,
  worldX: number,
  worldY: number,
  headingX: number,
  headingY: number,
  kind: SmokeKind,
): void {
  const a = (accum.get(key) ?? 0) + rate * dt;
  let n = Math.floor(a);
  accum.set(key, a - n);
  while (n-- > 0) spawn(worldX, worldY, headingX, headingY, kind);
}

export function pruneSmokeEmitters(live: ReadonlySet<number>): void {
  for (const k of accum.keys()) if (!live.has(k)) accum.delete(k);
}

export function drawSmoke(
  ctx: CanvasRenderingContext2D,
  worldToScreen: (wx: number, wy: number) => { x: number; y: number },
  zoom: number,
): void {
  if (zoom < SMOKE_MIN_ZOOM) return;
  ctx.save();
  for (let i = 0; i < count; i++) {
    const t = (AGE[i] as number) / (LIFE[i] as number);
    const s = worldToScreen(X[i] as number, Y[i] as number);
    const r = (R0[i] as number) * (1 + t * 1.8) * zoom;
    ctx.globalAlpha = (A0[i] as number) * (1 - t) * (1 - t * 0.3);
    ctx.fillStyle = KIND[i] === 2 ? "#8E9198" : "#ECEAE4";
    ctx.beginPath();
    ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

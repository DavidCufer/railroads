/**
 * Deterministic fractal value noise, seeded from the game's RNG (no Math.random).
 * Used by the map generator for elevation and moisture fields.
 */
import { type RngState, nextInt } from "../rng";

export type Permutation = Uint16Array;

/** Builds a shuffled 0..255 permutation table using the seeded RNG (Fisher–Yates). */
export function buildPermutation(rng: RngState): Permutation {
  const perm = new Uint16Array(256);
  for (let i = 0; i < 256; i++) perm[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = nextInt(rng, 0, i);
    const tmp = perm[i] as number;
    perm[i] = perm[j] as number;
    perm[j] = tmp;
  }
  return perm;
}

function hash(perm: Permutation, xi: number, yi: number): number {
  const a = perm[xi & 255] as number;
  const b = perm[(a + (yi & 255)) & 255] as number;
  return b / 255;
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

function valueNoise2D(perm: Permutation, x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const v00 = hash(perm, xi, yi);
  const v10 = hash(perm, xi + 1, yi);
  const v01 = hash(perm, xi, yi + 1);
  const v11 = hash(perm, xi + 1, yi + 1);
  const u = smoothstep(xf);
  const v = smoothstep(yf);
  const top = v00 + (v10 - v00) * u;
  const bottom = v01 + (v11 - v01) * u;
  return (top + (bottom - top) * v) * 2 - 1; // [-1, 1]
}

/** Fractal (fBm) sum of `octaves` layers of value noise, normalized to roughly [-1, 1]. */
export function fractalNoise2D(
  perm: Permutation,
  x: number,
  y: number,
  octaves: number,
  persistence: number,
  lacunarity: number,
  scale: number,
): number {
  let amplitude = 1;
  let frequency = 1 / scale;
  let sum = 0;
  let max = 0;
  for (let o = 0; o < octaves; o++) {
    sum += valueNoise2D(perm, x * frequency, y * frequency) * amplitude;
    max += amplitude;
    amplitude *= persistence;
    frequency *= lacunarity;
  }
  return max > 0 ? sum / max : 0;
}

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

export function clamp01(v: number): number {
  return clamp(v, 0, 1);
}

export { smoothstep };

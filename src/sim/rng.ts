/**
 * Deterministic seeded PRNG (sfc32), seeded from a 32-bit integer via xmur3.
 * The only source of randomness allowed in src/sim/** — never Math.random().
 */

export interface RngState {
  a: number;
  b: number;
  c: number;
  d: number;
}

function xmur3(seed: number): () => number {
  let h = 1779033703 ^ seed;
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

export function createRng(seed: number): RngState {
  const gen = xmur3(seed >>> 0);
  return { a: gen(), b: gen(), c: gen(), d: gen() };
}

/** Returns a float in [0, 1) and advances the RNG state in place. */
export function nextFloat(state: RngState): number {
  const { a, b, c, d } = state;
  const t = (((a + b) | 0) + d) | 0;
  state.d = (d + 1) | 0;
  state.a = b ^ (b >>> 9);
  state.b = (c + (c << 3)) | 0;
  state.c = (c << 21) | (c >>> 11);
  state.c = (state.c + t) | 0;
  return (t >>> 0) / 4294967296;
}

/** Returns an integer in [min, max] inclusive. */
export function nextInt(state: RngState, min: number, max: number): number {
  return min + Math.floor(nextFloat(state) * (max - min + 1));
}

/** Picks a uniformly random element from a non-empty array. */
export function pick<T>(state: RngState, items: readonly T[]): T {
  if (items.length === 0) {
    throw new Error("pick: items must be non-empty");
  }
  const item = items[nextInt(state, 0, items.length - 1)];
  return item as T;
}

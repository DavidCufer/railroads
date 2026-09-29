/** Tiny deterministic per-tile RNG for baked map decoration: re-baking a terrain chunk (zoom change,
 * city growth) reproduces the same roofs/trees instead of shimmering into a new layout. Render-only. */
let state = 1;

/** Seeds the generator for one map tile. */
export function seedTile(x: number, y: number, salt = 0): void {
  state =
    (Math.imul(x + 1, 73856093) ^ Math.imul(y + 1, 19349663) ^ Math.imul(salt + 7, 83492791)) >>>
      0 || 1;
  rand();
  rand();
}

/** mulberry32 step, in [0, 1). */
export function rand(): number {
  state = (state + 0x6d2b79f5) >>> 0;
  let t = state;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

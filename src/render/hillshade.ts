/**
 * Directional hillshading from the continuous (pre-quantization) elevation field, light from the
 * NW (SPEC §10.3). Sampling is bilinear so the terrain renderer can shade at sub-tile resolution
 * instead of one flat brightness per tile.
 */
import type { GameMap } from "../sim/map/types";

const LIGHT_X = -Math.SQRT1_2;
const LIGHT_Y = -Math.SQRT1_2;
const SHADE_STRENGTH = 0.55;
const SLOPE_SAMPLE_DELTA = 0.4;

function elevationAtClamped(map: GameMap, x: number, y: number): number {
  const cx = Math.max(0, Math.min(map.width - 1, x));
  const cy = Math.max(0, Math.min(map.height - 1, y));
  return map.elevationRaw[cy * map.width + cx] as number;
}

/**
 * Bilinearly-interpolated elevation at fractional tile coordinates (fx, fy), where integer
 * coordinates land exactly on tile centers.
 */
export function bilinearElevation(map: GameMap, fx: number, fy: number): number {
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = fx - x0;
  const ty = fy - y0;
  const v00 = elevationAtClamped(map, x0, y0);
  const v10 = elevationAtClamped(map, x0 + 1, y0);
  const v01 = elevationAtClamped(map, x0, y0 + 1);
  const v11 = elevationAtClamped(map, x0 + 1, y0 + 1);
  const top = v00 + (v10 - v00) * tx;
  const bottom = v01 + (v11 - v01) * tx;
  return top + (bottom - top) * ty;
}

/** Brightness multiplier (around 1.0) at fractional tile coordinates (fx, fy). */
export function hillshadeFactorAt(map: GameMap, fx: number, fy: number): number {
  const d = SLOPE_SAMPLE_DELTA;
  const left = bilinearElevation(map, fx - d, fy);
  const right = bilinearElevation(map, fx + d, fy);
  const up = bilinearElevation(map, fx, fy - d);
  const down = bilinearElevation(map, fx, fy + d);
  const dzdx = (right - left) / (2 * d);
  const dzdy = (down - up) / (2 * d);
  const slope = dzdx * LIGHT_X + dzdy * LIGHT_Y;
  const factor = 1 + slope * SHADE_STRENGTH;
  return Math.max(0.55, Math.min(1.55, factor));
}

/** Brightness multiplier for a whole tile (its center) — used where sub-tile shading isn't worth it. */
export function hillshadeFactor(map: GameMap, x: number, y: number): number {
  return hillshadeFactorAt(map, x, y);
}

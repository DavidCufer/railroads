/** Simple directional hillshading from elevation deltas, light from the NW (SPEC §10.3). */
import { inBounds, tileIndex } from "../sim/map/grid";
import type { GameMap } from "../sim/map/types";

const LIGHT_X = -Math.SQRT1_2;
const LIGHT_Y = -Math.SQRT1_2;
const SHADE_STRENGTH = 0.12;

function elevationAtClamped(map: GameMap, x: number, y: number): number {
  const cx = Math.max(0, Math.min(map.width - 1, x));
  const cy = Math.max(0, Math.min(map.height - 1, y));
  return map.elevation[tileIndex(map, cx, cy)] as number;
}

/** Returns a brightness multiplier around 1.0 for the tile at (x, y). */
export function hillshadeFactor(map: GameMap, x: number, y: number): number {
  if (!inBounds(map, x, y)) return 1;
  const left = elevationAtClamped(map, x - 1, y);
  const right = elevationAtClamped(map, x + 1, y);
  const up = elevationAtClamped(map, x, y - 1);
  const down = elevationAtClamped(map, x, y + 1);
  const dzdx = (right - left) / 2;
  const dzdy = (down - up) / 2;
  const slope = dzdx * LIGHT_X + dzdy * LIGHT_Y;
  const factor = 1 + slope * SHADE_STRENGTH;
  return Math.max(0.75, Math.min(1.3, factor));
}

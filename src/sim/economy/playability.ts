/** Playability check (SPEC §4.2 step 6): at least 3 pairs of towns/cities within 15–30 tiles of
 * each other, reachable over land. */
import { DIRS8, inBounds, tileIndex } from "../map/grid";
import { terrainId } from "../map/terrain";
import type { GameMap } from "../map/types";
import type { City } from "./types";

const WATER_ID = terrainId("water");
const MIN_TILES = 15;
const MAX_TILES = 30;

/** Labels each land tile with its connected-component id (8-connected); water tiles get -1. */
function landComponents(map: GameMap): Int32Array {
  const labels = new Int32Array(map.width * map.height).fill(-1);
  let nextLabel = 0;
  const stack: number[] = [];

  for (let start = 0; start < map.terrain.length; start++) {
    if ((map.terrain[start] as number) === WATER_ID || labels[start] !== -1) continue;
    const label = nextLabel++;
    labels[start] = label;
    stack.push(start);
    while (stack.length > 0) {
      const idx = stack.pop() as number;
      const x = idx % map.width;
      const y = Math.floor(idx / map.width);
      for (const [dx, dy] of DIRS8) {
        const nx = x + dx;
        const ny = y + dy;
        if (!inBounds(map, nx, ny)) continue;
        const nIdx = tileIndex(map, nx, ny);
        if ((map.terrain[nIdx] as number) === WATER_ID || labels[nIdx] !== -1) continue;
        labels[nIdx] = label;
        stack.push(nIdx);
      }
    }
  }
  return labels;
}

/** Counts pairs of town-tier-or-above cities within [15, 30] tiles of each other, over land. */
export function countPlayablePairs(map: GameMap, cities: City[]): number {
  const labels = landComponents(map);
  const eligible = cities.filter((c) => c.tier !== "village");
  let pairs = 0;
  for (let i = 0; i < eligible.length; i++) {
    for (let j = i + 1; j < eligible.length; j++) {
      const a = eligible[i] as City;
      const b = eligible[j] as City;
      const dist = Math.hypot(a.anchorX - b.anchorX, a.anchorY - b.anchorY);
      if (dist < MIN_TILES || dist > MAX_TILES) continue;
      const aLabel = labels[tileIndex(map, a.anchorX, a.anchorY)];
      const bLabel = labels[tileIndex(map, b.anchorX, b.anchorY)];
      if (aLabel !== bLabel || aLabel === -1) continue;
      pairs++;
    }
  }
  return pairs;
}

/**
 * Converts real depression basins found by the priority flood into lakes (SPEC §4.2 step 3).
 * A depression is "real" once the fill raised it more than a small noise threshold; small ones
 * (< LAKE_MIN_AREA tiles) are left as land rather than becoming implausible 1–3 tile puddles.
 */
import { LAKE_FILL_THRESHOLD, LAKE_MIN_AREA } from "../../data/mapGen";
import { DIRS8, inBounds, tileIndex } from "./grid";
import { terrainId } from "./terrain";
import type { FloodFillResult } from "./flood";
import type { GameMap } from "./types";

const WATER_ID = terrainId("water");
const PLAIN_ID = terrainId("plain");

function fillAmountAt(map: GameMap, flood: FloodFillResult, idx: number): number {
  return (flood.filled[idx] as number) - (map.elevationRaw[idx] as number);
}

export function fillLakes(map: GameMap, flood: FloodFillResult): void {
  const n = map.width * map.height;
  const visited = new Uint8Array(n);

  for (let start = 0; start < n; start++) {
    if (visited[start] === 1) continue;
    if ((map.terrain[start] as number) === WATER_ID) {
      visited[start] = 1;
      continue;
    }
    visited[start] = 1;
    if (fillAmountAt(map, flood, start) <= LAKE_FILL_THRESHOLD) continue;

    // BFS the connected depression region: land tiles filled beyond the noise threshold.
    const region: number[] = [start];
    let head = 0;
    while (head < region.length) {
      const idx = region[head] as number;
      head++;
      const x = idx % map.width;
      const y = Math.floor(idx / map.width);
      for (const [dx, dy] of DIRS8) {
        const nx = x + dx;
        const ny = y + dy;
        if (!inBounds(map, nx, ny)) continue;
        const nIdx = tileIndex(map, nx, ny);
        if (visited[nIdx] === 1) continue;
        visited[nIdx] = 1;
        if ((map.terrain[nIdx] as number) === WATER_ID) continue;
        if (fillAmountAt(map, flood, nIdx) <= LAKE_FILL_THRESHOLD) continue;
        region.push(nIdx);
      }
    }

    if (region.length >= LAKE_MIN_AREA) {
      for (const idx of region) {
        map.terrain[idx] = WATER_ID;
        map.elevation[idx] = 0;
        map.riverFlow[idx] = 0;
      }
    }
  }
}

/**
 * Reclaims tiny (< LAKE_MIN_AREA) disconnected water components back to land. The sea-level
 * threshold step (elevation quantization) can independently scatter a few single/pair-tile
 * "puddles" that have nothing to do with `fillLakes`'s depression detection — this guarantees
 * the same "no water body smaller than LAKE_MIN_AREA, other than the sea" invariant regardless
 * of how a small body was created.
 */
export function removeTinyWaterBodies(map: GameMap): void {
  const n = map.width * map.height;
  const visited = new Uint8Array(n);
  const components: number[][] = [];

  for (let start = 0; start < n; start++) {
    if (visited[start] === 1 || (map.terrain[start] as number) !== WATER_ID) continue;
    const region: number[] = [start];
    visited[start] = 1;
    let head = 0;
    while (head < region.length) {
      const idx = region[head] as number;
      head++;
      const x = idx % map.width;
      const y = Math.floor(idx / map.width);
      for (const [dx, dy] of DIRS8) {
        const nx = x + dx;
        const ny = y + dy;
        if (!inBounds(map, nx, ny)) continue;
        const nIdx = tileIndex(map, nx, ny);
        if (visited[nIdx] === 1 || (map.terrain[nIdx] as number) !== WATER_ID) continue;
        visited[nIdx] = 1;
        region.push(nIdx);
      }
    }
    components.push(region);
  }

  if (components.length <= 1) return; // no water, or a single body — nothing to reclaim
  components.sort((a, b) => b.length - a.length); // components[0] is treated as "the sea"

  for (let i = 1; i < components.length; i++) {
    const region = components[i] as number[];
    if (region.length >= LAKE_MIN_AREA) continue;
    for (const idx of region) {
      map.terrain[idx] = PLAIN_ID;
      map.elevation[idx] = 1;
    }
  }
}

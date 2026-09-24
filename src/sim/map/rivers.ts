/**
 * River carving (SPEC §4.2 step 3): sources at high elevation follow steepest descent to
 * water, carving `river` tiles; a path that gets stuck at a local minimum becomes a lake.
 */
import { nextInt, pick, type RngState } from "../rng";
import {
  RIVER_SOURCE_COUNT_MAX,
  RIVER_SOURCE_COUNT_MIN,
  RIVER_SOURCE_MIN_ELEVATION,
  RIVER_STUCK_LIMIT,
} from "../../data/mapGen";
import { DIRS8, inBounds, tileIndex } from "./grid";
import { terrainId, terrainName } from "./terrain";
import type { GameMap } from "./types";

const WATER_ID = terrainId("water");
const RIVER_ID = terrainId("river");

function makeLakeAt(map: GameMap, x: number, y: number): void {
  const idx = tileIndex(map, x, y);
  map.terrain[idx] = WATER_ID;
  map.elevation[idx] = 0;
  map.riverFlow[idx] = 0;
}

function carveOneRiver(map: GameMap, rng: RngState, startX: number, startY: number): void {
  const maxSteps = map.width + map.height;
  let x = startX;
  let y = startY;
  let stuck = 0;
  const visited = new Set<number>();

  for (let step = 0; step < maxSteps; step++) {
    const idx = tileIndex(map, x, y);
    if ((map.terrain[idx] as number) === WATER_ID) return; // reached the sea/an existing lake

    if (visited.has(idx)) {
      makeLakeAt(map, x, y);
      return;
    }
    visited.add(idx);

    if ((map.terrain[idx] as number) !== RIVER_ID) map.terrain[idx] = RIVER_ID;
    map.riverFlow[idx] = (map.riverFlow[idx] as number) + 1;

    const currentElev = map.elevation[idx] as number;
    let bestElev = currentElev;
    let bestNeighbors: Array<[number, number]> = [];
    for (const [dx, dy] of DIRS8) {
      const nx = x + dx;
      const ny = y + dy;
      if (!inBounds(map, nx, ny)) continue;
      const nElev = map.elevation[tileIndex(map, nx, ny)] as number;
      if (nElev < bestElev) {
        bestElev = nElev;
        bestNeighbors = [[nx, ny]];
      } else if (nElev === bestElev && bestElev < currentElev) {
        bestNeighbors.push([nx, ny]);
      }
    }

    if (bestNeighbors.length > 0) {
      const next = pick(rng, bestNeighbors);
      x = next[0];
      y = next[1];
      stuck = 0;
      continue;
    }

    // local minimum: no strictly lower neighbor
    stuck++;
    if (stuck > RIVER_STUCK_LIMIT) {
      makeLakeAt(map, x, y);
      return;
    }
    const escapeOptions: Array<[number, number]> = [];
    for (const [dx, dy] of DIRS8) {
      const nx = x + dx;
      const ny = y + dy;
      if (!inBounds(map, nx, ny)) continue;
      const nIdx = tileIndex(map, nx, ny);
      if (!visited.has(nIdx)) escapeOptions.push([nx, ny]);
    }
    if (escapeOptions.length === 0) {
      makeLakeAt(map, x, y);
      return;
    }
    const next = pick(rng, escapeOptions);
    x = next[0];
    y = next[1];
  }

  // exceeded the step budget without reaching water — settle into a lake here
  makeLakeAt(map, x, y);
}

export function carveRivers(map: GameMap, rng: RngState): void {
  const candidates: Array<[number, number]> = [];
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const idx = tileIndex(map, x, y);
      const elev = map.elevation[idx] as number;
      const terrain = terrainName(map.terrain[idx] as number);
      if (elev >= RIVER_SOURCE_MIN_ELEVATION && terrain !== "water") {
        candidates.push([x, y]);
      }
    }
  }
  if (candidates.length === 0) return;

  const count = Math.min(
    candidates.length,
    nextInt(rng, RIVER_SOURCE_COUNT_MIN, RIVER_SOURCE_COUNT_MAX),
  );
  const pool = [...candidates];
  for (let i = 0; i < count; i++) {
    const pickIndex = nextInt(rng, 0, pool.length - 1);
    const [sx, sy] = pool[pickIndex] as [number, number];
    pool.splice(pickIndex, 1);
    carveOneRiver(map, rng, sx, sy);
    if (pool.length === 0) break;
  }
}

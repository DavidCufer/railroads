/**
 * River carving (SPEC §4.2 step 3): each river follows the priority flood's `parent` pointers
 * (see ./flood.ts) downhill from a hills/mountains source to water. The filled field guarantees
 * a strictly-downhill path exists, so there is no random walk and no "stuck" case.
 */
import { nextInt, type RngState } from "../rng";
import {
  RIVER_MIN_LENGTH,
  RIVER_SOURCE_COUNT_MAX,
  RIVER_SOURCE_COUNT_MIN,
  RIVER_SOURCE_MIN_ELEVATION,
  RIVER_SOURCE_MIN_SPACING,
} from "../../data/mapGen";
import { tileIndex } from "./grid";
import { terrainId, terrainName } from "./terrain";
import type { GameMap } from "./types";

const WATER_ID = terrainId("water");
const RIVER_ID = terrainId("river");

export interface RiverInfo {
  /** Source tile (map x, y). */
  source: readonly [number, number];
  /** Number of land tiles carved into `river` terrain for this source (>= RIVER_MIN_LENGTH). */
  length: number;
}

interface TracedPath {
  /** Land tile indices from the source to (excluding) the terminus, in downstream order. */
  path: number[];
  /** The tile the path ends at: a water tile, or an existing river tile (a merge/confluence). */
  terminus: number;
  merged: boolean;
}

/** Follows `floodParent` downhill from `startIdx` until it reaches water or an existing river. */
function tracePath(map: GameMap, floodParent: Int32Array, startIdx: number): TracedPath | null {
  const maxSteps = map.width + map.height;
  const path: number[] = [];
  const visited = new Set<number>();
  let current = startIdx;

  for (let step = 0; step <= maxSteps; step++) {
    if (visited.has(current)) return null; // defensive: flood parents form a DAG rooted at water
    visited.add(current);

    const terrain = terrainName(map.terrain[current] as number);
    if (terrain === "water") return { path, terminus: current, merged: false };
    if (terrain === "river" && path.length > 0) return { path, terminus: current, merged: true };

    path.push(current);
    const parent = floodParent[current] as number;
    if (parent < 0 || parent === current) return null; // shouldn't happen — non-water flood root
    current = parent;
  }
  return null; // shouldn't happen given the flood fill's guarantees
}

function distance(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}

/** Deterministic in-place Fisher–Yates shuffle using the seeded RNG. */
function shuffle<T>(items: T[], rng: RngState): void {
  for (let i = items.length - 1; i > 0; i--) {
    const j = nextInt(rng, 0, i);
    const tmp = items[i] as T;
    items[i] = items[j] as T;
    items[j] = tmp;
  }
}

export function carveRivers(map: GameMap, rng: RngState, floodParent: Int32Array): RiverInfo[] {
  const candidates: Array<[number, number]> = [];
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const idx = tileIndex(map, x, y);
      const elev = map.elevation[idx] as number;
      if (elev >= RIVER_SOURCE_MIN_ELEVATION && (map.terrain[idx] as number) !== WATER_ID) {
        candidates.push([x, y]);
      }
    }
  }
  if (candidates.length === 0) return [];

  shuffle(candidates, rng);
  const targetCount = nextInt(rng, RIVER_SOURCE_COUNT_MIN, RIVER_SOURCE_COUNT_MAX);
  const rivers: RiverInfo[] = [];
  const acceptedSources: Array<[number, number]> = [];

  for (const [sx, sy] of candidates) {
    if (rivers.length >= targetCount) break;
    if (acceptedSources.some(([ax, ay]) => distance(sx, sy, ax, ay) < RIVER_SOURCE_MIN_SPACING)) {
      continue;
    }

    const startIdx = tileIndex(map, sx, sy);
    const startTerrainId = map.terrain[startIdx] as number;
    if (startTerrainId === WATER_ID || startTerrainId === RIVER_ID) continue; // swallowed already

    const traced = tracePath(map, floodParent, startIdx);
    if (!traced || traced.path.length < RIVER_MIN_LENGTH) continue;

    for (let i = 0; i < traced.path.length; i++) {
      const idx = traced.path[i] as number;
      map.terrain[idx] = RIVER_ID;
      map.riverFlow[idx] = (map.riverFlow[idx] as number) + 1;
      map.riverNext[idx] =
        i + 1 < traced.path.length ? (traced.path[i + 1] as number) : traced.terminus;
    }

    if (traced.merged) {
      // This tributary's flow also carries downstream through the river it just joined.
      let t = traced.terminus;
      while ((map.terrain[t] as number) === RIVER_ID) {
        map.riverFlow[t] = (map.riverFlow[t] as number) + 1;
        t = map.riverNext[t] as number;
      }
    }

    acceptedSources.push([sx, sy]);
    rivers.push({ source: [sx, sy], length: traced.path.length });
  }

  return rivers;
}

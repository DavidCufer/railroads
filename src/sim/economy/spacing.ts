/**
 * Industry spacing (PLAN Phase 24A): an industry keeps `INDUSTRY_MIN_CITY_DISTANCE` tiles from every
 * city footprint tile (ports excepted) and `INDUSTRY_MIN_GAP_TILES` empty tiles from every other
 * industry, so there is always room for a station and track. Pure and deterministic.
 */
import {
  INDUSTRIES,
  INDUSTRY_MIN_CITY_DISTANCE,
  INDUSTRY_MIN_GAP_TILES,
  INDUSTRY_NUDGE_MAX_RADIUS,
  type IndustryType,
} from "../../data/industries";
import { inBounds, tileIndex } from "../map/grid";
import { terrainId, TERRAIN_TYPES as TERRAIN_NAMES } from "../map/terrain";
import type { GameMap } from "../map/types";
import type { Industry } from "./types";

const WATER_ID = terrainId("water");
const MOUNTAIN_ID = terrainId("mountain");

/** Marks every tile within `INDUSTRY_MIN_CITY_DISTANCE` of a city footprint tile. */
export function cityBufferMask(map: GameMap, cityTiles: Iterable<number>): Uint8Array {
  const mask = new Uint8Array(map.width * map.height);
  const r = Math.ceil(INDUSTRY_MIN_CITY_DISTANCE);
  for (const t of cityTiles) {
    const cx = t % map.width;
    const cy = Math.floor(t / map.width);
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.hypot(dx, dy) >= INDUSTRY_MIN_CITY_DISTANCE) continue;
        const x = cx + dx;
        const y = cy + dy;
        if (inBounds(map, x, y)) mask[tileIndex(map, x, y)] = 1;
      }
    }
  }
  return mask;
}

/** All tiles of the city footprints on `map` (founded cities only) plus `extra`. */
export function allCityTiles(map: GameMap, extra: readonly number[] = []): number[] {
  const out: number[] = [...extra];
  for (let i = 0; i < map.cityId.length; i++) if ((map.cityId[i] as number) !== -1) out.push(i);
  return out;
}

/** True if a tile is within the minimum gap of some industry in `others`. */
export function tooCloseToIndustry(
  x: number,
  y: number,
  others: readonly { x: number; y: number }[],
  self?: unknown,
): boolean {
  for (const o of others) {
    if (o === self) continue;
    if (Math.max(Math.abs(o.x - x), Math.abs(o.y - y)) <= INDUSTRY_MIN_GAP_TILES) return true;
  }
  return false;
}

/** True if `type` may stand at (x, y) as far as city distance goes. */
export function cityDistanceOk(
  mask: Uint8Array,
  map: GameMap,
  type: IndustryType,
  idx: number,
): boolean {
  return type === "port" || (mask[idx] as number) === 0;
}

function touchesWater(map: GameMap, x: number, y: number): boolean {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (
        inBounds(map, x + dx, y + dy) &&
        (map.terrain[tileIndex(map, x + dx, y + dy)] as number) === WATER_ID
      )
        return true;
    }
  }
  return false;
}

export interface SpacingOptions {
  /** Region maps keep every hand-placed industry: violators are nudged, never dropped, and may
   * settle on terrain other than their usual one. */
  keepExisting?: boolean;
}

/**
 * Nudges every industry that violates the spacing rules to the nearest tile (within
 * `INDUSTRY_NUDGE_MAX_RADIUS`) that satisfies them, on terrain valid for its type. An industry that
 * cannot be moved is dropped on generated maps and kept on region maps. Updates `map.industryId`
 * for moved/dropped industries (ids are left as they are; callers renumber). Returns the survivors.
 */
export function enforceIndustrySpacing(
  map: GameMap,
  cityMask: Uint8Array,
  industries: readonly Industry[],
  options: SpacingOptions = {},
): Industry[] {
  const work = industries.map((i) => ({ ...i }));
  const dropped = new Set<Industry>();
  for (const ind of work) {
    const idx = ind.y * map.width + ind.x;
    const others = work.filter((o) => o !== ind && !dropped.has(o));
    if (cityDistanceOk(cityMask, map, ind.type, idx) && !tooCloseToIndustry(ind.x, ind.y, others))
      continue;

    const def = INDUSTRIES[ind.type];
    const terrainOk = (tIdx: number, strict: boolean): boolean => {
      const t = map.terrain[tIdx] as number;
      if (t === WATER_ID) return false;
      const isTerrainKind = def.placement.kind === "terrain";
      if (t === MOUNTAIN_ID) {
        if (!isTerrainKind) return false;
        if (
          strict &&
          !(def.placement as { terrain: readonly string[] }).terrain.includes("mountain")
        )
          return false;
      }
      if (strict && isTerrainKind)
        return (def.placement as { terrain: readonly string[] }).terrain.includes(
          TERRAIN_NAMES[t] as string,
        );
      return true;
    };
    const search = (strict: boolean): number | undefined => {
      let best: number | undefined;
      let bestD = Infinity;
      const r = INDUSTRY_NUDGE_MAX_RADIUS;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const d = Math.hypot(dx, dy);
          if (d > r || d >= bestD) continue;
          const x = ind.x + dx;
          const y = ind.y + dy;
          if (!inBounds(map, x, y)) continue;
          const t = tileIndex(map, x, y);
          if (t !== idx && (map.industryId[t] as number) !== -1) continue;
          if (map.cityId[t] !== -1) continue;
          if (!terrainOk(t, strict)) continue;
          if (ind.type === "port" && !touchesWater(map, x, y)) continue;
          if (!cityDistanceOk(cityMask, map, ind.type, t)) continue;
          if (tooCloseToIndustry(x, y, others)) continue;
          best = t;
          bestD = d;
        }
      }
      return best;
    };
    const target = search(true) ?? (options.keepExisting ? search(false) : undefined);
    if (target === undefined) {
      if (options.keepExisting) continue;
      map.industryId[idx] = -1;
      dropped.add(ind);
      continue;
    }
    map.industryId[idx] = -1;
    ind.x = target % map.width;
    ind.y = Math.floor(target / map.width);
    map.industryId[target] = ind.id;
  }
  return work.filter((i) => !dropped.has(i));
}

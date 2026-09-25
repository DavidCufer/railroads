/** Places a region's industries: raw producers restricted to resource zones (SPEC §4.3 step 4),
 * then processors/ports near cities (reusing the random generator's city-based placer as-is). */
import { INDUSTRIES } from "../../src/data/industries";
import { placeProcessorsAndPorts } from "../../src/sim/economy/industries";
import type { City, Industry } from "../../src/sim/economy/types";
import { terrainId, terrainName } from "../../src/sim/map/terrain";
import type { GameMap } from "../../src/sim/map/types";
import { nextFloat, type RngState } from "../../src/sim/rng";
import { pointInAnyPolygon, projectPath, type TileXY } from "./geo";
import type { RegionDef } from "./regionDef";

const WATER_ID = terrainId("water");
const SAME_TYPE_SPACING = 6;

/** Raw producers placed by terrain affinity (SPEC §8.2) — processors/ports are placed near cities
 * instead, via the shared `placeProcessorsAndPorts`. */
const RAW_TYPES = ["coalMine", "ironMine", "loggingCamp", "farm", "ranch", "oilWell"] as const;

function distance(map: GameMap, a: number, b: number): number {
  const ax = a % map.width;
  const ay = Math.floor(a / map.width);
  const bx = b % map.width;
  const by = Math.floor(b / map.width);
  return Math.hypot(ax - bx, ay - by);
}

function candidateTiles(
  map: GameMap,
  terrainFilter: readonly string[],
  zonePolys: TileXY[][] | null,
): number[] {
  const out: number[] = [];
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const idx = y * map.width + x;
      const t = map.terrain[idx] as number;
      if (t === WATER_ID) continue;
      if (!terrainFilter.includes(terrainName(t))) continue;
      if (map.cityId[idx] !== -1) continue;
      if (zonePolys && !pointInAnyPolygon(x + 0.5, y + 0.5, zonePolys)) continue;
      out.push(idx);
    }
  }
  return out;
}

function chooseSpaced(map: GameMap, rng: RngState, pool: number[], target: number): number[] {
  const scored = pool
    .map((idx) => ({ idx, score: nextFloat(rng) }))
    .sort((a, b) => b.score - a.score);
  const chosen: number[] = [];
  for (const c of scored) {
    if (chosen.length >= target) break;
    let farEnough = true;
    for (const other of chosen) {
      if (distance(map, c.idx, other) < SAME_TYPE_SPACING) {
        farEnough = false;
        break;
      }
    }
    if (farEnough) chosen.push(c.idx);
  }
  return chosen;
}

export function placeRegionIndustries(
  map: GameMap,
  rng: RngState,
  cities: City[],
  def: RegionDef,
): Industry[] {
  let counter = 0;
  const nextId = (): number => counter++;
  const placed: Industry[] = [];

  for (const type of RAW_TYPES) {
    const industryDef = INDUSTRIES[type];
    if (industryDef.era > def.startYear) continue;
    if (industryDef.placement.kind !== "terrain") continue;

    const zones = def.resourceZones.filter((z) => z.types.includes(type));
    const zonePolys =
      zones.length > 0 ? zones.map((z) => projectPath(def.bounds, z.polygon)) : null;
    const pool = candidateTiles(map, industryDef.placement.terrain, zonePolys);
    if (pool.length === 0) continue;
    const target = Math.max(2, Math.min(16, Math.round(pool.length / 25)));
    const chosen = chooseSpaced(map, rng, pool, target);
    for (const idx of chosen) {
      const id = nextId();
      map.industryId[idx] = id;
      placed.push({ id, type, x: idx % map.width, y: Math.floor(idx / map.width) });
    }
  }

  const foundedCities = cities.filter(
    (c) => c.foundingYear === undefined || c.foundingYear <= def.startYear,
  );
  const processed = placeProcessorsAndPorts(
    map,
    rng,
    foundedCities,
    map.industryId,
    nextId,
    def.startYear,
  );
  return [...placed, ...processed];
}

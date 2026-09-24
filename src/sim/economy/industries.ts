/**
 * Industry placement (SPEC §4.2 step 5, §8.2): raw producers by terrain affinity, then processors
 * near cities, ports on coastal cities. Gated by era: an industry whose `era` is after the game's
 * `startYear` isn't placed at generation (year-gated *appearance* over time is Phase 8's job).
 */
import { RESOURCE_DENSITY_MULT, type ResourceDensity } from "../../data/cities";
import { INDUSTRIES, INDUSTRY_TYPES, type IndustryType } from "../../data/industries";
import { inBounds, tileIndex } from "../map/grid";
import { terrainId, TERRAIN_TYPES as TERRAIN_NAMES, type Terrain } from "../map/terrain";
import type { GameMap } from "../map/types";
import { nextFloat, nextInt, type RngState } from "../rng";
import type { City, Industry } from "./types";

const WATER_ID = terrainId("water");
const MOUNTAIN_ID = terrainId("mountain");
const FOREST_ID = terrainId("forest");

/** Minimum spacing (tiles) between two raw producers of the same type. */
const SAME_TYPE_SPACING = 6;

function isBuildableLand(map: GameMap, idx: number): boolean {
  const t = map.terrain[idx] as number;
  return t !== WATER_ID && t !== MOUNTAIN_ID;
}

function tilesByTerrain(map: GameMap): Map<Terrain, number[]> {
  const byTerrain = new Map<Terrain, number[]>();
  for (let idx = 0; idx < map.terrain.length; idx++) {
    const t = map.terrain[idx] as number;
    if (t === WATER_ID) continue;
    const name = TERRAIN_NAMES[t] as Terrain;
    let arr = byTerrain.get(name);
    if (!arr) {
      arr = [];
      byTerrain.set(name, arr);
    }
    arr.push(idx);
  }
  return byTerrain;
}

function distance(map: GameMap, a: number, b: number): number {
  const ax = a % map.width;
  const ay = Math.floor(a / map.width);
  const bx = b % map.width;
  const by = Math.floor(b / map.width);
  return Math.hypot(ax - bx, ay - by);
}

function countForRawIndustry(map: GameMap, densityMult: number): number {
  const raw = Math.round((map.width * map.height) / 1800) * densityMult;
  return Math.max(2, Math.min(18, Math.round(raw)));
}

function placeRawProducers(
  map: GameMap,
  rng: RngState,
  industryId: Int16Array,
  nextId: () => number,
  resourceDensity: ResourceDensity,
  startYear: number,
): Industry[] {
  const byTerrain = tilesByTerrain(map);
  const placed: Industry[] = [];
  const densityMult = RESOURCE_DENSITY_MULT[resourceDensity];

  for (const type of INDUSTRY_TYPES) {
    const def = INDUSTRIES[type];
    if (def.placement.kind !== "terrain") continue;
    if (def.era > startYear) continue;

    const pool: number[] = [];
    for (const terrain of def.placement.terrain) {
      const tiles = byTerrain.get(terrain);
      if (tiles) pool.push(...tiles);
    }

    const scored = pool
      .filter((idx) => industryId[idx] === -1 && map.cityId[idx] === -1)
      .map((idx) => ({ idx, score: nextFloat(rng) }))
      .sort((a, b) => b.score - a.score);

    const target = countForRawIndustry(map, densityMult);
    const chosen: number[] = [];
    for (const c of scored) {
      if (chosen.length >= target) break;
      if (industryId[c.idx] !== -1) continue;
      let farEnough = true;
      for (const other of chosen) {
        if (distance(map, c.idx, other) < SAME_TYPE_SPACING) {
          farEnough = false;
          break;
        }
      }
      if (!farEnough) continue;
      chosen.push(c.idx);
    }

    for (const idx of chosen) {
      const id = nextId();
      industryId[idx] = id;
      placed.push({ id, type, x: idx % map.width, y: Math.floor(idx / map.width) });
    }
  }
  return placed;
}

/** Tiles within `maxDist` of any of `originIndices`, excluding water/mountain/already-claimed tiles. */
function tilesNear(
  map: GameMap,
  originIndices: number[],
  maxDist: number,
  industryId: Int16Array,
  extra?: (idx: number) => boolean,
): number[] {
  const seen = new Set<number>();
  const result: number[] = [];
  for (const origin of originIndices) {
    const ox = origin % map.width;
    const oy = Math.floor(origin / map.width);
    const r = Math.ceil(maxDist);
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.hypot(dx, dy) > maxDist) continue;
        const x = ox + dx;
        const y = oy + dy;
        if (!inBounds(map, x, y)) continue;
        const idx = tileIndex(map, x, y);
        if (seen.has(idx)) continue;
        seen.add(idx);
        if (!isBuildableLand(map, idx)) continue;
        if (map.cityId[idx] !== -1) continue;
        if (industryId[idx] !== -1) continue;
        if (extra && !extra(idx)) continue;
        result.push(idx);
      }
    }
  }
  return result;
}

function isNearForest(map: GameMap, idx: number, radius: number): boolean {
  const x = idx % map.width;
  const y = Math.floor(idx / map.width);
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      if (!inBounds(map, nx, ny)) continue;
      if ((map.terrain[tileIndex(map, nx, ny)] as number) === FOREST_ID) return true;
    }
  }
  return false;
}

const PROCESSOR_SLOTS: Record<string, number> = {
  village: 0,
  town: 1,
  city: 2,
  metropolis: 4,
};

function placeProcessorsAndPorts(
  map: GameMap,
  rng: RngState,
  cities: City[],
  industryId: Int16Array,
  nextId: () => number,
  startYear: number,
): Industry[] {
  const placed: Industry[] = [];
  const processorTypes: IndustryType[] = INDUSTRY_TYPES.filter((t) => {
    const kind = INDUSTRIES[t].placement.kind;
    return kind === "nearCity" || kind === "nearForestOrCity";
  });

  const sortedCities = [...cities].sort((a, b) => b.population - a.population);
  for (const city of sortedCities) {
    const slots = PROCESSOR_SLOTS[city.tier] ?? 0;
    if (slots === 0) continue;
    const available = processorTypes.filter((t) => INDUSTRIES[t].era <= startYear);
    // Shuffle deterministically, then take up to `slots`.
    const shuffled = available
      .map((t) => ({ t, score: nextFloat(rng) }))
      .sort((a, b) => b.score - a.score)
      .map((s) => s.t);

    let placedCount = 0;
    for (const type of shuffled) {
      if (placedCount >= slots) break;
      const def = INDUSTRIES[type];
      if (def.placement.kind !== "nearCity" && def.placement.kind !== "nearForestOrCity") continue;
      const maxDist = def.placement.maxTilesFromCity;
      const extra =
        def.placement.kind === "nearForestOrCity"
          ? (idx: number): boolean => isNearForest(map, idx, maxDist)
          : undefined;
      let candidates = tilesNear(map, city.tiles, maxDist, industryId, extra);
      if (candidates.length === 0 && def.placement.kind === "nearForestOrCity") {
        // Fall back to "near city" alone if no forest is within range.
        candidates = tilesNear(map, city.tiles, maxDist, industryId);
      }
      if (candidates.length === 0) continue;
      const idx = candidates[nextInt(rng, 0, candidates.length - 1)] as number;
      const id = nextId();
      industryId[idx] = id;
      placed.push({ id, type, x: idx % map.width, y: Math.floor(idx / map.width) });
      placedCount++;
    }

    if (city.coastal && city.tier !== "village" && INDUSTRIES.port.era <= startYear) {
      const coastTiles = city.tiles.filter((idx) => {
        const x = idx % map.width;
        const y = Math.floor(idx / map.width);
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (!inBounds(map, nx, ny)) continue;
            if ((map.terrain[tileIndex(map, nx, ny)] as number) === WATER_ID) return true;
          }
        }
        return false;
      });
      // Ports sit just outside the city footprint on the coastline, not on a city tile itself.
      const portSites = tilesNear(
        map,
        coastTiles.length > 0 ? coastTiles : city.tiles,
        2,
        industryId,
      );
      if (portSites.length > 0) {
        const idx = portSites[nextInt(rng, 0, portSites.length - 1)] as number;
        const id = nextId();
        industryId[idx] = id;
        placed.push({ id, type: "port", x: idx % map.width, y: Math.floor(idx / map.width) });
      }
    }
  }
  return placed;
}

export interface PlaceIndustriesOptions {
  resourceDensity?: ResourceDensity;
}

export function placeIndustries(
  map: GameMap,
  rng: RngState,
  cities: City[],
  startYear: number,
  options: PlaceIndustriesOptions,
): Industry[] {
  let counter = 0;
  const nextId = (): number => counter++;
  const raw = placeRawProducers(
    map,
    rng,
    map.industryId,
    nextId,
    options.resourceDensity ?? "normal",
    startYear,
  );
  const processed = placeProcessorsAndPorts(map, rng, cities, map.industryId, nextId, startYear);
  return [...raw, ...processed];
}

/** City placement (SPEC §4.2 step 4): score, spacing, tiers, footprint growth, naming. */
import {
  CITY_MIN_SPACING,
  CITY_TIER_DEFS,
  CITY_COUNT_DENSITY,
  type CityCount,
  type CityTier,
} from "../../data/cities";
import { DIRS8, inBounds, tileIndex } from "../map/grid";
import { terrainId, terrainName } from "../map/terrain";
import type { GameMap } from "../map/types";
import { nextFloat, nextInt, type RngState } from "../rng";
import { generateCityNames } from "./names";
import type { City } from "./types";

const WATER_ID = terrainId("water");
const MOUNTAIN_ID = terrainId("mountain");
const RIVER_ID = terrainId("river");

const NEARBY_RADIUS = 3;

function isWater(map: GameMap, x: number, y: number): boolean {
  return (map.terrain[tileIndex(map, x, y)] as number) === WATER_ID;
}

function isBuildableLand(map: GameMap, x: number, y: number): boolean {
  const t = map.terrain[tileIndex(map, x, y)] as number;
  return t !== WATER_ID && t !== MOUNTAIN_ID;
}

/** True if a water tile exists within `radius` tiles (Chebyshev). */
function nearWater(map: GameMap, x: number, y: number, radius: number): boolean {
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      if (!inBounds(map, nx, ny)) continue;
      if (isWater(map, nx, ny)) return true;
    }
  }
  return false;
}

function nearRiver(map: GameMap, x: number, y: number, radius: number): boolean {
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      if (!inBounds(map, nx, ny)) continue;
      if ((map.terrain[tileIndex(map, nx, ny)] as number) === RIVER_ID) return true;
    }
  }
  return false;
}

/** Site score for founding a city here: flat, near river/coast (SPEC §4.2 step 4). */
function siteScore(map: GameMap, x: number, y: number): number {
  const terrain = terrainName(map.terrain[tileIndex(map, x, y)] as number);
  if (terrain === "water" || terrain === "mountain") return -Infinity;
  let score = 0;
  score += terrain === "plain" ? 3 : terrain === "desert" ? 1 : terrain === "hills" ? 0.5 : 0;
  if (terrain === "swamp") score -= 2;
  if (nearWater(map, x, y, NEARBY_RADIUS)) score += 4;
  if (nearRiver(map, x, y, NEARBY_RADIUS)) score += 3;
  return score;
}

function isCoastal(map: GameMap, city: City): boolean {
  for (const idx of city.tiles) {
    const x = idx % map.width;
    const y = Math.floor(idx / map.width);
    for (const [dx, dy] of DIRS8) {
      const nx = x + dx;
      const ny = y + dy;
      if (inBounds(map, nx, ny) && isWater(map, nx, ny)) return true;
    }
  }
  return false;
}

function targetCityCount(map: GameMap, cityCount: CityCount): number {
  const area = map.width * map.height;
  const raw = Math.round((area / 1000) * CITY_COUNT_DENSITY[cityCount]);
  return Math.max(4, Math.min(40, raw));
}

/** Assigns tiers by rank: 1-2 cities, ~15% towns, the rest villages (SPEC §4.2 step 4). */
function tierForRank(rank: number, total: number): CityTier {
  const cityTierCount = total >= 6 ? 2 : 1;
  if (rank < cityTierCount) return "city";
  const townCount = Math.max(1, Math.round(total * 0.2));
  if (rank < cityTierCount + townCount) return "town";
  return "village";
}

/** Grows a city footprint outward from its anchor tile to `targetTiles` land tiles. */
function growFootprint(
  map: GameMap,
  rng: RngState,
  anchorX: number,
  anchorY: number,
  targetTiles: number,
  claimed: Uint8Array,
): number[] {
  const anchorIdx = tileIndex(map, anchorX, anchorY);
  const tiles = [anchorIdx];
  claimed[anchorIdx] = 1;
  const frontier: number[] = [];
  const pushNeighbors = (x: number, y: number): void => {
    for (const [dx, dy] of DIRS8) {
      const nx = x + dx;
      const ny = y + dy;
      if (!inBounds(map, nx, ny)) continue;
      const nIdx = tileIndex(map, nx, ny);
      if (claimed[nIdx] || !isBuildableLand(map, nx, ny)) continue;
      frontier.push(nIdx);
    }
  };
  pushNeighbors(anchorX, anchorY);

  while (tiles.length < targetTiles && frontier.length > 0) {
    // Pick a uniformly random frontier tile (dedup lazily: skip if claimed since it was queued).
    const pickIdx = nextInt(rng, 0, frontier.length - 1);
    const idx = frontier[pickIdx] as number;
    frontier.splice(pickIdx, 1);
    if (claimed[idx]) continue;
    claimed[idx] = 1;
    tiles.push(idx);
    const x = idx % map.width;
    const y = Math.floor(idx / map.width);
    pushNeighbors(x, y);
  }
  return tiles;
}

export interface PlaceCitiesOptions {
  cityCount?: CityCount;
}

export function placeCities(map: GameMap, rng: RngState, options: PlaceCitiesOptions): City[] {
  const target = targetCityCount(map, options.cityCount ?? "normal");
  const blockSize = 4;
  const blocksX = Math.ceil(map.width / blockSize);
  const blocksY = Math.ceil(map.height / blockSize);
  const candidates: { x: number; y: number; score: number }[] = [];

  for (let by = 0; by < blocksY; by++) {
    for (let bx = 0; bx < blocksX; bx++) {
      let best: { x: number; y: number; score: number } | null = null;
      for (let y = by * blockSize; y < Math.min(map.height, (by + 1) * blockSize); y++) {
        for (let x = bx * blockSize; x < Math.min(map.width, (bx + 1) * blockSize); x++) {
          const jitter = nextFloat(rng) * 0.5;
          const score = siteScore(map, x, y) + jitter;
          if (best === null || score > best.score) best = { x, y, score };
        }
      }
      if (best !== null && Number.isFinite(best.score)) candidates.push(best);
    }
  }
  candidates.sort((a, b) => b.score - a.score);

  const claimed = new Uint8Array(map.width * map.height);
  const anchors: { x: number; y: number }[] = [];
  for (const c of candidates) {
    if (anchors.length >= target) break;
    let farEnough = true;
    for (const a of anchors) {
      if (Math.hypot(a.x - c.x, a.y - c.y) < CITY_MIN_SPACING) {
        farEnough = false;
        break;
      }
    }
    if (!farEnough) continue;
    anchors.push({ x: c.x, y: c.y });
  }

  const names = generateCityNames(rng, anchors.length);
  const cities: City[] = [];
  for (let i = 0; i < anchors.length; i++) {
    const anchor = anchors[i] as { x: number; y: number };
    const tier = tierForRank(i, anchors.length);
    const tierDef = CITY_TIER_DEFS[tier];
    const targetTiles = nextInt(rng, tierDef.minTiles, tierDef.maxTiles);
    const tiles = growFootprint(map, rng, anchor.x, anchor.y, targetTiles, claimed);
    const population = nextInt(rng, tierDef.minPop, tierDef.maxPop);
    const city: City = {
      id: i,
      name: names[i] as string,
      tier,
      population,
      anchorX: anchor.x,
      anchorY: anchor.y,
      tiles,
      coastal: false,
    };
    city.coastal = isCoastal(map, city);
    cities.push(city);
  }

  for (const city of cities) {
    for (const idx of city.tiles) {
      map.cityId[idx] = city.id;
    }
  }

  return cities;
}

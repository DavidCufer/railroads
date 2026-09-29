/** Turns a committed region JSON (`src/data/regions/<id>.json`) into the same
 * `{map, cities, industries}` shape `generateMap` produces (SPEC §4.3), so `createGameState`
 * (src/sim/state.ts) can treat a real-world region and a random map identically from there on. */
import { ensureIndustryChains } from "../economy/chains";
import { createRng } from "../rng";
import type { GameMap } from "../map/types";
import type { City, Industry } from "../economy/types";
import { WORLD_SCALE } from "../../data/scale";
import { growFootprint } from "../economy/cities";
import { DIRS8, inBounds, tileIndex } from "../map/grid";
import { terrainId } from "../map/terrain";
import { decodeElevationRaw, decodeUint8 } from "./codec";
import { upsampleGrid } from "./upsample";
import type { RegionJson } from "./types";

/** A city whose `foundingYear` hasn't arrived yet at game start — applied by
 * src/sim/economy/founding.ts once the in-game year reaches it. */
export interface PendingCityFounding {
  cityId: number;
  year: number;
  tiles: number[];
  population: number;
  coastal: boolean;
}

export interface LoadedRegion {
  map: GameMap;
  cities: City[];
  industries: Industry[];
  pendingCityFoundings: PendingCityFounding[];
  startYear: number;
}

/** Minimum river flow (source) and per-step increase toward the mouth, purely cosmetic (render
 * width tapering) — mirrors the random generator's rivers looking thin near their source. */
/** Seed offset for the region chain-completion pass (kept fixed so regions load identically). */
const REGION_CHAIN_SEED = 0x1d5;
const WATER_ID = terrainId("water");
const RIVER_ID = terrainId("river");
const MOUNTAIN_ID = terrainId("mountain");
const RIVER_FLOW_BASE = 40;
const RIVER_FLOW_STEP = 10;
const RIVER_FLOW_MAX = 500;

/** Seed offset for the upsampled footprints of region cities. */
const REGION_CITY_SEED = 0x2c17;
/** How far (tiles) a hand-placed industry may be nudged to a valid tile after upsampling. */
const INDUSTRY_NUDGE_RADIUS = 8;

/** Nearest tile to (cx, cy) — in increasing distance order — that satisfies `ok`. */
function nearestTile(
  map: GameMap,
  cx: number,
  cy: number,
  maxRadius: number,
  ok: (idx: number) => boolean,
): number | undefined {
  let best: number | undefined;
  let bestD = Infinity;
  for (let dy = -maxRadius; dy <= maxRadius; dy++) {
    for (let dx = -maxRadius; dx <= maxRadius; dx++) {
      const x = Math.floor(cx) + dx;
      const y = Math.floor(cy) + dy;
      if (!inBounds(map, x, y)) continue;
      const d = Math.hypot(x - cx, y - cy);
      if (d >= bestD) continue;
      const idx = tileIndex(map, x, y);
      if (!ok(idx)) continue;
      best = idx;
      bestD = d;
    }
  }
  return best;
}

function touchesWater(map: GameMap, idx: number): boolean {
  const x = idx % map.width;
  const y = Math.floor(idx / map.width);
  return DIRS8.some(
    ([dx, dy]) =>
      inBounds(map, x + dx, y + dy) &&
      (map.terrain[tileIndex(map, x + dx, y + dy)] as number) === WATER_ID,
  );
}

/** Phase 23A: the committed JSON is on the old 10 km grid; the game map is `WORLD_SCALE`× finer. */
export function loadRegion(json: RegionJson): LoadedRegion {
  const srcSize = json.width * json.height;
  const up = upsampleGrid(
    {
      width: json.width,
      height: json.height,
      terrain: decodeUint8(json.terrainB64),
      elevation: decodeUint8(json.elevationB64),
      elevationRaw: decodeElevationRaw(json.elevationRawB64, srcSize),
      rivers: json.rivers,
    },
    json.seed,
  );
  const { width, height } = up;
  const size = width * height;
  const map: GameMap = {
    width,
    height,
    terrain: up.terrain,
    elevation: up.elevation,
    elevationRaw: up.elevationRaw,
    riverFlow: new Uint16Array(size),
    riverNext: new Int32Array(size).fill(-1),
    cityId: new Int16Array(size).fill(-1),
    industryId: new Int16Array(size).fill(-1),
  };

  for (const river of up.rivers) {
    for (let i = 0; i < river.length; i++) {
      const idx = river[i] as number;
      if ((map.terrain[idx] as number) !== WATER_ID) {
        map.terrain[idx] = RIVER_ID;
        const flow = Math.min(
          RIVER_FLOW_MAX,
          RIVER_FLOW_BASE + (i * RIVER_FLOW_STEP) / WORLD_SCALE,
        );
        map.riverFlow[idx] = Math.max(map.riverFlow[idx] as number, flow);
      }
      const next = river[i + 1];
      if (next !== undefined && (map.riverNext[idx] as number) === -1) map.riverNext[idx] = next;
    }
  }

  // Cities keep their size in tiles: the same tile count, regrown around the scaled anchor.
  const rng = createRng(REGION_CITY_SEED + json.seed);
  const claimed = new Uint8Array(size);
  const cities: City[] = [];
  const pendingCityFoundings: PendingCityFounding[] = [];
  for (const c of json.cities) {
    const alreadyFounded = c.foundingYear === undefined || c.foundingYear <= json.startYear;
    const cx = c.anchorX * WORLD_SCALE + (WORLD_SCALE - 1) / 2;
    const cy = c.anchorY * WORLD_SCALE + (WORLD_SCALE - 1) / 2;
    const free = (idx: number): boolean => {
      const t = map.terrain[idx] as number;
      return t !== WATER_ID && t !== MOUNTAIN_ID && !claimed[idx];
    };
    const anchorIdx =
      (c.coastal
        ? nearestTile(map, cx, cy, 4, (i) => free(i) && touchesWater(map, i))
        : undefined) ?? nearestTile(map, cx, cy, INDUSTRY_NUDGE_RADIUS, free);
    if (anchorIdx === undefined) throw new Error(`region ${json.id}: no land for ${c.name}`);
    const anchorX = anchorIdx % width;
    const anchorY = Math.floor(anchorIdx / width);
    const tiles = growFootprint(map, rng, anchorX, anchorY, Math.max(1, c.tiles.length), claimed);
    const coastal = tiles.some((t) => touchesWater(map, t));
    const city: City = {
      id: c.id,
      name: c.name,
      tier: c.tier,
      population: alreadyFounded ? c.population : 0,
      anchorX,
      anchorY,
      tiles: alreadyFounded ? tiles : [],
      coastal: alreadyFounded ? coastal : false,
      ...(c.foundingYear !== undefined ? { foundingYear: c.foundingYear } : {}),
    };
    cities.push(city);
    if (!alreadyFounded) {
      pendingCityFoundings.push({
        cityId: c.id,
        year: c.foundingYear as number,
        tiles,
        population: c.population,
        coastal,
      });
    } else {
      for (const idx of tiles) map.cityId[idx] = c.id;
    }
  }

  // Hand-placed industries keep their place (×WORLD_SCALE), nudged to the nearest free land tile —
  // ports to one touching the water.
  const handPlaced: Industry[] = [];
  for (const i of json.industries) {
    const free = (idx: number, allowMountain: boolean): boolean =>
      (map.terrain[idx] as number) !== WATER_ID &&
      (allowMountain || (map.terrain[idx] as number) !== MOUNTAIN_ID) &&
      !claimed[idx] &&
      (map.industryId[idx] as number) === -1;
    const cx = i.x * WORLD_SCALE + (WORLD_SCALE - 1) / 2;
    const cy = i.y * WORLD_SCALE + (WORLD_SCALE - 1) / 2;
    const find = (allowMountain: boolean): number | undefined =>
      (i.type === "port"
        ? nearestTile(
            map,
            cx,
            cy,
            INDUSTRY_NUDGE_RADIUS,
            (t) => free(t, allowMountain) && touchesWater(map, t),
          )
        : undefined) ??
      nearestTile(map, cx, cy, INDUSTRY_NUDGE_RADIUS, (t) => free(t, allowMountain));
    const idx = find(false) ?? find(true);
    if (idx === undefined) throw new Error(`region ${json.id}: no site for industry ${i.id}`);
    map.industryId[idx] = i.id;
    handPlaced.push({ id: i.id, type: i.type, x: idx % width, y: Math.floor(idx / width) });
  }
  // PLAN Phase 18 D: keep the hand-placed industries, but add any missing inputs nearby so every
  // processor has a working supply chain. Seeded from the region itself, so it is deterministic.
  const industries = ensureIndustryChains(
    map,
    createRng(REGION_CHAIN_SEED + json.startYear + width * height),
    cities,
    handPlaced,
    json.startYear,
    { keepExisting: true, extraCityTiles: pendingCityFoundings.flatMap((p) => p.tiles) },
  );

  return { map, cities, industries, pendingCityFoundings, startYear: json.startYear };
}

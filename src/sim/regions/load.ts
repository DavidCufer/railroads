/** Turns a committed region JSON (`src/data/regions/<id>.json`) into the same
 * `{map, cities, industries}` shape `generateMap` produces (SPEC §4.3), so `createGameState`
 * (src/sim/state.ts) can treat a real-world region and a random map identically from there on. */
import type { GameMap } from "../map/types";
import type { City, Industry } from "../economy/types";
import { decodeElevationRaw, decodeUint8 } from "./codec";
import type { RegionJson } from "./types";

/** A city whose `foundingYear` hasn't arrived yet at game start — applied by
 * src/sim/economy/founding.ts once the in-game year reaches it. */
export interface PendingCityFounding {
  cityId: number;
  year: number;
  tiles: number[];
  population: number;
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
const RIVER_FLOW_BASE = 40;
const RIVER_FLOW_STEP = 10;
const RIVER_FLOW_MAX = 500;

export function loadRegion(json: RegionJson): LoadedRegion {
  const { width, height } = json;
  const size = width * height;
  const map: GameMap = {
    width,
    height,
    terrain: decodeUint8(json.terrainB64),
    elevation: decodeUint8(json.elevationB64),
    elevationRaw: decodeElevationRaw(json.elevationRawB64, size),
    riverFlow: new Uint16Array(size),
    riverNext: new Int32Array(size).fill(-1),
    cityId: new Int16Array(size).fill(-1),
    industryId: new Int16Array(size).fill(-1),
  };

  for (const river of json.rivers) {
    for (let i = 0; i < river.length; i++) {
      const idx = river[i] as number;
      map.riverFlow[idx] = Math.min(RIVER_FLOW_MAX, RIVER_FLOW_BASE + i * RIVER_FLOW_STEP);
      const next = river[i + 1];
      if (next !== undefined) map.riverNext[idx] = next;
    }
  }

  const cities: City[] = [];
  const pendingCityFoundings: PendingCityFounding[] = [];
  for (const c of json.cities) {
    const alreadyFounded = c.foundingYear === undefined || c.foundingYear <= json.startYear;
    const city: City = {
      id: c.id,
      name: c.name,
      tier: c.tier,
      population: alreadyFounded ? c.population : 0,
      anchorX: c.anchorX,
      anchorY: c.anchorY,
      tiles: alreadyFounded ? c.tiles : [],
      coastal: alreadyFounded ? c.coastal : false,
      ...(c.foundingYear !== undefined ? { foundingYear: c.foundingYear } : {}),
    };
    cities.push(city);
    if (!alreadyFounded) {
      pendingCityFoundings.push({
        cityId: c.id,
        year: c.foundingYear as number,
        tiles: c.tiles,
        population: c.population,
      });
    } else {
      for (const idx of c.tiles) map.cityId[idx] = c.id;
    }
  }

  const industries: Industry[] = json.industries.map((i) => ({
    id: i.id,
    type: i.type,
    x: i.x,
    y: i.y,
  }));
  for (const industry of industries) {
    map.industryId[industry.y * width + industry.x] = industry.id;
  }

  return { map, cities, industries, pendingCityFoundings, startYear: json.startYear };
}

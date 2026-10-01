/**
 * Land and way-leave costs (Phase 30A, SPEC §9.5b item 8). A tile's price is the open-country rate times a multiplier
 * that rises with the density of nearby population, times the year's land index and the difficulty's land factor.
 * The density field is derived from the cities (cached per state, recomputed when they grow), never saved.
 */
import {
  LAND_BASE_PER_TILE,
  LAND_DENSITY_EXPONENT,
  LAND_DENSITY_REF,
  STATION_LAND_TILES,
  PASSING_LOOP_LAND_TILES,
  cityLandRadiusTiles,
  landYearIndex,
} from "../../data/economy";
import { DIFFICULTY } from "../../data/finance";
import type { StationType } from "../../data/stations";
import type { GameMap } from "../map/types";
import type { City } from "./types";
import type { GameState } from "../state";
import { calendarFromTicks } from "../time";

/** People per tile around each tile (all cities summed); the part of the price that depends on where it is. */
export function computeDensityField(map: GameMap, cities: readonly City[]): Float32Array {
  const field = new Float32Array(map.width * map.height);
  for (const city of cities) {
    if (city.population <= 0) continue;
    const radius = cityLandRadiusTiles(city.population);
    const reach = Math.ceil(radius * 2.2);
    const scale = city.population / (Math.PI * radius * radius);
    // centre: the mean of the footprint (the anchor can sit on the edge of a long city)
    let cx = city.anchorX;
    let cy = city.anchorY;
    if (city.tiles.length > 0) {
      cx = 0;
      cy = 0;
      for (const t of city.tiles) {
        cx += t % map.width;
        cy += Math.floor(t / map.width);
      }
      cx /= city.tiles.length;
      cy /= city.tiles.length;
    }
    for (
      let y = Math.max(0, Math.floor(cy) - reach);
      y <= Math.min(map.height - 1, Math.ceil(cy) + reach);
      y++
    ) {
      for (
        let x = Math.max(0, Math.floor(cx) - reach);
        x <= Math.min(map.width - 1, Math.ceil(cx) + reach);
        x++
      ) {
        const d2 = (x - cx) * (x - cx) + (y - cy) * (y - cy);
        field[y * map.width + x] =
          (field[y * map.width + x] as number) + scale * Math.exp(-d2 / (radius * radius));
      }
    }
  }
  return field;
}

/** Land price multiplier (≥ 1) for a density. */
export function landMultiplier(density: number): number {
  return 1 + Math.pow(density / LAND_DENSITY_REF, LAND_DENSITY_EXPONENT);
}

export interface LandPrices {
  /** Price of one tile of land at `tile` now, dollars. */
  priceAt(tile: number): number;
  /** Land price multiplier from nearby population only (1 = open country), for colouring and Help text. */
  multiplierAt(tile: number): number;
}

interface Cache {
  key: string;
  density: Float32Array;
}
const caches = new WeakMap<GameState, Cache>();

function citiesKey(state: GameState): string {
  let sum = 0;
  let tiles = 0;
  for (const c of state.cities) {
    sum += c.population;
    tiles += c.tiles.length;
  }
  return `${state.cities.length}:${sum}:${tiles}`;
}

/** The land price field of the current game (cheap after the first call until a city grows). */
export function landPrices(state: GameState): LandPrices {
  const key = citiesKey(state);
  let cache = caches.get(state);
  if (!cache || cache.key !== key) {
    cache = { key, density: computeDensityField(state.map, state.cities) };
    caches.set(state, cache);
  }
  const density = cache.density;
  const year = calendarFromTicks(state.startYear, state.ticks).year;
  const rate = LAND_BASE_PER_TILE * landYearIndex(year) * DIFFICULTY[state.difficulty].landMult;
  return {
    priceAt: (tile) => rate * landMultiplier(density[tile] ?? 0),
    multiplierAt: (tile) => landMultiplier(density[tile] ?? 0),
  };
}

/** Land bought for a station of `type` at `tile`. */
export function stationLandCost(land: LandPrices, type: StationType, tile: number): number {
  return land.priceAt(tile) * STATION_LAND_TILES[type];
}

export function passingLoopLandCost(land: LandPrices, tile: number): number {
  return land.priceAt(tile) * PASSING_LOOP_LAND_TILES;
}

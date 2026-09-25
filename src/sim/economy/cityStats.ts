/** Pure display stats derived from a city (SPEC §8.3) — no station coverage yet (Phase 5+). */
import type { CargoType } from "../../data/cargo";
import {
  CITY_MAIL_SUPPLY_DIVISOR,
  CITY_PASSENGER_SUPPLY_DIVISOR,
  type CityTier,
} from "../../data/cities";
import type { City } from "./types";

export interface CitySupply {
  passengers: number;
  mail: number;
}

/** Supply per month if fully covered by stations (SPEC §8.3, tuned — see cities.ts). */
export function citySupply(city: City): CitySupply {
  return {
    passengers: Math.round(city.population / CITY_PASSENGER_SUPPLY_DIVISOR),
    mail: Math.round(city.population / CITY_MAIL_SUPPLY_DIVISOR),
  };
}

/** Per-tile share of the city's monthly supply (SPEC §8.3: "split among covering stations by the
 * fraction of city tiles each covers" — this is that per-tile fraction, unrounded so a station
 * covering several tiles can sum them before rounding once). Used by src/sim/stations/economy.ts
 * to split supply between stations whose catchments overlap the city. */
export function cityTileSupply(city: City): CitySupply {
  const tiles = city.tiles.length;
  return {
    passengers: city.population / CITY_PASSENGER_SUPPLY_DIVISOR / tiles,
    mail: city.population / CITY_MAIL_SUPPLY_DIVISOR / tiles,
  };
}

/** Acceptance points contributed by a single city tile of tier `tier` (SPEC §8.3), gated by
 * cargo era. `cityAcceptance` below sums this over a city's whole footprint; stations sum it over
 * just the tiles inside their catchment. */
export function cityTileAcceptance(
  tier: CityTier,
  currentYear: number,
): Partial<Record<CargoType, number>> {
  const points: Partial<Record<CargoType, number>> = {
    passengers: 4,
    mail: 4,
    goods: 2,
    food: 2,
  };
  if (currentYear >= 1890) points.fuel = 1;
  if (tier === "village" || tier === "town") points.lumber = 1;
  if (tier === "metropolis") {
    for (const cargo of ["steel", "goods", "food", "fuel", "lumber"] as CargoType[]) {
      points[cargo] = (points[cargo] ?? 0) + 1;
    }
  }
  return points;
}

/** Total acceptance points across the city's footprint (SPEC §8.3), gated by cargo era. */
export function cityAcceptance(
  city: City,
  currentYear: number,
): Partial<Record<CargoType, number>> {
  const perTile = cityTileAcceptance(city.tier, currentYear);
  const points: Partial<Record<CargoType, number>> = {};
  for (const [cargo, v] of Object.entries(perTile) as Array<[CargoType, number]>) {
    points[cargo] = v * city.tiles.length;
  }
  return points;
}

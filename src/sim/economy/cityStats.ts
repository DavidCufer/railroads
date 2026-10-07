/** Pure display stats derived from a city (SPEC §8.3) — no station coverage yet (Phase 5+). */
import { CARGO, type CargoType } from "../../data/cargo";
import {
  CITY_MAIL_SUPPLY_DIVISOR,
  CITY_TIER_DEMAND_POINTS,
  CITY_TIERS,
  CITY_PASSENGER_SUPPLY_DIVISOR,
  type CityTier,
} from "../../data/cities";
import { inducedTrafficFactor, smallTownRoadLoss, tripsPerHeadPerMonth } from "../../data/economy";
import type { City } from "./types";

export interface CitySupply {
  passengers: number;
  mail: number;
}

/** Supply per month if fully covered by stations (SPEC §8.3, tuned — see cities.ts). */
/** The town's total travel demand (Phase 35C): people a month who would ride a train somewhere if every town were on
 * the network = population x trips per head (`tripsPerHeadPerMonth`). One number, shown on the town panel; a station
 * generates its catchment's part of it, limited to the destinations the network reaches. */
export function cityTravelDemand(city: City, year = 1900): number {
  return (
    city.population * tripsPerHeadPerMonth(year) * (1 - smallTownRoadLoss(city.population, year))
  );
}

export function citySupply(city: City, year = 1900): CitySupply {
  return {
    passengers: Math.round(
      (city.population / CITY_PASSENGER_SUPPLY_DIVISOR) * inducedTrafficFactor(year),
    ),
    mail: Math.round(city.population / CITY_MAIL_SUPPLY_DIVISOR),
  };
}

/** Per-tile share of the city's monthly supply (SPEC §8.3: "split among covering stations by the
 * fraction of city tiles each covers" — this is that per-tile fraction, unrounded so a station
 * covering several tiles can sum them before rounding once). Used by src/sim/stations/economy.ts
 * to split supply between stations whose catchments overlap the city. */
export function cityTileSupply(city: City, year = 1900): CitySupply {
  const tiles = city.tiles.length;
  const kept = 1 - smallTownRoadLoss(city.population, year);
  return {
    passengers: city.population / CITY_PASSENGER_SUPPLY_DIVISOR / tiles,
    mail: (city.population / CITY_MAIL_SUPPLY_DIVISOR / tiles) * kept,
  };
}

/** Acceptance points contributed by a single city tile of tier `tier` (SPEC §8.3), gated by
 * cargo era. `cityAcceptance` below sums this over a city's whole footprint; stations sum it over
 * just the tiles inside their catchment. */
export function cityTileAcceptance(
  tier: CityTier,
  currentYear: number,
): Partial<Record<CargoType, number>> {
  const points: Partial<Record<CargoType, number>> = {};
  for (const [cargo, v] of Object.entries(CITY_TIER_DEMAND_POINTS[tier]) as Array<
    [CargoType, number]
  >) {
    if (currentYear >= CARGO[cargo].era) points[cargo] = v;
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

/** Cargo types a city newly demands on reaching `tier` (empty for a village), for the city panel's
 * "Next tier … unlocks demand for …" line. */
export function tierUnlocks(tier: CityTier, currentYear: number): CargoType[] {
  const index = CITY_TIERS.indexOf(tier);
  if (index <= 0) return [];
  const before = cityTileAcceptance(CITY_TIERS[index - 1] as CityTier, currentYear);
  const now = cityTileAcceptance(tier, currentYear);
  return (Object.keys(now) as CargoType[]).filter((c) => before[c] === undefined);
}

/** Pure display stats derived from a city (SPEC §8.3) — no station coverage yet (Phase 5+). */
import type { CargoType } from "../../data/cargo";
import type { City } from "./types";

export interface CitySupply {
  passengers: number;
  mail: number;
}

/** Supply per month if fully covered by stations (SPEC §8.3: passengers = pop/250, mail = pop/800). */
export function citySupply(city: City): CitySupply {
  return {
    passengers: Math.round(city.population / 250),
    mail: Math.round(city.population / 800),
  };
}

/** Total acceptance points across the city's footprint (SPEC §8.3), gated by cargo era. */
export function cityAcceptance(
  city: City,
  currentYear: number,
): Partial<Record<CargoType, number>> {
  const tiles = city.tiles.length;
  const points: Partial<Record<CargoType, number>> = {
    passengers: tiles * 4,
    mail: tiles * 4,
    goods: tiles * 2,
    food: tiles * 2,
  };
  if (currentYear >= 1890) points.fuel = tiles * 1;
  if (city.tier === "village" || city.tier === "town") points.lumber = tiles * 1;
  if (city.tier === "metropolis") {
    for (const cargo of ["steel", "goods", "food", "fuel", "lumber"] as CargoType[]) {
      points[cargo] = (points[cargo] ?? 0) + tiles * 1;
    }
  }
  return points;
}

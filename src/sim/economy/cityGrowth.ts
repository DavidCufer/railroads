/**
 * City growth (SPEC §8.3, Phase 9): a monthly step that turns delivered cargo into population
 * growth, footprint expansion, and tier changes — plus the player-driven Civic Investment lever.
 *
 * Growth score accrual happens continuously as cargo is delivered (`accrueCityGrowthScore`, called
 * from src/sim/trains/loading.ts's `applyUnload`/`applyLoad`); the monthly step
 * (`monthlyCityGrowthStep`, called from src/sim/tick.ts) folds that score into a running "growth
 * points" balance and, once it crosses a size-scaled threshold, applies a population step, grows
 * the footprint by one tile, and checks for a tier change.
 *
 * The threshold scaling with population (`CITY_GROWTH_THRESHOLD_FACTOR`) is what keeps growth
 * bounded without an explicit decay: a bigger city needs proportionally more delivered cargo to
 * keep growing, on top of the hard `CITY_POPULATION_CAP` ceiling.
 */
import {
  CITY_GROWTH_MAX_STEPS_PER_MONTH,
  CITY_GROWTH_STEP_FRACTION,
  CITY_GROWTH_THRESHOLD_FACTOR,
  CITY_POPULATION_CAP,
  CITY_SERVED_SCORE_THRESHOLD,
  CITY_TIER_DEFS,
  CITY_TIERS,
  CITY_UNSERVED_BASELINE_GROWTH_PER_YEAR,
  type CityTier,
} from "../../data/cities";
import { CARLOAD_UNITS, type CargoType } from "../../data/cargo";
import { DIRS8, inBounds, tileIndex } from "../map/grid";
import { terrainId } from "../map/terrain";
import { nextInt } from "../rng";
import { pushNews } from "../news";
import type { Station } from "../stations/types";
import { stationCatchmentTiles } from "../stations/placement";
import { HOTEL_GROWTH_CONTRIBUTION_MULT, STATION_TYPE_DEFS } from "../../data/stations";
import type { GameState } from "../state";
import type { City, CityGrowthState } from "./types";

const WATER_ID = terrainId("water");
const MOUNTAIN_ID = terrainId("mountain");

/** Absolute cap on footprint size — in practice population growth stalls at `CITY_POPULATION_CAP`
 * well before this, but it's a hard backstop against unbounded footprint growth regardless. */
const CITY_FOOTPRINT_TILE_CAP = 80;

/** Cargo types that contribute to SPEC §8.3's growthScore, and their relative weight
 * (passengers/mail: 1×; food/goods/fuel: 3×, per the SPEC formula). */
const GROWTH_CARGO_WEIGHT: Partial<Record<CargoType, number>> = {
  passengers: 1,
  mail: 1,
  food: 3,
  goods: 3,
  fuel: 3,
};

export function getOrCreateCityGrowth(state: GameState, cityId: number): CityGrowthState {
  let growth = state.cityGrowth.get(cityId);
  if (!growth) {
    growth = { points: 0, monthlyScore: 0 };
    state.cityGrowth.set(cityId, growth);
  }
  return growth;
}

/** Cities whose footprint overlaps `station`'s catchment — SPEC §8.3's "delivered to the city"
 * is approximated as "delivered at a station covering some of the city's tiles" (the same
 * coverage concept SPEC §6.3 already uses for supply/acceptance splitting). */
function citiesCoveringStation(state: GameState, station: Station): number[] {
  const radius = STATION_TYPE_DEFS[station.type].catchmentRadius;
  const tiles = stationCatchmentTiles(state.map, station.tile, radius);
  const ids = new Set<number>();
  for (const tile of tiles) {
    const cityId = state.map.cityId[tile] as number;
    if (cityId >= 0) ids.add(cityId);
  }
  return [...ids];
}

/** Accrues this delivery's contribution to covering cities' growth score (SPEC §8.3), split evenly
 * across cities whose footprint the delivering station covers. Only passengers/mail/food/goods/fuel
 * contribute; a Hotel improvement boosts the passengers/mail term specifically (SPEC §6.2: "+20%
 * city growth contribution"). No-op if the cargo doesn't count or no city is covered. */
export function accrueCityGrowthScore(
  state: GameState,
  station: Station,
  cargo: CargoType,
  units: number = CARLOAD_UNITS,
): void {
  const weight = GROWTH_CARGO_WEIGHT[cargo];
  if (!weight) return;
  const cityIds = citiesCoveringStation(state, station);
  if (cityIds.length === 0) return;

  const isPassengerOrMail = cargo === "passengers" || cargo === "mail";
  const hotelMult =
    isPassengerOrMail && station.improvements.includes("hotel")
      ? HOTEL_GROWTH_CONTRIBUTION_MULT
      : 1;
  const contribution = (units * weight * hotelMult) / cityIds.length;
  for (const cityId of cityIds) {
    getOrCreateCityGrowth(state, cityId).monthlyScore += contribution;
  }
}

function tierForPopulation(population: number): CityTier {
  if (population >= CITY_TIER_DEFS.metropolis.minPop) return "metropolis";
  if (population >= CITY_TIER_DEFS.city.minPop) return "city";
  if (population >= CITY_TIER_DEFS.town.minPop) return "town";
  return "village";
}

/** Bumps `city.tier` (and pushes a "grown into a Y" news item) if `population` now qualifies for a
 * higher tier than it's currently at. Never downgrades — population never decreases in this model. */
function maybeAdvanceTier(state: GameState, city: City): void {
  const target = tierForPopulation(city.population);
  if (CITY_TIERS.indexOf(target) <= CITY_TIERS.indexOf(city.tier)) return;
  city.tier = target;
  pushNews(state, { kind: "cityGrowth", cityId: city.id, tier: target });
}

/** Adds exactly one adjacent, unclaimed, buildable land tile to `city`'s footprint — the visible
 * "the city expands" step SPEC §8.3 calls for on a growth tick. Deterministic (draws from the
 * game's own seeded RNG, per CLAUDE.md's sim hard rule) — picks uniformly among the frontier's
 * unclaimed neighbors, same style as the initial map-gen footprint grower in economy/cities.ts, but
 * operating on the live map/city instead of a throwaway `claimed` array. No-op if hemmed in or
 * already at the footprint cap. */
function growFootprintByOne(state: GameState, city: City): void {
  if (city.tiles.length >= CITY_FOOTPRINT_TILE_CAP) return;
  const map = state.map;
  const claimed = new Set(city.tiles);
  const frontier: number[] = [];
  const seen = new Set<number>();
  for (const idx of city.tiles) {
    const x = idx % map.width;
    const y = Math.floor(idx / map.width);
    for (const [dx, dy] of DIRS8) {
      const nx = x + dx;
      const ny = y + dy;
      if (!inBounds(map, nx, ny)) continue;
      const nIdx = tileIndex(map, nx, ny);
      if (claimed.has(nIdx) || seen.has(nIdx)) continue;
      seen.add(nIdx);
      if ((map.cityId[nIdx] as number) !== -1) continue;
      if ((map.industryId[nIdx] as number) !== -1) continue;
      const t = map.terrain[nIdx] as number;
      if (t === WATER_ID || t === MOUNTAIN_ID) continue;
      frontier.push(nIdx);
    }
  }
  if (frontier.length === 0) return;
  const pick = frontier[nextInt(state.rng, 0, frontier.length - 1)] as number;
  city.tiles.push(pick);
  map.cityId[pick] = city.id;
  state.mapContentVersion++;
}

/** One population growth step (SPEC §8.3: "crossing thresholds grows population... and adds a tile
 * to the city footprint"), shared by the monthly step and Civic Investment. */
function applyGrowthStep(state: GameState, city: City, fraction: number): void {
  city.population = Math.min(CITY_POPULATION_CAP, Math.round(city.population * (1 + fraction)));
  growFootprintByOne(state, city);
  maybeAdvanceTier(state, city);
}

/** Monthly growth step for every city (SPEC §8.3), called on the month boundary tick. Folds this
 * month's accrued score (or, if unserved, a slow population-proportional baseline) into the city's
 * running growth-points balance, then applies as many population steps as the balance now affords
 * (capped per month so a huge one-off score, e.g. from Civic Investment, can't loop indefinitely). */
export function monthlyCityGrowthStep(state: GameState): void {
  for (const city of state.cities) {
    const growth = getOrCreateCityGrowth(state, city.id);
    const served = growth.monthlyScore >= CITY_SERVED_SCORE_THRESHOLD;
    growth.lastServed = served;
    growth.points += served
      ? growth.monthlyScore
      : city.population * (CITY_UNSERVED_BASELINE_GROWTH_PER_YEAR / 12);
    growth.monthlyScore = 0;

    for (let step = 0; step < CITY_GROWTH_MAX_STEPS_PER_MONTH; step++) {
      if (city.population >= CITY_POPULATION_CAP) break;
      const threshold = city.population * CITY_GROWTH_THRESHOLD_FACTOR;
      if (growth.points < threshold) break;
      growth.points -= threshold;
      applyGrowthStep(state, city, CITY_GROWTH_STEP_FRACTION);
    }
  }
}

/** Applies Civic Investment's immediate effect (SPEC §8.3: "+15% population and a one-off growth
 * tick") — the command itself (src/sim/commands.ts) handles cost/cooldown validation. */
export function applyCivicInvestmentGrowth(state: GameState, city: City, fraction: number): void {
  applyGrowthStep(state, city, fraction);
}

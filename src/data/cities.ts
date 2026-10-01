/** City tiers and name-generator syllable tables (SPEC §8.3, §4.2 step 4). */

import { AREA_SCALE, WORLD_SCALE } from "./scale";
import type { CargoType } from "./cargo";

export const CITY_TIERS = ["village", "town", "city", "metropolis"] as const;

export type CityTier = (typeof CITY_TIERS)[number];

export interface CityTierDef {
  id: CityTier;
  minTiles: number;
  maxTiles: number;
  minPop: number;
  maxPop: number;
}

export const CITY_TIER_DEFS: Record<CityTier, CityTierDef> = {
  village: { id: "village", minTiles: 1, maxTiles: 4, minPop: 1_000, maxPop: 5_000 },
  town: { id: "town", minTiles: 5, maxTiles: 12, minPop: 5_000, maxPop: 25_000 },
  city: { id: "city", minTiles: 13, maxTiles: 30, minPop: 25_000, maxPop: 150_000 },
  metropolis: { id: "metropolis", minTiles: 31, maxTiles: 60, minPop: 150_000, maxPop: 400_000 },
};

/** Acceptance points per city tile, by tier — the explicit demand ladder (Phase 26A, SPEC §8.3). Bigger
 * tiers demand more cargo types, so growing a city opens new customers for the player's freight:
 * village = passengers, mail, food, lumber; town adds goods; city adds fuel (from 1890) and drops
 * lumber; metropolis adds steel and takes more of everything processed. Cargo whose `era` is in the
 * future is not demanded yet (src/sim/economy/cityStats.ts). */
export const CITY_TIER_DEMAND_POINTS: Record<CityTier, Partial<Record<CargoType, number>>> = {
  village: { passengers: 4, mail: 4, food: 2, lumber: 1 },
  town: { passengers: 4, mail: 4, food: 2, goods: 2, lumber: 1 },
  city: { passengers: 4, mail: 4, food: 2, goods: 2, fuel: 1 },
  metropolis: { passengers: 4, mail: 4, food: 3, goods: 3, fuel: 2, lumber: 1, steel: 1 },
};

/** Minimum spacing (tiles, anchor to anchor) between two cities (SPEC §4.2 step 4). */
export const CITY_MIN_SPACING = 8 * WORLD_SCALE;

/** Phase 26A rebalance: the Phase 7.1 divisors left a 12k town with ~0.9 passenger car/month against
 * a coal mine's 3, so passengers/mail earned ~0.6× freight per train (target 0.8–1.2×, PLAN 26A).
 * Raised by this factor (i.e. divisors ÷ 1.5, roughly the SPEC's original pop/250 → pop/217). */
export const CITY_SUPPLY_BOOST = 1.5;
/** Mail is boosted more: a car pays 1.3× a passenger car now (was 2.4×), so it needs the volume to keep
 * a mail train worth ~0.8× a passenger train on the same route. */
export const CITY_MAIL_SUPPLY_BOOST = 2.2;
/** Phase 30A (PLAYTEST-2 Top 10 #9): mail was 48–55 % of every run's revenue — one bag per ~420 residents a
 * month, as much money as the passengers. Real railways carried mail on a contract and it was a small share of
 * a passenger line's receipts (a few %, 10–20 % at the very most on the great mail routes), because a letter
 * weighs grams and a household wrote a few a week. Supply per head is now 1/4.7 of the old figure so mail is
 * ~15 % of a city line's revenue; the rate per bag (1.3× a passenger, and the Post Office's +50 % supply /
 * +25 % pay) is unchanged, which makes the Post Office a sensible extra rather than the best investment. */
export const MAIL_VOLUME_FACTOR = 0.213;

/** Monthly passenger/mail supply per resident (SPEC §8.3: "passengers = pop/250, mail = pop/800").
 * **Deviation (Phase 7.1 balance pass)**: SPEC's pop/250 made two decent-sized cities' passenger
 * shuttle earn far more than any freight route (a single train could clear ~half the starting
 * cash every year) — raised to pop/650 (passengers) / pop/1400 (mail) so a good passenger route
 * lands in the same $80k-200k/yr/train ballpark as a good freight route instead of dwarfing it.
 * See PROGRESS.md's Phase 7.1 entry for the measured before/after numbers.
 *
 * **Phase 16 real-unit conversion**: these divisors produced a count of the old cargo-agnostic
 * 20-unit "carloads" (PLAN: passengers 40/car, mail 30/car now) — divided by `cargoUnitFactor` (2×
 * for passengers, 1.5× for mail) so `population / divisor` still yields the same number of
 * carloads/month as before, just expressed in real people/bags. */
export const CITY_PASSENGER_SUPPLY_DIVISOR = 650 / 2 / CITY_SUPPLY_BOOST;
export const CITY_MAIL_SUPPLY_DIVISOR = 1_400 / 1.5 / CITY_MAIL_SUPPLY_BOOST / MAIL_VOLUME_FACTOR;

/** Destination bonus (Phase 26A): a station's passenger and mail supply grows by this fraction for
 * every *additional* distinct station its passenger/mail trains reach (a plain A↔B shuttle has one
 * destination and no bonus), up to `DESTINATION_BONUS_MAX` (+50 %). */
export const DESTINATION_BONUS_PER_STOP = 0.1;
export const DESTINATION_BONUS_MAX = 0.5;

// --- Growth & Civic Investment (SPEC §8.3, Phase 9) --------------------------------------------

/** Absolute population ceiling, regardless of accumulated growth points — the top of the
 * Metropolis range above, and what keeps growth bounded over an arbitrarily long game. */
export const CITY_POPULATION_CAP = CITY_TIER_DEFS.metropolis.maxPop;

/** Each growth step needs `population * this` accumulated points — scales with size so bigger
 * cities need proportionally more delivered cargo to keep growing (self-limiting: growth rate
 * naturally slows as a city gets bigger, rather than compounding into a runaway). */
export const CITY_GROWTH_THRESHOLD_FACTOR = 0.05;

/** Population multiplier applied per growth step once `points` crosses the threshold. */
export const CITY_GROWTH_STEP_FRACTION = 0.05;

/** Growth steps applied in a single month are capped (a huge one-off score dump, e.g. from Civic
 * Investment, shouldn't be able to loop indefinitely in one tick). */
export const CITY_GROWTH_MAX_STEPS_PER_MONTH = 4;

/** An unserved city (SPEC §8.3: "unserved cities grow very slowly") still accrues growth points
 * from a slow population-proportional baseline — 0.2%/year, applied monthly. */
export const CITY_UNSERVED_BASELINE_GROWTH_PER_YEAR = 0.002;

/** A city counts as "served" this month once its accumulated delivery score (SPEC §8.3's
 * growthScore — passengers+mail delivered, ×3 for food/goods/fuel) clears this floor. */
export const CITY_SERVED_SCORE_THRESHOLD = 1;

/** Civic Investment (SPEC §8.3): cost $100k × tier rank (1-4), once per 5 years per city, +15%
 * population and a one-off growth tick. */
export const CIVIC_INVESTMENT_COST_PER_TIER = 100_000;
export const CIVIC_INVESTMENT_COOLDOWN_YEARS = 5;
export const CIVIC_INVESTMENT_POP_BOOST = 0.15;

export type CityCount = "few" | "normal" | "many";

/** Target number of cities per 1,000 map tiles, by the "city count" option. */
export const CITY_COUNT_DENSITY: Record<CityCount, number> = {
  few: 0.85 / AREA_SCALE,
  normal: 1.3 / AREA_SCALE,
  many: 1.9 / AREA_SCALE,
};

export type ResourceDensity = "low" | "normal" | "high";

/** Multiplier on the number of raw-producer industries placed. */
export const RESOURCE_DENSITY_MULT: Record<ResourceDensity, number> = {
  low: 0.65,
  normal: 1.0,
  high: 1.45,
};

/** Combined syllable-table name generator (SPEC §4.2 step 4: "combine syllable tables"). */
export const CITY_NAME_SYLLABLES = {
  starts: [
    "Ash",
    "Bar",
    "Bram",
    "Cedar",
    "Clay",
    "Dun",
    "East",
    "Elm",
    "Fair",
    "Fal",
    "Glen",
    "Green",
    "Hart",
    "High",
    "Iron",
    "Kings",
    "Lake",
    "Leaf",
    "Marsh",
    "Mill",
    "New",
    "North",
    "Oak",
    "Pine",
    "Port",
    "Red",
    "River",
    "Rock",
    "Salt",
    "South",
    "Stone",
    "Summer",
    "Thorn",
    "Vale",
    "West",
    "Wolf",
    "Wood",
  ],
  mids: ["bar", "brook", "burn", "dale", "field", "ford", "ham", "land", "mere", "wick"],
  ends: [
    "borough",
    "bridge",
    "burg",
    "bury",
    "field",
    "ford",
    "haven",
    "hollow",
    "port",
    "ridge",
    "shire",
    "side",
    "ton",
    "town",
    "ville",
    "wood",
  ],
} as const;

// --- Frontier towns (Phase 26A: "empty land becomes useful") -----------------------------------

/** A station on a train's orders for this many months with no city in its catchment may get a new
 * village founded beside it. */
export const FRONTIER_SERVED_MONTHS = 24;
/** Monthly chance once the station qualifies. */
export const FRONTIER_CHANCE_PER_MONTH = 0.12;
/** No frontier village within this many tiles of an existing city. */
export const FRONTIER_MIN_CITY_DISTANCE = 6 * WORLD_SCALE;
export const FRONTIER_START_POPULATION = CITY_TIER_DEFS.village.minPop;

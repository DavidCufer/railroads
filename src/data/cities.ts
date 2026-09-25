/** City tiers and name-generator syllable tables (SPEC §8.3, §4.2 step 4). */

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

/** Minimum spacing (tiles, anchor to anchor) between two cities (SPEC §4.2 step 4). */
export const CITY_MIN_SPACING = 8;

/** Monthly passenger/mail supply per resident (SPEC §8.3: "passengers = pop/250, mail = pop/800").
 * **Deviation (Phase 7.1 balance pass)**: SPEC's pop/250 made two decent-sized cities' passenger
 * shuttle earn far more than any freight route (a single train could clear ~half the starting
 * cash every year) — raised to pop/650 (passengers) / pop/1400 (mail) so a good passenger route
 * lands in the same $80k-200k/yr/train ballpark as a good freight route instead of dwarfing it.
 * See PROGRESS.md's Phase 7.1 entry for the measured before/after numbers. */
export const CITY_PASSENGER_SUPPLY_DIVISOR = 650;
export const CITY_MAIL_SUPPLY_DIVISOR = 1_400;

// --- Growth & Civic Investment (SPEC §8.3, Phase 9) --------------------------------------------

/** Absolute population ceiling, regardless of accumulated growth points — the top of the
 * Metropolis range above, and what keeps growth bounded over an arbitrarily long game. */
export const CITY_POPULATION_CAP = CITY_TIER_DEFS.metropolis.maxPop;

/** Each growth step needs `population * this` accumulated points — scales with size so bigger
 * cities need proportionally more delivered cargo to keep growing (self-limiting: growth rate
 * naturally slows as a city gets bigger, rather than compounding into a runaway). */
export const CITY_GROWTH_THRESHOLD_FACTOR = 8;

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
  few: 0.85,
  normal: 1.3,
  many: 1.9,
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

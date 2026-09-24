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

/**
 * Random map generator parameters (SPEC §4.2). Balance numbers only — logic lives in src/sim/map.
 */

export type MapSizeName = "small" | "medium" | "large";

/** Scenario start year (SPEC §3: 1830–1950) used until Phase 10 adds a new-game year picker. */
export const DEFAULT_START_YEAR = 1900;

export const MAP_SIZES: Record<MapSizeName, { width: number; height: number }> = {
  small: { width: 96, height: 64 },
  medium: { width: 128, height: 96 },
  large: { width: 192, height: 128 },
};

export type WaterLevel = "low" | "normal" | "high";

/** Target fraction of tiles that end up as land, by water level. */
export const WATER_LEVEL_LAND_FRACTION: Record<WaterLevel, number> = {
  low: 0.85,
  normal: 0.7,
  high: 0.55,
};

/** Strength of the continental edge falloff (0 = disabled) — pushes edges toward water. */
export const WATER_LEVEL_FALLOFF: Record<WaterLevel, number> = {
  low: 0,
  normal: 0.35,
  high: 0.55,
};

export type Roughness = "flat" | "normal" | "mountainous";

export const ROUGHNESS_PARAMS: Record<
  Roughness,
  { octaves: number; persistence: number; scaleFactor: number }
> = {
  flat: { octaves: 4, persistence: 0.4, scaleFactor: 0.28 },
  normal: { octaves: 5, persistence: 0.5, scaleFactor: 0.2 },
  mountainous: { octaves: 5, persistence: 0.6, scaleFactor: 0.14 },
};

export const MOISTURE_NOISE = { octaves: 4, persistence: 0.5, scaleFactor: 0.16 };

/** Rivers source from tiles at or above this elevation (hills/mountains). */
export const RIVER_SOURCE_MIN_ELEVATION = 6;
export const RIVER_SOURCE_COUNT_MIN = 4;
export const RIVER_SOURCE_COUNT_MAX = 12;
/** Minimum tile-distance between two accepted river sources. */
export const RIVER_SOURCE_MIN_SPACING = 10;
/** A traced river shorter than this (land tiles, source to water/merge) is discarded. */
export const RIVER_MIN_LENGTH = 12;

/**
 * Priority-flood (Barnes et al. 2014, "Priority-Flood + epsilon") depression filling, run on the
 * continuous pre-quantization elevation field so every land tile has a strictly-downhill path to
 * water for river routing — no local minima, no random walks.
 */
export const FLOOD_EPSILON = 1e-5;
/** A filled depression shallower than this (in raw elevation units) is not considered a lake. */
export const LAKE_FILL_THRESHOLD = 0.02;
/** A filled depression smaller than this many tiles is left as land, not turned into a lake. */
export const LAKE_MIN_AREA = 4;

/** Terrain classification thresholds (elevation is 0–9; moisture is [-1, 1]). */
export const TERRAIN_THRESHOLDS = {
  mountainElevation: 8,
  hillsElevation: 6,
  swampMaxElevation: 1,
  swampMinMoisture: 0.55,
  forestMinMoisture: 0.25,
  desertMaxMoisture: -0.55,
};

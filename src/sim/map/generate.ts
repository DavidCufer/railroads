/**
 * Deterministic random map generator (SPEC §4.2): elevation/terrain/rivers (steps 1–3), then
 * cities and industries (steps 4–6).
 */
import type { RngState } from "../rng";
import {
  DEFAULT_START_YEAR,
  MAP_SIZES,
  type MapSizeName,
  MOISTURE_NOISE,
  ROUGHNESS_PARAMS,
  type Roughness,
  TERRAIN_THRESHOLDS,
  WATER_LEVEL_FALLOFF,
  WATER_LEVEL_LAND_FRACTION,
  type WaterLevel,
} from "../../data/mapGen";
import type { CityCount, ResourceDensity } from "../../data/cities";
import { buildPermutation, clamp, clamp01, fractalNoise2D, smoothstep } from "./noise";
import { tileIndex } from "./grid";
import { terrainId, type Terrain } from "./terrain";
import { priorityFloodFill, type FloodFillResult } from "./flood";
import { fillLakes, removeTinyWaterBodies } from "./lakes";
import { carveRivers, type RiverInfo } from "./rivers";
import { placeCities } from "../economy/cities";
import { placeIndustries } from "../economy/industries";
import { countPlayablePairs } from "../economy/playability";
import type { City, Industry } from "../economy/types";
import type { GameMap } from "./types";

export interface MapGenOptions {
  size: MapSizeName;
  waterLevel: WaterLevel;
  roughness: Roughness;
  cityCount?: CityCount;
  resourceDensity?: ResourceDensity;
}

export interface GenerateMapResult {
  map: GameMap;
  rivers: RiverInfo[];
  cities: City[];
  industries: Industry[];
  /**
   * The priority-flood result computed (and used for routing) before lake conversion — exposed
   * mainly so tests can verify river monotonicity against the exact field routing used.
   */
  flood: FloodFillResult;
}

/** One step up in city count, used as a deterministic retry if the playability check fails. */
function bumpCityCount(count: CityCount): CityCount {
  return count === "few" ? "normal" : "many";
}

const MIN_PLAYABLE_PAIRS = 3;

function classifyTerrain(elevation: number, moisture: number): Terrain {
  if (elevation === 0) return "water";
  if (elevation >= TERRAIN_THRESHOLDS.mountainElevation) return "mountain";
  if (elevation >= TERRAIN_THRESHOLDS.hillsElevation) return "hills";
  if (
    elevation <= TERRAIN_THRESHOLDS.swampMaxElevation &&
    moisture > TERRAIN_THRESHOLDS.swampMinMoisture
  ) {
    return "swamp";
  }
  if (moisture > TERRAIN_THRESHOLDS.forestMinMoisture) return "forest";
  if (moisture < TERRAIN_THRESHOLDS.desertMaxMoisture) return "desert";
  return "plain";
}

export function generateMap(
  rng: RngState,
  options: MapGenOptions,
  startYear: number = DEFAULT_START_YEAR,
): GenerateMapResult {
  const { width, height } = MAP_SIZES[options.size];
  const map: GameMap = {
    width,
    height,
    terrain: new Uint8Array(width * height),
    elevation: new Uint8Array(width * height),
    elevationRaw: new Float32Array(width * height),
    riverFlow: new Uint16Array(width * height),
    riverNext: new Int32Array(width * height).fill(-1),
    cityId: new Int16Array(width * height).fill(-1),
    industryId: new Int16Array(width * height).fill(-1),
  };

  const elevationPerm = buildPermutation(rng);
  const moisturePerm = buildPermutation(rng);
  const roughnessParams = ROUGHNESS_PARAMS[options.roughness];
  const elevationScale = Math.max(width, height) * roughnessParams.scaleFactor;
  const moistureScale = Math.max(width, height) * MOISTURE_NOISE.scaleFactor;

  const centerX = (width - 1) / 2;
  const centerY = (height - 1) / 2;
  const maxDist = Math.hypot(centerX, centerY);
  const falloffStrength = WATER_LEVEL_FALLOFF[options.waterLevel];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = tileIndex(map, x, y);
      let n = fractalNoise2D(
        elevationPerm,
        x,
        y,
        roughnessParams.octaves,
        roughnessParams.persistence,
        2,
        elevationScale,
      );
      if (options.roughness === "mountainous") {
        const ridge = 1 - Math.abs(n) * 2;
        n = n * 0.6 + ridge * 0.4;
      }
      const dist = maxDist > 0 ? Math.hypot(x - centerX, y - centerY) / maxDist : 0;
      const falloff = smoothstep(clamp01(dist)) * falloffStrength;
      map.elevationRaw[idx] = n - falloff;
    }
  }

  const landFraction = WATER_LEVEL_LAND_FRACTION[options.waterLevel];
  const sorted = Array.from(map.elevationRaw).sort((a, b) => a - b);
  const thresholdIndex = clamp(
    Math.floor((1 - landFraction) * sorted.length),
    0,
    sorted.length - 1,
  );
  const threshold = sorted[thresholdIndex] as number;
  const maxVal = sorted[sorted.length - 1] as number;

  for (let i = 0; i < map.elevationRaw.length; i++) {
    const v = map.elevationRaw[i] as number;
    if (v <= threshold) {
      map.elevation[i] = 0;
    } else {
      const t = maxVal > threshold ? (v - threshold) / (maxVal - threshold) : 0;
      map.elevation[i] = clamp(1 + Math.round(Math.pow(t, 1.4) * 8), 1, 9);
    }
  }

  const waterId = terrainId("water");
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = tileIndex(map, x, y);
      const elev = map.elevation[idx] as number;
      if (elev === 0) {
        map.terrain[idx] = waterId;
        continue;
      }
      const moisture = fractalNoise2D(
        moisturePerm,
        x,
        y,
        MOISTURE_NOISE.octaves,
        MOISTURE_NOISE.persistence,
        2,
        moistureScale,
      );
      map.terrain[idx] = terrainId(classifyTerrain(elev, moisture));
    }
  }

  // Priority-flood the continuous elevation field once: fillLakes uses it to find real depression
  // basins, and carveRivers uses its parent pointers to route rivers downhill with no random walk.
  const flood = priorityFloodFill(map);
  fillLakes(map, flood);
  removeTinyWaterBodies(map);
  const rivers = carveRivers(map, rng, flood.parent);

  let cities = placeCities(map, rng, options);
  let industries = placeIndustries(map, rng, cities, startYear, options);

  // Playability (SPEC §4.2 step 6): ensure enough nearby town/city pairs to build a first route
  // between. One deterministic retry (same rng stream, just a bigger city-count target) if not.
  if (countPlayablePairs(map, cities) < MIN_PLAYABLE_PAIRS && options.cityCount !== "many") {
    map.cityId.fill(-1);
    map.industryId.fill(-1);
    cities = placeCities(map, rng, {
      ...options,
      cityCount: bumpCityCount(options.cityCount ?? "normal"),
    });
    industries = placeIndustries(map, rng, cities, startYear, options);
  }

  return { map, rivers, cities, industries, flood };
}

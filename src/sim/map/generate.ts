/** Deterministic random map generator (SPEC §4.2, steps 1–3: elevation, terrain, rivers). */
import type { RngState } from "../rng";
import {
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
import { buildPermutation, clamp, clamp01, fractalNoise2D, smoothstep } from "./noise";
import { tileIndex } from "./grid";
import { terrainId, type Terrain } from "./terrain";
import { carveRivers } from "./rivers";
import type { GameMap } from "./types";

export interface MapGenOptions {
  size: MapSizeName;
  waterLevel: WaterLevel;
  roughness: Roughness;
}

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

export function generateMap(rng: RngState, options: MapGenOptions): GameMap {
  const { width, height } = MAP_SIZES[options.size];
  const map: GameMap = {
    width,
    height,
    terrain: new Uint8Array(width * height),
    elevation: new Uint8Array(width * height),
    riverFlow: new Uint16Array(width * height),
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

  const rawElevation = new Float64Array(width * height);
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
      rawElevation[idx] = n - falloff;
    }
  }

  const landFraction = WATER_LEVEL_LAND_FRACTION[options.waterLevel];
  const sorted = Array.from(rawElevation).sort((a, b) => a - b);
  const thresholdIndex = clamp(
    Math.floor((1 - landFraction) * sorted.length),
    0,
    sorted.length - 1,
  );
  const threshold = sorted[thresholdIndex] as number;
  const maxVal = sorted[sorted.length - 1] as number;

  for (let i = 0; i < rawElevation.length; i++) {
    const v = rawElevation[i] as number;
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

  carveRivers(map, rng);

  return map;
}

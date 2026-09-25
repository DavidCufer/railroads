/** Shape of a committed `src/data/regions/<id>.json` file (SPEC §4.3). Produced by
 * `tools/mapgen`, consumed by `./load.ts`. */
import type { CityTier } from "../../data/cities";
import type { IndustryType } from "../../data/industries";

export const REGION_IDS = ["us-east", "gb", "central-eu", "us-west"] as const;
export type RegionId = (typeof REGION_IDS)[number];

export interface RegionCityJson {
  id: number;
  name: string;
  tier: CityTier;
  population: number;
  anchorX: number;
  anchorY: number;
  /** Empty for a city whose `foundingYear` is still in the future at load time. */
  tiles: number[];
  coastal: boolean;
  foundingYear?: number;
}

export interface RegionIndustryJson {
  id: number;
  type: IndustryType;
  x: number;
  y: number;
}

export interface RegionJson {
  id: RegionId;
  name: string;
  width: number;
  height: number;
  startYear: number;
  seed: number;
  /** Base64 Uint8Array, one terrain id per tile (row-major). */
  terrainB64: string;
  /** Base64 Uint8Array, one elevation 0-9 per tile. */
  elevationB64: string;
  /** Base64 fixed-point Int16 (see codec.ts), continuous pre-quantization elevation for hillshading. */
  elevationRawB64: string;
  /** Each entry is one river, as an ordered list of tile indices from source to mouth. */
  rivers: number[][];
  cities: RegionCityJson[];
  industries: RegionIndustryJson[];
}

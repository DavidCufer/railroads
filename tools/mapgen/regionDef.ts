/** Author-time region definition format (SPEC §4.3 step 1) — one file per region under
 * `tools/mapgen/regions/`, consumed by `build.ts` to produce the committed `src/data/regions/*.json`. */
import type { CityTier } from "../../src/data/cities";
import type { IndustryType } from "../../src/data/industries";
import type { LonLat, RegionBounds } from "./geo";

export interface RegionCityDef {
  name: string;
  lon: number;
  lat: number;
  tier: CityTier;
  /** Realistic population for the region's start year. */
  population: number;
  /** If set and after `startYear`, the city doesn't appear until this year (SPEC §4.3/§4.4). */
  foundingYear?: number;
}

/** A mountain range's influence on elevation: `peakElevation` (0-9) held flat out to
 * `coreRadiusTiles` from the ridge line (the "core" — e.g. what reads as actual mountain terrain),
 * then falling off smoothly to 0 by `radiusTiles` (the core plus a wider hills margin). Omitting
 * `coreRadiusTiles` (or leaving it 0) gives the old point-ridge falloff, for a feature that's meant
 * to read as hills everywhere rather than have a flat mountain top. The renderer/generator jitter
 * the effective distance with coherent noise so the resulting band edge isn't a perfect offset
 * curve of the ridge polyline (SPEC §4.3: "noise-jittered edges"). */
export interface MountainFeature {
  name: string;
  ridge: LonLat[];
  peakElevation: number;
  coreRadiusTiles?: number;
  radiusTiles: number;
}

/** Restricts which terrain-placed raw industries can spawn where (SPEC §4.3 step 4 — "Pennsylvania
 * coal", "Mesabi iron", etc). An industry type not mentioned in any zone for a region is free to
 * spawn anywhere its terrain affinity allows, same as the random generator. */
export interface ResourceZone {
  name: string;
  types: IndustryType[];
  polygon: LonLat[];
}

/** A region's arid belt (SPEC §4.3: "region-specific moisture hints, e.g. desert in the US
 * southwest") — moisture is pulled down inside the polygon so desert/plain classification is
 * geographically plausible instead of noise-only. */
export interface AridZone {
  polygon: LonLat[];
}

export interface RegionDef {
  id: string;
  name: string;
  bounds: RegionBounds;
  startYear: number;
  seed: number;
  /** Land polygons (SPEC's Natural Earth fallback: hand-authored simplified coastlines). */
  land: LonLat[][];
  /** Inland lake polygons (Great Lakes, Great Salt Lake, ...) — same terrain as sea (`water`). */
  lakes: LonLat[][];
  /** Rivers as source→mouth polylines. */
  rivers: LonLat[][];
  mountains: MountainFeature[];
  resourceZones: ResourceZone[];
  aridZones?: AridZone[];
  cities: RegionCityDef[];
}

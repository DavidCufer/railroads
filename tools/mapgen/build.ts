/** Orchestrates one region's generation (SPEC §4.3 steps 2-5): rasterize coastline/lakes, build
 * elevation from mountain features + noise, classify terrain, carve rivers, place cities and
 * industries, then pack it all into the committed JSON format. */
import { encodeElevationRaw, encodeUint8 } from "../../src/sim/regions/codec";
import type { RegionCityJson, RegionIndustryJson, RegionJson } from "../../src/sim/regions/types";
import { classifyTerrain } from "../../src/sim/map/generate";
import { inBounds, tileIndex } from "../../src/sim/map/grid";
import {
  buildPermutation,
  clamp,
  clamp01,
  fractalNoise2D,
  smoothstep,
} from "../../src/sim/map/noise";
import { terrainId } from "../../src/sim/map/terrain";
import type { GameMap } from "../../src/sim/map/types";
import { createRng } from "../../src/sim/rng";
import { placeRegionCities } from "./cities";
import { distanceToPolyline, pointInAnyPolygon, projectPath, rasterizePolyline } from "./geo";
import { placeRegionIndustries } from "./industries";
import type { RegionDef } from "./regionDef";

const WATER_ID = terrainId("water");
const RIVER_ID = terrainId("river");
/** Rivers pull elevation down along their course (SPEC §4.3 step 3) — capped rather than solved
 * for full monotonicity, since regions are allowed to be stylized. */
const RIVER_MAX_ELEVATION = 3;
/** Small local-roughness noise added on top of the mountain-feature elevation field, so slopes
 * aren't perfectly smooth cones. Kept low relative to `peakElevation` (0-9) so it textures rather
 * than reshapes the authored mountain ranges. */
const LOCAL_NOISE_AMPLITUDE = 0.8;
/** Coherent noise wavelength (tiles) used to jitter a mountain feature's effective distance from
 * its ridge, so the core/falloff band's edge reads as an organic, uneven line rather than a smooth
 * offset curve of the authored ridge polyline. */
const MOUNTAIN_JITTER_SCALE = 10;

/** Elevation (0-`peakElevation`) at perpendicular distance `d` (tiles, already jittered) from a
 * mountain feature's ridge line: held flat at `peak` out to `core` tiles (the mountain core), then
 * smoothstep-falls to 0 by `radius` tiles (the core plus its hills margin). */
function mountainProfile(d: number, core: number, radius: number, peak: number): number {
  if (radius <= 0 || d >= radius) return 0;
  if (d <= core) return peak;
  const t = clamp01(1 - (d - core) / Math.max(radius - core, 0.001));
  return peak * smoothstep(t);
}

export function buildRegion(def: RegionDef): RegionJson {
  const { width, height } = def.bounds;
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

  const rng = createRng(def.seed);
  const landPolys = def.land.map((p) => projectPath(def.bounds, p));
  const lakePolys = def.lakes.map((p) => projectPath(def.bounds, p));
  const mountains = def.mountains.map((m) => ({ ...m, ridge: projectPath(def.bounds, m.ridge) }));
  const aridPolys = (def.aridZones ?? []).map((z) => projectPath(def.bounds, z.polygon));

  const elevationPerm = buildPermutation(rng);
  const moisturePerm = buildPermutation(rng);
  const mountainJitterPerm = buildPermutation(rng);
  const noiseScale = Math.max(width, height) * 0.18;
  const moistureScale = Math.max(width, height) * 0.16;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = tileIndex(map, x, y);
      const cx = x + 0.5;
      const cy = y + 0.5;
      const isLand = pointInAnyPolygon(cx, cy, landPolys) && !pointInAnyPolygon(cx, cy, lakePolys);
      if (!isLand) {
        map.terrain[idx] = WATER_ID;
        map.elevation[idx] = 0;
        map.elevationRaw[idx] = -0.5;
        continue;
      }

      let mountainElev = 0;
      const jitterN = fractalNoise2D(mountainJitterPerm, x, y, 2, 0.5, 2, MOUNTAIN_JITTER_SCALE);
      for (const range of mountains) {
        const d0 = distanceToPolyline(cx, cy, range.ridge);
        // Jitter is capped in absolute tiles (not just a fraction of radius) so it textures a
        // range's edge without meaningfully relocating a narrow range's whole footprint — that
        // would fight the hand-placed ridge lines authored around real cities (e.g. the Wasatch
        // ridge is deliberately offset from Salt Lake City so the city lands in the valley).
        const jitterAmplitude = Math.min(2, range.radiusTiles * 0.15);
        const d = Math.max(0, d0 + jitterN * jitterAmplitude);
        const core = range.coreRadiusTiles ?? 0;
        mountainElev = Math.max(
          mountainElev,
          mountainProfile(d, core, range.radiusTiles, range.peakElevation),
        );
      }
      const n = fractalNoise2D(elevationPerm, x, y, 4, 0.5, 2, noiseScale);
      const combined = mountainElev + n * LOCAL_NOISE_AMPLITUDE;
      const elev = clamp(Math.round(Math.max(combined, 0)), 1, 9);
      map.elevation[idx] = elev;
      map.elevationRaw[idx] = clamp(combined / 9, -1.5, 1.2);

      let moisture = fractalNoise2D(moisturePerm, x, y, 4, 0.5, 2, moistureScale);
      if (pointInAnyPolygon(cx, cy, aridPolys)) moisture -= 0.65;
      map.terrain[idx] = terrainId(classifyTerrain(elev, moisture));
    }
  }

  const riverChains: number[][] = [];
  for (const riverLonLat of def.rivers) {
    const pts = projectPath(def.bounds, riverLonLat);
    const cells = rasterizePolyline(pts);
    const chain: number[] = [];
    for (const [tx, ty] of cells) {
      if (!inBounds(map, tx, ty)) continue;
      const idx = tileIndex(map, tx, ty);
      chain.push(idx);
      if ((map.terrain[idx] as number) === WATER_ID) break;
    }
    if (chain.length < 2) continue;
    for (const idx of chain) {
      if ((map.terrain[idx] as number) !== WATER_ID) {
        map.terrain[idx] = RIVER_ID;
        map.elevation[idx] = Math.min(map.elevation[idx] as number, RIVER_MAX_ELEVATION);
      }
    }
    riverChains.push(chain);
  }

  const cities = placeRegionCities(map, def, rng);
  const industries = placeRegionIndustries(map, rng, cities, def);

  const cityJson: RegionCityJson[] = cities.map((c) => ({
    id: c.id,
    name: c.name,
    tier: c.tier,
    population: c.population,
    anchorX: c.anchorX,
    anchorY: c.anchorY,
    tiles: c.tiles,
    coastal: c.coastal,
    ...(c.foundingYear !== undefined ? { foundingYear: c.foundingYear } : {}),
  }));
  const industryJson: RegionIndustryJson[] = industries.map((i) => ({
    id: i.id,
    type: i.type,
    x: i.x,
    y: i.y,
  }));

  return {
    id: def.id as RegionJson["id"],
    name: def.name,
    width,
    height,
    startYear: def.startYear,
    seed: def.seed,
    terrainB64: encodeUint8(map.terrain),
    elevationB64: encodeUint8(map.elevation),
    elevationRawB64: encodeElevationRaw(map.elevationRaw),
    rivers: riverChains,
    cities: cityJson,
    industries: industryJson,
  };
}

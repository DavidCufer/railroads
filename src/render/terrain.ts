/**
 * Terrain renderer: cached per-chunk offscreen canvases (SPEC §10.3, §10.4).
 * Chunks are rasterized once per (zoom bucket, chunk) pair and reused every frame; only water
 * shimmer is redrawn dynamically on top.
 */
import { Camera, OVERVIEW_ZOOM_THRESHOLD, TILE_SIZE } from "./camera";
import { hexToRgb, shadeColor, withAlpha } from "./color";
import { hillshadeFactorAt } from "./hillshade";
import { rand, seedTile } from "./rng";
import { drawCityRoofs } from "./cities";
import { drawIndustryIcon } from "./industries";
import {
  CITY_ROOF_COLORS,
  FOREST_CANOPY_COLOR,
  FOREST_SHADOW_COLOR,
  RIVER_LINE_COLOR,
  SNOWCAP_COLOR,
  SNOWCAP_MIN_ELEVATION,
  TERRAIN_COLORS,
  WATER_DEEP_COLOR,
  WATER_SHALLOW_COLOR,
} from "./palette";
import { DIRS8, inBounds, tileIndex } from "../sim/map/grid";
import { terrainId, terrainName, type Terrain } from "../sim/map/terrain";
import type { GameMap } from "../sim/map/types";
import type { City, Industry } from "../sim/economy/types";
import { ChunkCache } from "./chunkCache";
import { drawChunkSnapped } from "./pixelSnap";

const CHUNK_TILES = 16;
/** Extra tiles baked around each terrain chunk (not composited) so overflow crosses chunk borders. */
const CHUNK_PAD_TILES = 1;
type ZoomBucket = 2 | 1 | 0.5 | 0.25;

/** Chunks baked at 2x (crisp when zoomed in past ~1.4x) are 4 MB each, so they live in their own
 * small LRU cache and only the chunks actually on screen are baked. */
const HI_RES_CHUNK_CACHE_MAX = 12;

/** A backstop against unbounded growth, not a budget: a Large map is 24x16 = 384 chunks per zoom
 * bucket since Phase 23A (5 km/tile), so a session that visits the whole map at several zoom levels
 * evicts least-recently-used chunks (cheap to re-bake; measured steady-state render is unchanged). */
const TERRAIN_CHUNK_CACHE_MAX = 350;

const WATER_ID = terrainId("water");
const RIVER_ID = terrainId("river");

/** Sub-tile shading resolution: a 4x4 grid of bilinearly-sampled hillshade cells per tile. */
const SHADE_SUBCELLS = 4;

/** Per-axis weights of the 4-tap smoothing kernel behind the coastline contour (sums to 8). */
const CORNER_KERNEL = [1, 3, 3, 1] as const;

/** Land classes for border smoothing: a river tile is plain ground with a line on it. */
const LAND_CLASS_NAMES = ["plain", "forest", "hills", "mountain", "desert", "swamp"] as const;
const LAND_CLASS_OF: Array<number | undefined> = [];
const LAND_CLASS_COLORS: string[] = LAND_CLASS_NAMES.map((name) => TERRAIN_COLORS[name]);
for (const t of Object.keys(TERRAIN_COLORS) as Terrain[]) {
  if (t === "water") continue;
  const cls = LAND_CLASS_NAMES.indexOf((t === "river" ? "plain" : t) as never);
  if (cls >= 0) LAND_CLASS_OF[terrainId(t)] = cls;
}
/** How far (in field units, 0.5 = a whole tile of wobble) the noise moves a land border. */
const LAND_BORDER_NOISE = 0.2;

function hash01(ix: number, iy: number): number {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function valueNoise(x: number, y: number, freq: number): number {
  const fx = x * freq;
  const fy = y * freq;
  const ix = Math.floor(fx);
  const iy = Math.floor(fy);
  const tx = fx - ix;
  const ty = fy - iy;
  const sx = tx * tx * (3 - 2 * tx);
  const sy = ty * ty * (3 - 2 * ty);
  const a = hash01(ix, iy);
  const b = hash01(ix + 1, iy);
  const c = hash01(ix, iy + 1);
  const d = hash01(ix + 1, iy + 1);
  return (a * (1 - sx) + b * sx) * (1 - sy) + (c * (1 - sx) + d * sx) * sy;
}

/** Two-octave value noise in [−1, 1] at absolute tile coordinates (half-tile and quarter-tile grain). */
function valueNoise2(x: number, y: number): number {
  return (0.65 * valueNoise(x, y, 2) + 0.35 * valueNoise(x + 17.3, y - 9.1, 4)) * 2 - 1;
}

function pickBucket(zoom: number): ZoomBucket {
  if (zoom >= 1.4) return 2;
  if (zoom >= 0.75) return 1;
  if (zoom >= OVERVIEW_ZOOM_THRESHOLD) return 0.5;
  return 0.25;
}

function terrainColorFor(map: GameMap, idx: number): string {
  const terrain = terrainName(map.terrain[idx] as number);
  return TERRAIN_COLORS[terrain];
}

/** Ground class of a land tile. A river tile is ground with a line on it: it takes the most common
 * class among its non-river land neighbours (plain if it has none), so a river crossing hills or
 * forest doesn't leave a chain of grass-coloured squares under the line. −1 for water. */
function groundClassOf(map: GameMap, x: number, y: number): number {
  const id = map.terrain[tileIndex(map, x, y)] as number;
  if (id !== RIVER_ID) return LAND_CLASS_OF[id] ?? -1;
  const votes: number[] = [];
  for (const [dx, dy] of DIRS8) {
    const nx = x + dx;
    const ny = y + dy;
    if (!inBounds(map, nx, ny)) continue;
    const c = LAND_CLASS_OF[map.terrain[tileIndex(map, nx, ny)] as number];
    if (c !== undefined && (map.terrain[tileIndex(map, nx, ny)] as number) !== RIVER_ID) {
      votes[c] = (votes[c] ?? 0) + 1;
    }
  }
  let best = 0;
  let bestVotes = 0;
  votes.forEach((v, c) => {
    if (v > bestVotes) {
      best = c;
      bestVotes = v;
    }
  });
  return best;
}

function renderColorFor(map: GameMap, x: number, y: number): string {
  const idx = tileIndex(map, x, y);
  const id = map.terrain[idx] as number;
  if (id === WATER_ID) return WATER_SHALLOW_COLOR;
  if (id === RIVER_ID) return LAND_CLASS_COLORS[groundClassOf(map, x, y)] as string;
  return terrainColorFor(map, idx);
}

/**
 * Extracts the polygon of a single marching-squares cell's corners (walked in order) that lies on
 * one side of `threshold`, linearly interpolating the crossing point on every edge whose two
 * corners straddle it. This is the general (not 16-case-lookup) form of the same computation:
 * walking the corners in order, keeping a corner when it's on the wanted side and inserting an
 * interpolated point wherever the wanted side changes, produces exactly the same result as the
 * standard case table for a single quad. Used by `TerrainRenderer.drawCoastlineContour`.
 */
function marchingSquaresPolygon(
  corners: ReadonlyArray<{ x: number; y: number; v: number }>,
  threshold: number,
  side: "ge" | "lt",
): Array<{ x: number; y: number }> {
  const wanted = (v: number): boolean => (side === "ge" ? v >= threshold : v < threshold);
  const out: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < corners.length; i++) {
    const cur = corners[i] as { x: number; y: number; v: number };
    const next = corners[(i + 1) % corners.length] as { x: number; y: number; v: number };
    const curWanted = wanted(cur.v);
    if (curWanted) out.push({ x: cur.x, y: cur.y });
    if (curWanted !== wanted(next.v)) {
      const t = (threshold - cur.v) / (next.v - cur.v);
      out.push({ x: cur.x + (next.x - cur.x) * t, y: cur.y + (next.y - cur.y) * t });
    }
  }
  return out;
}

/** The points where the `threshold` contour crosses the cell's edges, in walk order (paired up, they
 * are the contour's segments). */
function contourCrossings(
  corners: ReadonlyArray<{ x: number; y: number; v: number }>,
  threshold: number,
): Array<{ x: number; y: number }> {
  const out: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < corners.length; i++) {
    const cur = corners[i] as { x: number; y: number; v: number };
    const next = corners[(i + 1) % corners.length] as { x: number; y: number; v: number };
    if (cur.v >= threshold !== next.v >= threshold) {
      const t = (threshold - cur.v) / (next.v - cur.v);
      out.push({ x: cur.x + (next.x - cur.x) * t, y: cur.y + (next.y - cur.y) * t });
    }
  }
  return out;
}

function chunkCacheKey(cx: number, cy: number, bucket: ZoomBucket, overview: boolean): string {
  return `${bucket}|${overview ? "o" : "f"}|${cx}|${cy}`;
}

/** Water colour ramp from the shallows to deep water: a fine lookup table over the continuous
 * distance-to-shore, so depth reads as a smooth gradient rather than square patches (Phase 25B). */
const WATER_RAMP_STEPS = 48;
/** Distance (tiles) from the shoreline at which water reaches full depth colour. */
const WATER_DEPTH_REACH_TILES = 6;
const WATER_RAMP_COLORS: readonly string[] = Array.from({ length: WATER_RAMP_STEPS }, (_, i) =>
  mixHex(WATER_SHALLOW_COLOR, WATER_DEEP_COLOR, i / (WATER_RAMP_STEPS - 1)),
);

function mixHex(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  const c = (u: number, v: number): string =>
    Math.round(u + (v - u) * t)
      .toString(16)
      .padStart(2, "0");
  return `#${c(ar, br)}${c(ag, bg)}${c(ab, bb)}`;
}

/** Ramp colour for a distance to the shoreline (tiles; 0 = on the coast contour). */
export function waterColorAtDistance(d: number): string {
  const t = Math.min(1, Math.max(0, d) / WATER_DEPTH_REACH_TILES);
  return WATER_RAMP_COLORS[Math.round(t * (WATER_RAMP_STEPS - 1))] as string;
}

/**
 * Exact Euclidean distance (tiles, measured between tile centres) from every tile to the nearest
 * non-water tile, off-map counting as land — Felzenszwalb's linear-time squared distance transform
 * over the map padded with one land tile. Land tiles are 0. Computed once per map content version.
 */
export function shoreDistanceField(map: GameMap): Float32Array {
  const w = map.width + 2;
  const h = map.height + 2;
  const INF = 1e12;
  const f = new Float64Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const mx = x - 1;
      const my = y - 1;
      const water =
        mx >= 0 &&
        my >= 0 &&
        mx < map.width &&
        my < map.height &&
        (map.terrain[my * map.width + mx] as number) === WATER_ID;
      f[y * w + x] = water ? INF : 0;
    }
  }
  const n = Math.max(w, h);
  const v = new Int32Array(n);
  const z = new Float64Array(n + 1);
  const d = new Float64Array(n);
  const pass = (
    get: (i: number) => number,
    set: (i: number, val: number) => void,
    len: number,
  ): void => {
    let k = 0;
    v[0] = 0;
    z[0] = -INF;
    z[1] = INF;
    for (let q = 1; q < len; q++) {
      let sx: number;
      for (;;) {
        const p = v[k] as number;
        sx = (get(q) + q * q - (get(p) + p * p)) / (2 * q - 2 * p);
        if (sx <= (z[k] as number) && k > 0) k--;
        else break;
      }
      k++;
      v[k] = q;
      z[k] = sx;
      z[k + 1] = INF;
    }
    k = 0;
    for (let q = 0; q < len; q++) {
      while ((z[k + 1] as number) < q) k++;
      const p = v[k] as number;
      d[q] = (q - p) * (q - p) + get(p);
    }
    for (let q = 0; q < len; q++) set(q, d[q] as number);
  };
  for (let x = 0; x < w; x++) {
    pass(
      (i) => f[i * w + x] as number,
      (i, val) => {
        f[i * w + x] = val;
      },
      h,
    );
  }
  for (let y = 0; y < h; y++) {
    pass(
      (i) => f[y * w + i] as number,
      (i, val) => {
        f[y * w + i] = val;
      },
      w,
    );
  }
  const out = new Float32Array(map.width * map.height);
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++)
      out[y * map.width + x] = Math.sqrt(f[(y + 1) * w + x + 1] as number);
  }
  return out;
}

interface ShimmerDot {
  x: number;
  y: number;
}

interface CityCenter {
  cx: number;
  cy: number;
  maxDist: number;
  /** Footprint tile closest to the centroid: where the landmark stands. */
  landmarkTile: number;
}

export class TerrainRenderer {
  private cache = new ChunkCache<HTMLCanvasElement>(TERRAIN_CHUNK_CACHE_MAX);
  private hiCache = new ChunkCache<HTMLCanvasElement>(HI_RES_CHUNK_CACHE_MAX);
  private map: GameMap;
  private cities: readonly City[];
  private industries: readonly Industry[];
  private cityCenters = new Map<number, CityCenter>();
  /** Distance-to-shore per tile, built lazily; dropped whenever the map content changes. */
  private shoreDist: Float32Array | null = null;
  /** City tiles a station's platforms/building/improvements stand on: drawn without houses (PLAN 23B). */
  private stationFootprint: ReadonlySet<number> = new Set();
  private shimmerDots: ShimmerDot[] = [];
  private lastShimmerUpdate = -Infinity;
  private lastShimmerKey = "";

  constructor(map: GameMap, cities: readonly City[] = [], industries: readonly Industry[] = []) {
    this.map = map;
    this.cities = cities;
    this.industries = industries;
    this.computeCityCenters();
  }

  setMap(map: GameMap, cities: readonly City[] = [], industries: readonly Industry[] = []): void {
    this.map = map;
    this.cities = cities;
    this.industries = industries;
    this.cache.clear();
    this.hiCache.clear();
    this.shoreDist = null;
    this.shimmerDots = [];
    this.lastShimmerUpdate = -Infinity;
    this.computeCityCenters();
  }

  /** Call after `GameState.mapContentVersion` bumps — a city's footprint grew or a new industry
   * spawned (Phase 9), mutating the same `cities`/`industries` arrays this renderer already holds
   * rather than replacing them, so the chunk cache (baked at first draw) needs busting even though
   * the references themselves didn't change. Clears every cached chunk at every zoom bucket, same
   * as `setMap`, but keeps the shimmer animation state instead of resetting it. */
  refreshContent(): void {
    this.shoreDist = null;
    this.cache.clear();
    this.hiCache.clear();
    this.computeCityCenters();
  }

  /** Sets the city tiles covered by stations; re-bakes the chunks only when the set really changed. */
  setStationFootprint(tiles: ReadonlySet<number>): void {
    if (tiles.size === this.stationFootprint.size) {
      let same = true;
      for (const t of tiles) {
        if (!this.stationFootprint.has(t)) {
          same = false;
          break;
        }
      }
      if (same) return;
    }
    this.stationFootprint = tiles;
    this.cache.clear();
    this.hiCache.clear();
  }

  /** Number of chunk canvases currently cached (bounded by `TERRAIN_CHUNK_CACHE_MAX`) — exposed
   * for the Phase 12 memory-bounds e2e test. */
  get cacheSize(): number {
    return this.cache.size + this.hiCache.size;
  }

  /** Precomputes each city's footprint centroid and its farthest tile's distance from it, so
   * per-tile rendering can tell how close a tile is to the city's core (SPEC §10.3: denser/
   * taller roof clusters toward the center) without re-scanning the footprint every tile. */
  private computeCityCenters(): void {
    this.cityCenters.clear();
    for (const city of this.cities) {
      let sx = 0;
      let sy = 0;
      for (const idx of city.tiles) {
        sx += idx % this.map.width;
        sy += Math.floor(idx / this.map.width);
      }
      const cx = sx / city.tiles.length;
      const cy = sy / city.tiles.length;
      let maxDist = 0;
      let landmarkTile = city.tiles[0] as number;
      let best = Infinity;
      for (const idx of city.tiles) {
        const tx = idx % this.map.width;
        const ty = Math.floor(idx / this.map.width);
        const d = Math.hypot(tx - cx, ty - cy);
        maxDist = Math.max(maxDist, d);
        if (d < best) {
          best = d;
          landmarkTile = idx;
        }
      }
      this.cityCenters.set(city.id, { cx, cy, maxDist: Math.max(maxDist, 0.5), landmarkTile });
    }
  }

  draw(
    ctx: CanvasRenderingContext2D,
    camera: Camera,
    viewportW: number,
    viewportH: number,
    timeMs: number,
  ): void {
    const bucket = pickBucket(camera.zoom);
    const overview = bucket === 0.25;
    const chunkWorldSize = CHUNK_TILES * TILE_SIZE;
    const chunksX = Math.ceil(this.map.width / CHUNK_TILES);
    const chunksY = Math.ceil(this.map.height / CHUNK_TILES);

    const topLeft = camera.screenToWorld(0, 0, viewportW, viewportH);
    const bottomRight = camera.screenToWorld(viewportW, viewportH, viewportW, viewportH);
    const margin = bucket === 2 ? 0 : 1;
    const cache = bucket === 2 ? this.hiCache : this.cache;
    const chunkMinX = Math.max(0, Math.floor(topLeft.x / chunkWorldSize) - margin);
    const chunkMinY = Math.max(0, Math.floor(topLeft.y / chunkWorldSize) - margin);
    const chunkMaxX = Math.min(chunksX - 1, Math.floor(bottomRight.x / chunkWorldSize) + margin);
    const chunkMaxY = Math.min(chunksY - 1, Math.floor(bottomRight.y / chunkWorldSize) + margin);

    // Cap how many never-before-seen chunks get rasterized in a single frame, so panning into
    // fresh territory can't stall the frame — the rest fill in over the next couple of frames.
    // Overview chunks skip decorations but share the smooth borders/coast/water, so they are budgeted too.
    let chunksRenderedThisFrame = 0;
    const CHUNK_RENDER_BUDGET = overview ? 8 : bucket === 2 ? 6 : 4;

    for (let cy = chunkMinY; cy <= chunkMaxY; cy++) {
      for (let cx = chunkMinX; cx <= chunkMaxX; cx++) {
        const key = chunkCacheKey(cx, cy, bucket, overview);
        let canvas = cache.get(key);
        if (!canvas) {
          if (chunksRenderedThisFrame >= CHUNK_RENDER_BUDGET) continue;
          canvas = this.renderChunk(cx, cy, bucket, overview);
          cache.set(key, canvas);
          chunksRenderedThisFrame++;
        }
        const tilesX = Math.min(CHUNK_TILES, this.map.width - cx * CHUNK_TILES);
        const tilesY = Math.min(CHUNK_TILES, this.map.height - cy * CHUNK_TILES);
        const px = TILE_SIZE * bucket;
        const pad = CHUNK_PAD_TILES;
        // Only the interior is composited (the pad just supplies neighbours' overflow), with the
        // chunk boundaries snapped to device pixels so neighbours abut exactly.
        drawChunkSnapped(
          ctx,
          camera,
          viewportW,
          viewportH,
          canvas,
          { x: pad * px, y: pad * px, w: tilesX * px, h: tilesY * px },
          {
            x0: cx * chunkWorldSize,
            y0: cy * chunkWorldSize,
            x1: cx * chunkWorldSize + tilesX * TILE_SIZE,
            y1: cy * chunkWorldSize + tilesY * TILE_SIZE,
          },
        );
      }
    }

    if (!overview) {
      this.drawWaterShimmer(
        ctx,
        camera,
        viewportW,
        viewportH,
        timeMs,
        chunkMinX,
        chunkMinY,
        chunkMaxX,
        chunkMaxY,
      );
    }
  }

  private renderChunk(
    cx: number,
    cy: number,
    bucket: ZoomBucket,
    overview: boolean,
  ): HTMLCanvasElement {
    const tilesX = Math.min(CHUNK_TILES, this.map.width - cx * CHUNK_TILES);
    const tilesY = Math.min(CHUNK_TILES, this.map.height - cy * CHUNK_TILES);
    const px = TILE_SIZE * bucket;
    // A ring of neighbouring tiles is drawn around the chunk (and only the interior is shown), so
    // trees, shadows and washes that spill over a chunk border continue into the next chunk
    // instead of being cut off flat along it.
    const pad = CHUNK_PAD_TILES;
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.ceil((tilesX + 2 * pad) * px));
    canvas.height = Math.max(1, Math.ceil((tilesY + 2 * pad) * px));
    const ctx = canvas.getContext("2d");
    if (!ctx) return canvas;

    const originX = cx * CHUNK_TILES - pad;
    const originY = cy * CHUNK_TILES - pad;
    const spanX = tilesX + 2 * pad;
    const spanY = tilesY + 2 * pad;

    // Ground for every tile first, then the things standing on it, so a tile's overlays never paint
    // over a neighbour's trees and roofs.
    for (const decor of overview ? [false] : [false, true]) {
      for (let ty = 0; ty < spanY; ty++) {
        for (let tx = 0; tx < spanX; tx++) {
          if (!inBounds(this.map, originX + tx, originY + ty)) continue;
          this.drawTile(ctx, originX + tx, originY + ty, tx * px, ty * px, px, overview, decor);
        }
      }
    }
    this.drawRivers(ctx, originX, originY, spanX, spanY, px, overview);
    if (!overview) this.drawIndustries(ctx, originX, originY, spanX, spanY, px);
    return canvas;
  }

  /** Industry art spills half a tile past its tile, so it is drawn after the terrain of the whole
   * chunk — including industries just outside it, whose overflow lands in this chunk. */
  private drawIndustries(
    ctx: CanvasRenderingContext2D,
    originX: number,
    originY: number,
    tilesX: number,
    tilesY: number,
    px: number,
  ): void {
    this.industries.forEach((ind, i) => {
      if (ind.x < originX - 1 || ind.x > originX + tilesX || ind.y < originY - 1) return;
      if (ind.y > originY + tilesY) return;
      // Only industries the map still lists on their tile (tests and demolition clear the map).
      if ((this.map.industryId[tileIndex(this.map, ind.x, ind.y)] as number) !== i) return;
      seedTile(ind.x, ind.y, 91);
      drawIndustryIcon(ctx, ind.type, (ind.x - originX) * px, (ind.y - originY) * px, px);
    });
  }

  private drawTile(
    ctx: CanvasRenderingContext2D,
    mapX: number,
    mapY: number,
    px: number,
    py: number,
    size: number,
    overview: boolean,
    decor: boolean,
  ): void {
    const idx = tileIndex(this.map, mapX, mapY);
    const terrain = terrainName(this.map.terrain[idx] as number);
    const baseColor = renderColorFor(this.map, mapX, mapY);
    seedTile(mapX, mapY);

    if (!decor) {
      if (terrain === "water") {
        this.drawWaterTile(ctx, mapX, mapY, px, py, size);
      } else {
        this.drawShadedTile(ctx, mapX, mapY, px, py, size, baseColor);
      }
      this.drawLandBorders(ctx, mapX, mapY, px, py, size);
      this.drawCoastlineContour(ctx, mapX, mapY, px, py, size, terrain === "water");
      if (overview) this.drawOverviewCity(ctx, idx, px, py, size);
      return;
    }

    const cityId = this.map.cityId[idx] as number;
    const industryIdx = this.map.industryId[idx] as number;
    if (cityId >= 0 && this.cities[cityId]) {
      const city = this.cities[cityId] as City;
      const center = this.cityCenters.get(city.id);
      const closeness = center
        ? 1 - Math.min(1, Math.hypot(mapX - center.cx, mapY - center.cy) / center.maxDist)
        : 1;
      drawCityRoofs(
        ctx,
        px,
        py,
        size,
        city.tier,
        closeness,
        center?.landmarkTile === idx,
        this.stationFootprint.has(idx),
      );
    } else if (industryIdx >= 0 && this.industries[industryIdx]) {
      // Drawn as a ~2x2 tile cluster by `drawIndustries` once the chunk's tiles are down.
    } else {
      this.drawDecoration(ctx, mapX, mapY, terrain, px, py, size);
    }
  }

  /** Distance-to-shore (tiles) of tile (x, y); land and off-map are 0. */
  private shoreDistanceAt(x: number, y: number): number {
    if (!inBounds(this.map, x, y)) return 0;
    this.shoreDist ??= shoreDistanceField(this.map);
    return this.shoreDist[y * this.map.width + x] as number;
  }

  /** Water as a grid of subcells whose colour follows the bilinearly-interpolated distance to the
   * coast contour (half a tile past the last water tile centre), so depth is a smooth gradient. */
  private drawWaterTile(
    ctx: CanvasRenderingContext2D,
    mapX: number,
    mapY: number,
    px: number,
    py: number,
    size: number,
  ): void {
    const sub = size / SHADE_SUBCELLS;
    const pad = 0.75;
    for (let sy = 0; sy < SHADE_SUBCELLS; sy++) {
      const fy = mapY - 0.5 + (sy + 0.5) / SHADE_SUBCELLS;
      const y0 = Math.floor(fy);
      const ty = fy - y0;
      for (let sx = 0; sx < SHADE_SUBCELLS; sx++) {
        const fx = mapX - 0.5 + (sx + 0.5) / SHADE_SUBCELLS;
        const x0 = Math.floor(fx);
        const tx = fx - x0;
        const d =
          (this.shoreDistanceAt(x0, y0) * (1 - tx) + this.shoreDistanceAt(x0 + 1, y0) * tx) *
            (1 - ty) +
          (this.shoreDistanceAt(x0, y0 + 1) * (1 - tx) +
            this.shoreDistanceAt(x0 + 1, y0 + 1) * tx) *
            ty;
        ctx.fillStyle = waterColorAtDistance(d - 0.5);
        // Overlap only between this tile's own subcells: bleeding past the tile border painted a
        // hairline of water over the land tiles drawn before it.
        const lo = (k: number): number => (k === 0 ? 0 : pad / 2);
        const hi = (k: number): number => (k === SHADE_SUBCELLS - 1 ? 0 : pad / 2);
        ctx.fillRect(
          px + sx * sub - lo(sx),
          py + sy * sub - lo(sy),
          sub + lo(sx) + hi(sx),
          sub + lo(sy) + hi(sy),
        );
      }
    }
  }

  /** Overview only: a city tile as a small roof-coloured square, so towns show without their art. */
  private drawOverviewCity(
    ctx: CanvasRenderingContext2D,
    idx: number,
    px: number,
    py: number,
    size: number,
  ): void {
    const cityId = this.map.cityId[idx] as number;
    if (cityId < 0 || !this.cities[cityId]) return;
    ctx.fillStyle = CITY_ROOF_COLORS[cityId % CITY_ROOF_COLORS.length] as string;
    const inset = size * 0.15;
    ctx.fillRect(px + inset, py + inset, size - 2 * inset, size - 2 * inset);
  }

  /** Fills the tile as a small grid of bilinearly-shaded subcells — smoother, stronger hillshading. */
  private drawShadedTile(
    ctx: CanvasRenderingContext2D,
    mapX: number,
    mapY: number,
    px: number,
    py: number,
    size: number,
    baseColor: string,
  ): void {
    const sub = size / SHADE_SUBCELLS;
    const pad = 0.75; // avoid faint seams between adjacent subcell rects
    for (let sy = 0; sy < SHADE_SUBCELLS; sy++) {
      for (let sx = 0; sx < SHADE_SUBCELLS; sx++) {
        const fx = mapX - 0.5 + (sx + 0.5) / SHADE_SUBCELLS;
        const fy = mapY - 0.5 + (sy + 0.5) / SHADE_SUBCELLS;
        const shade = hillshadeFactorAt(this.map, fx, fy);
        ctx.fillStyle = shadeColor(baseColor, shade);
        // Overlap only between the tile's own subcells (see `drawWaterTile`).
        const lo = (k: number): number => (k === 0 ? 0 : pad / 2);
        const hi = (k: number): number => (k === SHADE_SUBCELLS - 1 ? 0 : pad / 2);
        ctx.fillRect(
          px + sx * sub - lo(sx),
          py + sy * sub - lo(sy),
          sub + lo(sx) + hi(sx),
          sub + lo(sy) + hi(sy),
        );
      }
    }
  }

  /**
   * Smooth, noise-perturbed contours between land classes (grass↔forest, grass↔hills,
   * hills↔mountains, …) — the same idea as the coastline: a kernel-smoothed per-class field at the
   * tile corners is interpolated over a 4x4 subcell grid, a value-noise term wobbles it, and the
   * subcells' marching-squares polygons (field ≥ 0.5) become a clip path in which the *neighbouring*
   * class is painted, shaded, over this tile's own base. Corner fields and noise are functions of
   * absolute tile coordinates and the noise's sign flips with the class order, so the two tiles either
   * side of a border trace the very same curve. A tile the contour would flip entirely (a one-tile
   * strip or speck) keeps its own class so thin features survive.
   */
  private drawLandBorders(
    ctx: CanvasRenderingContext2D,
    mapX: number,
    mapY: number,
    px: number,
    py: number,
    size: number,
  ): void {
    const own = this.landClassAt(mapX, mapY);
    if (own < 0) return;
    let others: number[] | null = null;
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const c = this.landClassAt(mapX + dx, mapY + dy);
        if (c >= 0 && c !== own) {
          others ??= [];
          if (!others.includes(c)) others.push(c);
        }
      }
    }
    if (!others) return;
    others.sort((p, q) => p - q);

    const sub = size / SHADE_SUBCELLS;
    const pad = 0.75;
    const bleed = Math.max(1.5, pad); // px the clip overlaps the neighbouring tile
    const n = SHADE_SUBCELLS + 1;
    const field = new Float64Array(n * n);
    for (const cls of others) {
      const f00 = this.classField(mapX, mapY, cls);
      const f10 = this.classField(mapX + 1, mapY, cls);
      const f01 = this.classField(mapX, mapY + 1, cls);
      const f11 = this.classField(mapX + 1, mapY + 1, cls);
      if (Math.max(f00, f10, f01, f11) < 0.5 - LAND_BORDER_NOISE) continue;
      const sign = cls > own ? 1 : -1;
      let low = false;
      let high = false;
      for (let j = 0; j < n; j++) {
        const v = j / SHADE_SUBCELLS;
        for (let i = 0; i < n; i++) {
          const u = i / SHADE_SUBCELLS;
          const base = (f00 * (1 - u) + f10 * u) * (1 - v) + (f01 * (1 - u) + f11 * u) * v;
          const value = base + sign * LAND_BORDER_NOISE * valueNoise2(mapX + u, mapY + v);
          field[j * n + i] = value;
          if (value >= 0.5) high = true;
          else low = true;
        }
      }
      if (!high || !low) continue; // no contour through this tile, or it would flip it entirely
      const path = new Path2D();
      let any = false;
      for (let sy = 0; sy < SHADE_SUBCELLS; sy++) {
        for (let sx = 0; sx < SHADE_SUBCELLS; sx++) {
          const poly = marchingSquaresPolygon(
            [
              { x: sx, y: sy, v: field[sy * n + sx] as number },
              { x: sx + 1, y: sy, v: field[sy * n + sx + 1] as number },
              { x: sx + 1, y: sy + 1, v: field[(sy + 1) * n + sx + 1] as number },
              { x: sx, y: sy + 1, v: field[(sy + 1) * n + sx] as number },
            ],
            0.5,
            "ge",
          );
          if (poly.length < 3) continue;
          any = true;
          // Vertices on the tile's own border are pushed out half a pad, so the clip overlaps the
          // neighbouring tile's clip instead of leaving an anti-aliased hairline along the border.
          const at = (pt: { x: number; y: number }): [number, number] => {
            const gx =
              pt.x <= 0
                ? -bleed / sub
                : pt.x >= SHADE_SUBCELLS
                  ? SHADE_SUBCELLS + bleed / sub
                  : pt.x;
            const gy =
              pt.y <= 0
                ? -bleed / sub
                : pt.y >= SHADE_SUBCELLS
                  ? SHADE_SUBCELLS + bleed / sub
                  : pt.y;
            return [px + gx * sub, py + gy * sub];
          };
          path.moveTo(...at(poly[0] as { x: number; y: number }));
          for (let k = 1; k < poly.length; k++)
            path.lineTo(...at(poly[k] as { x: number; y: number }));
          path.closePath();
        }
      }
      if (!any) continue;
      const color = LAND_CLASS_COLORS[cls] as string;
      ctx.save();
      ctx.clip(path);
      for (let sy = 0; sy < SHADE_SUBCELLS; sy++) {
        for (let sx = 0; sx < SHADE_SUBCELLS; sx++) {
          const fx = mapX - 0.5 + (sx + 0.5) / SHADE_SUBCELLS;
          const fy = mapY - 0.5 + (sy + 0.5) / SHADE_SUBCELLS;
          ctx.fillStyle = shadeColor(color, hillshadeFactorAt(this.map, fx, fy));
          const lo = (k: number): number => (k === 0 ? bleed : pad / 2);
          const hi = (k: number): number => (k === SHADE_SUBCELLS - 1 ? bleed : pad / 2);
          ctx.fillRect(
            px + sx * sub - lo(sx),
            py + sy * sub - lo(sy),
            sub + lo(sx) + hi(sx),
            sub + lo(sy) + hi(sy),
          );
        }
      }
      ctx.restore();
    }
  }

  /** Land class of a tile (see `LAND_CLASS_OF`), or −1 for water and off-map. */
  private landClassAt(x: number, y: number): number {
    if (!inBounds(this.map, x, y)) return -1;
    return groundClassOf(this.map, x, y);
  }

  /** Share of class `cls` among the land tiles under the [1 3 3 1]² kernel around grid corner (gx, gy). */
  private classField(gx: number, gy: number, cls: number): number {
    let land = 0;
    let sum = 0;
    for (let j = 0; j < 4; j++) {
      const wy = CORNER_KERNEL[j] as number;
      for (let i = 0; i < 4; i++) {
        const c = this.landClassAt(gx - 2 + i, gy - 2 + j);
        if (c < 0) continue;
        const w = wy * (CORNER_KERNEL[i] as number);
        land += w;
        if (c === cls) sum += w;
      }
    }
    return land > 0 ? sum / land : 0;
  }

  /**
   * "Water-ness" (0..1) of the grid corner at (gx, gy): a smooth (Phase 23A) [1 3 3 1]x[1 3 3 1]
   * weighted average over the 4x4 tiles around that corner point. This is the marching-squares
   * input: along a straight coastline every corner sits at exactly 0.5 (the kernel is symmetric),
   * while a staircase coast is low-pass filtered, so thresholding at 0.5 and interpolating along
   * each tile edge traces a rounded contour instead of the tile grid's own steps. Off-map tiles
   * count as land (a map edge isn't itself a coastline unless a real water tile makes it one).
   */
  private cornerWaterness(gx: number, gy: number): number {
    let sum = 0;
    for (let j = 0; j < 4; j++) {
      const ty = gy - 2 + j;
      const wy = CORNER_KERNEL[j] as number;
      for (let i = 0; i < 4; i++) {
        const tx = gx - 2 + i;
        if (
          inBounds(this.map, tx, ty) &&
          (this.map.terrain[tileIndex(this.map, tx, ty)] as number) === WATER_ID
        ) {
          sum += wy * (CORNER_KERNEL[i] as number);
        }
      }
    }
    return sum / 64;
  }

  /** True when every tile in the 5x5 block around (mapX, mapY) is water, or none is — no coast here. */
  private uniformNeighbourhood(mapX: number, mapY: number): boolean {
    let water = 0;
    let total = 0;
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const x = mapX + dx;
        const y = mapY + dy;
        if (!inBounds(this.map, x, y)) continue;
        total++;
        if ((this.map.terrain[tileIndex(this.map, x, y)] as number) === WATER_ID) water++;
      }
    }
    return water === 0 || water === total;
  }

  /**
   * Marching-squares coastline (SPEC §10.3 / Phase 2 & 11 review carry-over: "smooth coastlines
   * ... true marching-squares contour instead of per-tile steps"). Every land tile bordering water
   * gets the true, continuously-interpolated water polygon for its corner cut filled and feathered
   * on top of its base color (and the mirror image for a water tile bordering land) — a real
   * geometric contour line instead of jittered gradient blobs approximating one. A tile the
   * contour would flip entirely (a 1-tile strait or spit) is left alone so thin features survive.
   */
  private drawCoastlineContour(
    ctx: CanvasRenderingContext2D,
    mapX: number,
    mapY: number,
    px: number,
    py: number,
    size: number,
    isWater: boolean,
  ): void {
    if (this.uniformNeighbourhood(mapX, mapY)) return;
    const c00 = this.cornerWaterness(mapX, mapY);
    const c10 = this.cornerWaterness(mapX + 1, mapY);
    const c11 = this.cornerWaterness(mapX + 1, mapY + 1);
    const c01 = this.cornerWaterness(mapX, mapY + 1);
    const minC = Math.min(c00, c10, c11, c01);
    const maxC = Math.max(c00, c10, c11, c01);
    // Uniform corners (deep inland or open water) — no coastline through this tile, nothing to do.
    if (maxC < 0.5 || minC >= 0.5) return;

    const corners = [
      { x: 0, y: 0, v: c00 },
      { x: size, y: 0, v: c10 },
      { x: size, y: size, v: c11 },
      { x: 0, y: size, v: c01 },
    ];
    // On a land tile, cut out the water polygon (>= threshold); on a water tile, cut out the land
    // polygon (< threshold) — same corner field, the complementary side of the same contour.
    const polygon = marchingSquaresPolygon(corners, 0.5, isWater ? "lt" : "ge");
    if (polygon.length < 3) return;

    const fillColor = isWater ? this.landNeighborColor(mapX, mapY) : WATER_SHALLOW_COLOR;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(px + (polygon[0] as { x: number }).x, py + (polygon[0] as { y: number }).y);
    for (let i = 1; i < polygon.length; i++) {
      ctx.lineTo(px + (polygon[i] as { x: number }).x, py + (polygon[i] as { y: number }).y);
    }
    ctx.closePath();
    ctx.fillStyle = fillColor;
    ctx.fill();

    // Soft blurred stroke along the true contour so the boundary feathers instead of showing a
    // hard edge between the polygon fill and this tile's own base color.
    // Only the contour itself is stroked, not the polygon's edges along the tile border (those
    // drew faint tile-shaped outlines between neighbouring land tiles).
    ctx.shadowColor = withAlpha(fillColor, 0.5);
    ctx.shadowBlur = size * 0.22;
    ctx.strokeStyle = withAlpha(fillColor, 0.35);
    ctx.lineWidth = size * 0.1;
    ctx.beginPath();
    const crossings = contourCrossings(corners, 0.5);
    for (let i = 0; i + 1 < crossings.length; i += 2) {
      const a = crossings[i] as { x: number; y: number };
      const b = crossings[i + 1] as { x: number; y: number };
      ctx.moveTo(px + a.x, py + a.y);
      ctx.lineTo(px + b.x, py + b.y);
    }
    ctx.stroke();
    ctx.restore();
  }

  /** Picks a representative land color for a water tile's coastline patch — the first non-water
   * 8-neighbor found, in a fixed scan order (deterministic, not random, so the same tile always
   * blends toward the same color across re-renders). Falls back to plain in the (unreachable in
   * practice, since this is only called when the tile has at least one land corner) case none is
   * found. */
  private landNeighborColor(mapX: number, mapY: number): string {
    for (const [dx, dy] of DIRS8) {
      const nx = mapX + dx;
      const ny = mapY + dy;
      if (!inBounds(this.map, nx, ny)) continue;
      const nIdx = tileIndex(this.map, nx, ny);
      if ((this.map.terrain[nIdx] as number) !== WATER_ID) return terrainColorFor(this.map, nIdx);
    }
    return TERRAIN_COLORS.plain;
  }

  private drawDecoration(
    ctx: CanvasRenderingContext2D,
    mapX: number,
    mapY: number,
    terrain: Terrain,
    px: number,
    py: number,
    size: number,
  ): void {
    switch (terrain) {
      case "forest":
        this.drawForestClusters(ctx, px, py, size);
        break;
      case "hills":
        this.drawHillBumps(ctx, px, py, size);
        break;
      case "mountain":
        this.drawMountainPeaks(ctx, mapX, mapY, px, py, size);
        break;
      case "plain":
        if (size >= 12 && this.nearFarm(mapX, mapY) && rand() < 0.7) {
          this.drawFarmField(ctx, px, py, size);
          break;
        }
        this.drawSpeckle(ctx, terrain, px, py, size);
        break;
      case "desert":
      case "swamp":
      case "river":
        this.drawSpeckle(ctx, terrain, px, py, size);
        break;
      default:
        break;
    }
  }

  /** 2–4 trees: an offset ground shadow, a dark base canopy and a lighter top-left crown (two-tone),
   * so the forest reads lit from the upper left like the rest of the map. */
  private drawForestClusters(
    ctx: CanvasRenderingContext2D,
    px: number,
    py: number,
    size: number,
  ): void {
    const count = 2 + Math.floor(rand() * 3);
    for (let i = 0; i < count; i++) {
      const cx = px + size * (0.15 + rand() * 0.7);
      const cy = py + size * (0.15 + rand() * 0.7);
      const r = size * (0.12 + rand() * 0.08);
      const conifer = rand() < 0.3;

      ctx.fillStyle = FOREST_SHADOW_COLOR;
      ctx.beginPath();
      ctx.ellipse(cx + r * 0.55, cy + r * 0.6, r * 0.95, r * 0.8, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = conifer ? "#2F5A3A" : "#3F6B35";
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = conifer ? "#437A4C" : FOREST_CANOPY_COLOR;
      ctx.beginPath();
      ctx.arc(cx - r * 0.2, cy - r * 0.22, r * 0.68, 0, Math.PI * 2);
      ctx.fill();

      if (size >= 24) {
        ctx.fillStyle = "rgba(210, 235, 150, 0.32)";
        ctx.beginPath();
        ctx.arc(cx - r * 0.38, cy - r * 0.4, r * 0.28, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  /** True when a 4-neighbour tile holds a farm or ranch. */
  private nearFarm(mapX: number, mapY: number): boolean {
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const nx = mapX + dx;
      const ny = mapY + dy;
      if (!inBounds(this.map, nx, ny)) continue;
      const id = this.map.industryId[tileIndex(this.map, nx, ny)] as number;
      const type = id >= 0 ? this.industries[id]?.type : undefined;
      if (type === "farm") return true;
    }
    return false;
  }

  /** A striped crop plot on plain ground beside a farm: two alternating tones in furrow rows. */
  private drawFarmField(ctx: CanvasRenderingContext2D, px: number, py: number, size: number): void {
    const palettes: Array<[string, string]> = [
      ["#C9AE4E", "#B99A3E"],
      ["#8FAE4A", "#7E9E3F"],
      ["#A88A56", "#957845"],
    ];
    const [c1, c2] = palettes[Math.floor(rand() * palettes.length)] as [string, string];
    const vertical = rand() < 0.5;
    const inset = size * 0.06;
    const n = 6;
    const span = size - inset * 2;
    for (let i = 0; i < n; i++) {
      ctx.fillStyle = i % 2 === 0 ? c1 : c2;
      if (vertical) ctx.fillRect(px + inset + (span / n) * i, py + inset, span / n + 0.5, span);
      else ctx.fillRect(px + inset, py + inset + (span / n) * i, span, span / n + 0.5);
    }
    ctx.strokeStyle = "rgba(60, 45, 20, 0.35)";
    ctx.lineWidth = 1;
    ctx.strokeRect(px + inset, py + inset, span, span);
  }

  /** 2–3 soft bump highlights (light NW, dark SE) to read as gentle mounds. */
  private drawHillBumps(ctx: CanvasRenderingContext2D, px: number, py: number, size: number): void {
    const count = 2 + Math.floor(rand() * 2);
    for (let i = 0; i < count; i++) {
      const cx = px + size * (0.2 + rand() * 0.6);
      const cy = py + size * (0.2 + rand() * 0.6);
      const r = size * (0.18 + rand() * 0.1);
      const gradient = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, 0, cx, cy, r);
      gradient.addColorStop(0, "rgba(255, 255, 255, 0.2)");
      gradient.addColorStop(0.55, "rgba(255, 255, 255, 0.04)");
      gradient.addColorStop(1, "rgba(50, 35, 15, 0.14)");
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.ellipse(cx, cy, r, r * 0.7, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /** 1–2 small peak triangles: lighter NW-facing side, darker SE-facing side, snowcap only at elevation 9. */
  private drawMountainPeaks(
    ctx: CanvasRenderingContext2D,
    mapX: number,
    mapY: number,
    px: number,
    py: number,
    size: number,
  ): void {
    const elevation = this.map.elevation[tileIndex(this.map, mapX, mapY)] as number;
    const count = rand() < 0.5 ? 1 : 2;
    for (let i = 0; i < count; i++) {
      const baseX = px + size * (0.25 + rand() * 0.5);
      const baseY = py + size * (0.7 + rand() * 0.15);
      const peakH = size * (0.35 + rand() * 0.15);
      const halfW = size * 0.22;
      const apexX = baseX;
      const apexY = baseY - peakH;

      ctx.fillStyle = "rgba(255, 255, 255, 0.22)";
      ctx.beginPath();
      ctx.moveTo(apexX, apexY);
      ctx.lineTo(baseX - halfW, baseY);
      ctx.lineTo(baseX, baseY);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = "rgba(30, 25, 20, 0.28)";
      ctx.beginPath();
      ctx.moveTo(apexX, apexY);
      ctx.lineTo(baseX, baseY);
      ctx.lineTo(baseX + halfW, baseY);
      ctx.closePath();
      ctx.fill();

      if (elevation >= SNOWCAP_MIN_ELEVATION) {
        const capH = peakH * 0.32;
        const capHalfW = halfW * 0.42;
        ctx.fillStyle = SNOWCAP_COLOR;
        ctx.beginPath();
        ctx.moveTo(apexX, apexY);
        ctx.lineTo(apexX - capHalfW, apexY + capH);
        ctx.lineTo(apexX + capHalfW, apexY + capH);
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  private drawSpeckle(
    ctx: CanvasRenderingContext2D,
    terrain: Terrain,
    px: number,
    py: number,
    size: number,
  ): void {
    const counts: Partial<Record<Terrain, number>> = { plain: 4, desert: 4, swamp: 4, river: 2 };
    const count = counts[terrain] ?? 0;
    if (count === 0) return;

    ctx.fillStyle = withAlpha("#000000", 0.08);
    for (let i = 0; i < count; i++) {
      const sx = px + rand() * size;
      const sy = py + rand() * size;
      const r = size * (0.02 + rand() * 0.035);
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private indexToXY(idx: number): [number, number] {
    return [idx % this.map.width, Math.floor(idx / this.map.width)];
  }

  private findRiverPrevs(mapX: number, mapY: number, idx: number): Array<[number, number]> {
    const prevs: Array<[number, number]> = [];
    for (const [dx, dy] of DIRS8) {
      const nx = mapX + dx;
      const ny = mapY + dy;
      if (!inBounds(this.map, nx, ny)) continue;
      const nIdx = tileIndex(this.map, nx, ny);
      if (
        (this.map.terrain[nIdx] as number) === RIVER_ID &&
        (this.map.riverNext[nIdx] as number) === idx
      ) {
        prevs.push([nx, ny]);
      }
    }
    return prevs;
  }

  /** Draws each river as one smoothed polyline (quadratic curves through tile centers, via
   * midpoints) following `riverNext`, instead of a mesh of straight segments between neighbors. */
  private drawRivers(
    ctx: CanvasRenderingContext2D,
    originX: number,
    originY: number,
    tilesX: number,
    tilesY: number,
    px: number,
    overview: boolean,
  ): void {
    ctx.strokeStyle = RIVER_LINE_COLOR;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const localCenter = (mapX: number, mapY: number): [number, number] => [
      (mapX - originX + 0.5) * px,
      (mapY - originY + 0.5) * px,
    ];

    for (let ty = 0; ty < tilesY; ty++) {
      for (let tx = 0; tx < tilesX; tx++) {
        const mapX = originX + tx;
        const mapY = originY + ty;
        if (!inBounds(this.map, mapX, mapY)) continue;
        const idx = tileIndex(this.map, mapX, mapY);
        if ((this.map.terrain[idx] as number) !== RIVER_ID) continue;

        const next = this.map.riverNext[idx] as number;
        if (next < 0) continue;
        const flow = this.map.riverFlow[idx] as number;
        // At overview zoom, rivers are just thin guide lines (SPEC §4.3) rather than
        // flow-proportional flood-stage widths, and get a floor so they don't anti-alias away to
        // nothing at a fraction of a device pixel.
        const width = overview
          ? Math.max(1, Math.min(1.75, 0.5 + flow * 0.003))
          : Math.max(2, Math.min(6, 2 + flow * 0.5)) * (px / TILE_SIZE);
        ctx.lineWidth = width;

        const [tcx, tcy] = localCenter(mapX, mapY);
        const [nx, ny] = this.indexToXY(next);
        const [ncx, ncy] = localCenter(nx, ny);
        const nextMidX = (tcx + ncx) / 2;
        const nextMidY = (tcy + ncy) / 2;

        const prevs = this.findRiverPrevs(mapX, mapY, idx);
        if (prevs.length === 0) {
          ctx.beginPath();
          ctx.moveTo(tcx, tcy);
          ctx.lineTo(nextMidX, nextMidY);
          ctx.stroke();
          continue;
        }
        for (const [px2, py2] of prevs) {
          const [pcx, pcy] = localCenter(px2, py2);
          const prevMidX = (pcx + tcx) / 2;
          const prevMidY = (pcy + tcy) / 2;
          ctx.beginPath();
          ctx.moveTo(prevMidX, prevMidY);
          ctx.quadraticCurveTo(tcx, tcy, nextMidX, nextMidY);
          ctx.stroke();
        }
      }
    }
  }

  private drawWaterShimmer(
    ctx: CanvasRenderingContext2D,
    camera: Camera,
    viewportW: number,
    viewportH: number,
    timeMs: number,
    chunkMinX: number,
    chunkMinY: number,
    chunkMaxX: number,
    chunkMaxY: number,
  ): void {
    const key = `${chunkMinX}|${chunkMinY}|${chunkMaxX}|${chunkMaxY}`;
    if (timeMs - this.lastShimmerUpdate > 400 || key !== this.lastShimmerKey) {
      this.lastShimmerUpdate = timeMs;
      this.lastShimmerKey = key;
      this.shimmerDots = this.pickShimmerDots(chunkMinX, chunkMinY, chunkMaxX, chunkMaxY, 24);
    }

    ctx.fillStyle = "rgba(255, 255, 255, 0.55)";
    for (const dot of this.shimmerDots) {
      const screen = camera.worldToScreen(dot.x, dot.y, viewportW, viewportH);
      if (screen.x < -8 || screen.y < -8 || screen.x > viewportW + 8 || screen.y > viewportH + 8)
        continue;
      const r = Math.max(1, 1.4 * camera.zoom);
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private pickShimmerDots(
    chunkMinX: number,
    chunkMinY: number,
    chunkMaxX: number,
    chunkMaxY: number,
    count: number,
  ): ShimmerDot[] {
    const minX = Math.max(0, chunkMinX * CHUNK_TILES);
    const minY = Math.max(0, chunkMinY * CHUNK_TILES);
    const maxX = Math.min(this.map.width - 1, (chunkMaxX + 1) * CHUNK_TILES - 1);
    const maxY = Math.min(this.map.height - 1, (chunkMaxY + 1) * CHUNK_TILES - 1);
    if (maxX < minX || maxY < minY) return [];

    const dots: ShimmerDot[] = [];
    for (let attempt = 0; attempt < count * 6 && dots.length < count; attempt++) {
      const x = minX + Math.floor(rand() * (maxX - minX + 1));
      const y = minY + Math.floor(rand() * (maxY - minY + 1));
      const idx = tileIndex(this.map, x, y);
      if ((this.map.terrain[idx] as number) !== WATER_ID) continue;
      dots.push({
        x: x * TILE_SIZE + rand() * TILE_SIZE,
        y: y * TILE_SIZE + rand() * TILE_SIZE,
      });
    }
    return dots;
  }
}

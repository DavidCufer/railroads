/**
 * Terrain renderer: cached per-chunk offscreen canvases (SPEC §10.3, §10.4).
 * Chunks are rasterized once per (zoom bucket, chunk) pair and reused every frame; only water
 * shimmer is redrawn dynamically on top.
 */
import { Camera, OVERVIEW_ZOOM_THRESHOLD, TILE_SIZE } from "./camera";
import { shadeColor, withAlpha } from "./color";
import { hillshadeFactorAt } from "./hillshade";
import { drawCityRoofs } from "./cities";
import { drawIndustryIcon } from "./industries";
import {
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

const CHUNK_TILES = 16;
type ZoomBucket = 1 | 0.5 | 0.25;

/** Comfortably above a Large map's full chunk count at every zoom bucket at once (192x128 /
 * 16 tiles/chunk = 12x8 = 96 chunks/bucket x 3 buckets = 288), so ordinary play on the biggest
 * supported map essentially never evicts — this is a backstop against unbounded growth over a
 * long session of panning around, not a budget tuned to force eviction in normal play. */
const TERRAIN_CHUNK_CACHE_MAX = 350;

const WATER_ID = terrainId("water");
const RIVER_ID = terrainId("river");

/** Sub-tile shading resolution: a 4x4 grid of bilinearly-sampled hillshade cells per tile. */
const SHADE_SUBCELLS = 4;

function pickBucket(zoom: number): ZoomBucket {
  if (zoom >= 0.75) return 1;
  if (zoom >= OVERVIEW_ZOOM_THRESHOLD) return 0.5;
  return 0.25;
}

function terrainColorFor(map: GameMap, idx: number): string {
  const terrain = terrainName(map.terrain[idx] as number);
  return TERRAIN_COLORS[terrain];
}

function renderColorFor(map: GameMap, x: number, y: number): string {
  const idx = tileIndex(map, x, y);
  if ((map.terrain[idx] as number) === WATER_ID) {
    return isShallowWater(map, x, y) ? WATER_SHALLOW_COLOR : WATER_DEEP_COLOR;
  }
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

function chunkCacheKey(cx: number, cy: number, bucket: ZoomBucket, overview: boolean): string {
  return `${bucket}|${overview ? "o" : "f"}|${cx}|${cy}`;
}

function isShallowWater(map: GameMap, x: number, y: number): boolean {
  for (const [dx, dy] of DIRS8) {
    const nx = x + dx;
    const ny = y + dy;
    if (!inBounds(map, nx, ny)) return true; // map edge reads as shallow/coastal
    if ((map.terrain[tileIndex(map, nx, ny)] as number) !== WATER_ID) return true;
  }
  return false;
}

interface ShimmerDot {
  x: number;
  y: number;
}

interface CityCenter {
  cx: number;
  cy: number;
  maxDist: number;
}

export class TerrainRenderer {
  private cache = new ChunkCache<HTMLCanvasElement>(TERRAIN_CHUNK_CACHE_MAX);
  private map: GameMap;
  private cities: readonly City[];
  private industries: readonly Industry[];
  private cityCenters = new Map<number, CityCenter>();
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
    this.cache.clear();
    this.computeCityCenters();
  }

  /** Number of chunk canvases currently cached (bounded by `TERRAIN_CHUNK_CACHE_MAX`) — exposed
   * for the Phase 12 memory-bounds e2e test. */
  get cacheSize(): number {
    return this.cache.size;
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
      for (const idx of city.tiles) {
        const tx = idx % this.map.width;
        const ty = Math.floor(idx / this.map.width);
        maxDist = Math.max(maxDist, Math.hypot(tx - cx, ty - cy));
      }
      this.cityCenters.set(city.id, { cx, cy, maxDist: Math.max(maxDist, 0.5) });
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
    const chunkMinX = Math.max(0, Math.floor(topLeft.x / chunkWorldSize) - 1);
    const chunkMinY = Math.max(0, Math.floor(topLeft.y / chunkWorldSize) - 1);
    const chunkMaxX = Math.min(chunksX - 1, Math.floor(bottomRight.x / chunkWorldSize) + 1);
    const chunkMaxY = Math.min(chunksY - 1, Math.floor(bottomRight.y / chunkWorldSize) + 1);

    // Cap how many never-before-seen chunks get rasterized in a single frame, so panning into
    // fresh territory can't stall the frame — the rest fill in over the next couple of frames.
    // Overview chunks are cheap (flat fill, no hillshading/blend/decoration) so they're never budgeted.
    let chunksRenderedThisFrame = 0;
    const CHUNK_RENDER_BUDGET = overview ? Infinity : 4;

    for (let cy = chunkMinY; cy <= chunkMaxY; cy++) {
      for (let cx = chunkMinX; cx <= chunkMaxX; cx++) {
        const key = chunkCacheKey(cx, cy, bucket, overview);
        let canvas = this.cache.get(key);
        if (!canvas) {
          if (chunksRenderedThisFrame >= CHUNK_RENDER_BUDGET) continue;
          canvas = this.renderChunk(cx, cy, bucket, overview);
          this.cache.set(key, canvas);
          chunksRenderedThisFrame++;
        }
        const worldX = cx * chunkWorldSize;
        const worldY = cy * chunkWorldSize;
        const screen = camera.worldToScreen(worldX, worldY, viewportW, viewportH);
        const tilesX = Math.min(CHUNK_TILES, this.map.width - cx * CHUNK_TILES);
        const tilesY = Math.min(CHUNK_TILES, this.map.height - cy * CHUNK_TILES);
        const destW = tilesX * TILE_SIZE * camera.zoom;
        const destH = tilesY * TILE_SIZE * camera.zoom;
        ctx.drawImage(canvas, screen.x, screen.y, destW, destH);
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
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.ceil(tilesX * px));
    canvas.height = Math.max(1, Math.ceil(tilesY * px));
    const ctx = canvas.getContext("2d");
    if (!ctx) return canvas;

    const originX = cx * CHUNK_TILES;
    const originY = cy * CHUNK_TILES;

    for (let ty = 0; ty < tilesY; ty++) {
      for (let tx = 0; tx < tilesX; tx++) {
        this.drawTile(ctx, originX + tx, originY + ty, tx * px, ty * px, px, overview);
      }
    }
    this.drawRivers(ctx, originX, originY, tilesX, tilesY, px, overview);
    return canvas;
  }

  private drawTile(
    ctx: CanvasRenderingContext2D,
    mapX: number,
    mapY: number,
    px: number,
    py: number,
    size: number,
    overview: boolean,
  ): void {
    const idx = tileIndex(this.map, mapX, mapY);
    const terrain = terrainName(this.map.terrain[idx] as number);
    const baseColor = renderColorFor(this.map, mapX, mapY);

    if (overview) {
      ctx.fillStyle = baseColor;
      ctx.fillRect(px, py, size, size);
      return;
    }

    if (terrain === "water") {
      ctx.fillStyle = baseColor;
      ctx.fillRect(px, py, size, size);
    } else {
      this.drawShadedTile(ctx, mapX, mapY, px, py, size, baseColor);
    }

    this.drawEdgeBlend(ctx, mapX, mapY, px, py, size);
    this.drawCoastlineContour(ctx, mapX, mapY, px, py, size, terrain === "water");

    const cityId = this.map.cityId[idx] as number;
    const industryIdx = this.map.industryId[idx] as number;
    if (cityId >= 0 && this.cities[cityId]) {
      const city = this.cities[cityId] as City;
      const center = this.cityCenters.get(city.id);
      const closeness = center
        ? 1 - Math.min(1, Math.hypot(mapX - center.cx, mapY - center.cy) / center.maxDist)
        : 1;
      drawCityRoofs(ctx, px, py, size, city.tier, closeness);
    } else if (industryIdx >= 0 && this.industries[industryIdx]) {
      drawIndustryIcon(ctx, (this.industries[industryIdx] as Industry).type, px, py, size);
    } else {
      this.drawDecoration(ctx, mapX, mapY, terrain, px, py, size);
    }
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
        ctx.fillRect(px + sx * sub - pad / 2, py + sy * sub - pad / 2, sub + pad, sub + pad);
      }
    }
  }

  /** Feathers this tile's edge toward a differing neighbor with a few jittered, blob-shaped washes. */
  private drawEdgeBlend(
    ctx: CanvasRenderingContext2D,
    mapX: number,
    mapY: number,
    px: number,
    py: number,
    size: number,
  ): void {
    const idx = tileIndex(this.map, mapX, mapY);
    const terrain = terrainName(this.map.terrain[idx] as number);
    const edges: Array<{ dx: number; dy: number; axis: "h" | "v"; side: 0 | 1 }> = [
      { dx: 0, dy: -1, axis: "h", side: 0 },
      { dx: 0, dy: 1, axis: "h", side: 1 },
      { dx: -1, dy: 0, axis: "v", side: 0 },
      { dx: 1, dy: 0, axis: "v", side: 1 },
    ];
    const blobCount = 4;

    for (const edge of edges) {
      const nx = mapX + edge.dx;
      const ny = mapY + edge.dy;
      if (!inBounds(this.map, nx, ny)) continue;
      const nIdx = tileIndex(this.map, nx, ny);
      const nTerrain = terrainName(this.map.terrain[nIdx] as number);
      if (nTerrain === terrain) continue;
      // Water/land edges are the true marching-squares contour (drawCoastlineContour) now, not a
      // jittered blob wash — skip so the two don't double up.
      if (terrain === "water" || nTerrain === "water") continue;
      const nColor = renderColorFor(this.map, nx, ny);

      for (let i = 0; i < blobCount; i++) {
        const t = (i + 0.5) / blobCount + (Math.random() - 0.5) * 0.18;
        const bx = edge.axis === "h" ? px + t * size : px + edge.side * size;
        const by = edge.axis === "v" ? py + t * size : py + edge.side * size;
        const r = size * (0.18 + Math.random() * 0.12);
        const gradient = ctx.createRadialGradient(bx, by, 0, bx, by, r);
        gradient.addColorStop(0, withAlpha(nColor, 0.4));
        gradient.addColorStop(1, withAlpha(nColor, 0));
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(bx, by, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  /**
   * "Water-ness" (0..1) of the grid corner at (gx, gy) — the average of the up-to-4 tiles sharing
   * that corner point. This is the standard dual-grid input for marching squares: along a straight
   * coastline every corner sits at exactly 0.5 (2 of the 4 sharing tiles are water, 2 aren't), so
   * thresholding at 0.5 and linearly interpolating along each tile edge reproduces the true
   * coastline geometry instead of the tile grid's own pixel-stepped boundary. Off-map tiles count
   * as land (a map edge isn't itself a coastline unless a real water tile makes it one).
   */
  private cornerWaterness(gx: number, gy: number): number {
    let sum = 0;
    for (const [dx, dy] of [
      [-1, -1],
      [0, -1],
      [-1, 0],
      [0, 0],
    ] as const) {
      const tx = gx + dx;
      const ty = gy + dy;
      if (
        inBounds(this.map, tx, ty) &&
        (this.map.terrain[tileIndex(this.map, tx, ty)] as number) === WATER_ID
      ) {
        sum += 1;
      }
    }
    return sum / 4;
  }

  /**
   * Marching-squares coastline (SPEC §10.3 / Phase 2 & 11 review carry-over: "smooth coastlines
   * ... true marching-squares contour instead of per-tile steps"). Every land tile bordering water
   * gets the true, continuously-interpolated water polygon for its corner cut filled and feathered
   * on top of its base color (and the mirror image for a water tile bordering land) — a real
   * geometric contour line instead of jittered gradient blobs approximating one.
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
    ctx.shadowColor = withAlpha(fillColor, 0.5);
    ctx.shadowBlur = size * 0.22;
    ctx.strokeStyle = withAlpha(fillColor, 0.35);
    ctx.lineWidth = size * 0.1;
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
      case "desert":
      case "swamp":
      case "river":
        this.drawSpeckle(ctx, terrain, px, py, size);
        break;
      default:
        break;
    }
  }

  /** 2–4 small tree canopies (with a darker shadow) instead of one flat dark tile. */
  private drawForestClusters(
    ctx: CanvasRenderingContext2D,
    px: number,
    py: number,
    size: number,
  ): void {
    const count = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < count; i++) {
      const cx = px + size * (0.15 + Math.random() * 0.7);
      const cy = py + size * (0.15 + Math.random() * 0.7);
      const r = size * (0.12 + Math.random() * 0.08);

      ctx.fillStyle = FOREST_SHADOW_COLOR;
      ctx.beginPath();
      ctx.arc(cx + r * 0.35, cy + r * 0.35, r * 0.9, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = FOREST_CANOPY_COLOR;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /** 2–3 soft bump highlights (light NW, dark SE) to read as gentle mounds. */
  private drawHillBumps(ctx: CanvasRenderingContext2D, px: number, py: number, size: number): void {
    const count = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < count; i++) {
      const cx = px + size * (0.2 + Math.random() * 0.6);
      const cy = py + size * (0.2 + Math.random() * 0.6);
      const r = size * (0.18 + Math.random() * 0.1);
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
    const count = Math.random() < 0.5 ? 1 : 2;
    for (let i = 0; i < count; i++) {
      const baseX = px + size * (0.25 + Math.random() * 0.5);
      const baseY = py + size * (0.7 + Math.random() * 0.15);
      const peakH = size * (0.35 + Math.random() * 0.15);
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
      const sx = px + Math.random() * size;
      const sy = py + Math.random() * size;
      const r = size * (0.02 + Math.random() * 0.035);
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
      const x = minX + Math.floor(Math.random() * (maxX - minX + 1));
      const y = minY + Math.floor(Math.random() * (maxY - minY + 1));
      const idx = tileIndex(this.map, x, y);
      if ((this.map.terrain[idx] as number) !== WATER_ID) continue;
      dots.push({
        x: x * TILE_SIZE + Math.random() * TILE_SIZE,
        y: y * TILE_SIZE + Math.random() * TILE_SIZE,
      });
    }
    return dots;
  }
}

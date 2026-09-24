/**
 * Terrain renderer: cached per-chunk offscreen canvases (SPEC §10.3, §10.4).
 * Chunks are rasterized once per (zoom bucket, chunk) pair and reused every frame; only water
 * shimmer is redrawn dynamically on top.
 */
import { Camera, OVERVIEW_ZOOM_THRESHOLD, TILE_SIZE } from "./camera";
import { shadeColor, withAlpha } from "./color";
import { hillshadeFactor } from "./hillshade";
import {
  RIVER_LINE_COLOR,
  SNOWCAP_COLOR,
  SNOWCAP_MIN_ELEVATION,
  TERRAIN_COLORS,
  WATER_DEEP_COLOR,
  WATER_SHALLOW_COLOR,
} from "./palette";
import { DIRS8, inBounds, tileIndex } from "../sim/map/grid";
import { terrainName, type Terrain } from "../sim/map/terrain";
import type { GameMap } from "../sim/map/types";

const CHUNK_TILES = 16;
type ZoomBucket = 1 | 0.5 | 0.25;

function pickBucket(zoom: number): ZoomBucket {
  if (zoom >= 0.75) return 1;
  if (zoom >= OVERVIEW_ZOOM_THRESHOLD) return 0.5;
  return 0.25;
}

function terrainColorFor(map: GameMap, idx: number): string {
  const terrain = terrainName(map.terrain[idx] as number);
  const elevation = map.elevation[idx] as number;
  if (terrain === "mountain" && elevation >= SNOWCAP_MIN_ELEVATION) return SNOWCAP_COLOR;
  return TERRAIN_COLORS[terrain];
}

function chunkCacheKey(cx: number, cy: number, bucket: ZoomBucket, overview: boolean): string {
  return `${bucket}|${overview ? "o" : "f"}|${cx}|${cy}`;
}

function isShallowWater(map: GameMap, x: number, y: number): boolean {
  for (const [dx, dy] of DIRS8) {
    const nx = x + dx;
    const ny = y + dy;
    if (!inBounds(map, nx, ny)) return true; // map edge reads as shallow/coastal
    if (terrainName(map.terrain[tileIndex(map, nx, ny)] as number) !== "water") return true;
  }
  return false;
}

interface ShimmerDot {
  x: number;
  y: number;
}

export class TerrainRenderer {
  private cache = new Map<string, HTMLCanvasElement>();
  private map: GameMap;
  private shimmerDots: ShimmerDot[] = [];
  private lastShimmerUpdate = -Infinity;
  private lastShimmerKey = "";

  constructor(map: GameMap) {
    this.map = map;
  }

  setMap(map: GameMap): void {
    this.map = map;
    this.cache.clear();
    this.shimmerDots = [];
    this.lastShimmerUpdate = -Infinity;
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
    // Overview chunks are cheap (flat fill, no hillshading/blend/texture) so they're never budgeted.
    let chunksRenderedThisFrame = 0;
    const CHUNK_RENDER_BUDGET = overview ? Infinity : 8;

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
    if (!overview) {
      this.drawRivers(ctx, originX, originY, tilesX, tilesY, px);
    }
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
    let color = terrainColorFor(this.map, idx);
    if (terrain === "water") {
      color = isShallowWater(this.map, mapX, mapY) ? WATER_SHALLOW_COLOR : WATER_DEEP_COLOR;
    }

    if (overview) {
      ctx.fillStyle = color;
      ctx.fillRect(px, py, size, size);
      return;
    }

    const shade = terrain === "water" ? 1 : hillshadeFactor(this.map, mapX, mapY);
    ctx.fillStyle = shadeColor(color, shade);
    ctx.fillRect(px, py, size, size);

    this.drawEdgeBlend(ctx, mapX, mapY, px, py, size);
    this.drawTexture(ctx, terrain, px, py, size);
  }

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
    const blend = size * 0.4;
    const edges: Array<{ dx: number; dy: number; side: "top" | "bottom" | "left" | "right" }> = [
      { dx: 0, dy: -1, side: "top" },
      { dx: 0, dy: 1, side: "bottom" },
      { dx: -1, dy: 0, side: "left" },
      { dx: 1, dy: 0, side: "right" },
    ];

    for (const edge of edges) {
      const nx = mapX + edge.dx;
      const ny = mapY + edge.dy;
      if (!inBounds(this.map, nx, ny)) continue;
      const nIdx = tileIndex(this.map, nx, ny);
      const nTerrain = terrainName(this.map.terrain[nIdx] as number);
      if (nTerrain === terrain) continue;
      const nColor = terrainColorFor(this.map, nIdx);

      let gradient: CanvasGradient;
      if (edge.side === "top") {
        gradient = ctx.createLinearGradient(0, py, 0, py + blend);
        gradient.addColorStop(0, withAlpha(nColor, 0.35));
        gradient.addColorStop(1, withAlpha(nColor, 0));
        ctx.fillStyle = gradient;
        ctx.fillRect(px, py, size, blend);
      } else if (edge.side === "bottom") {
        gradient = ctx.createLinearGradient(0, py + size - blend, 0, py + size);
        gradient.addColorStop(0, withAlpha(nColor, 0));
        gradient.addColorStop(1, withAlpha(nColor, 0.35));
        ctx.fillStyle = gradient;
        ctx.fillRect(px, py + size - blend, size, blend);
      } else if (edge.side === "left") {
        gradient = ctx.createLinearGradient(px, 0, px + blend, 0);
        gradient.addColorStop(0, withAlpha(nColor, 0.35));
        gradient.addColorStop(1, withAlpha(nColor, 0));
        ctx.fillStyle = gradient;
        ctx.fillRect(px, py, blend, size);
      } else {
        gradient = ctx.createLinearGradient(px + size - blend, 0, px + size, 0);
        gradient.addColorStop(0, withAlpha(nColor, 0));
        gradient.addColorStop(1, withAlpha(nColor, 0.35));
        ctx.fillStyle = gradient;
        ctx.fillRect(px + size - blend, py, blend, size);
      }
    }
  }

  private drawTexture(
    ctx: CanvasRenderingContext2D,
    terrain: Terrain,
    px: number,
    py: number,
    size: number,
  ): void {
    const counts: Partial<Record<Terrain, number>> = {
      forest: 6,
      hills: 3,
      mountain: 3,
      plain: 4,
      desert: 4,
      swamp: 4,
    };
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

  private drawRivers(
    ctx: CanvasRenderingContext2D,
    originX: number,
    originY: number,
    tilesX: number,
    tilesY: number,
    px: number,
  ): void {
    ctx.strokeStyle = RIVER_LINE_COLOR;
    ctx.lineCap = "round";

    for (let ty = 0; ty < tilesY; ty++) {
      for (let tx = 0; tx < tilesX; tx++) {
        const mapX = originX + tx;
        const mapY = originY + ty;
        const idx = tileIndex(this.map, mapX, mapY);
        if (terrainName(this.map.terrain[idx] as number) !== "river") continue;
        const flow = this.map.riverFlow[idx] as number;
        const cx = tx * px + px / 2;
        const cy = ty * px + px / 2;

        for (const [dx, dy] of DIRS8) {
          const nx = mapX + dx;
          const ny = mapY + dy;
          if (!inBounds(this.map, nx, ny)) continue;
          const nIdx = tileIndex(this.map, nx, ny);
          if (nIdx <= idx) continue; // dedupe: draw each shared edge once
          const nTerrain = terrainName(this.map.terrain[nIdx] as number);
          if (nTerrain !== "river" && nTerrain !== "water") continue;

          const ncx = (tx + dx) * px + px / 2;
          const ncy = (ty + dy) * px + px / 2;
          const nFlow = this.map.riverFlow[nIdx] as number;
          const width =
            Math.max(1, Math.min(5, 1 + Math.max(flow, nFlow) * 0.4)) * px * (1 / TILE_SIZE);
          ctx.lineWidth = width;
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.lineTo(ncx, ncy);
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
      if (terrainName(this.map.terrain[idx] as number) !== "water") continue;
      dots.push({
        x: x * TILE_SIZE + Math.random() * TILE_SIZE,
        y: y * TILE_SIZE + Math.random() * TILE_SIZE,
      });
    }
    return dots;
  }
}

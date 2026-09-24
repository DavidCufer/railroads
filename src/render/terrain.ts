/**
 * Terrain renderer: cached per-chunk offscreen canvases (SPEC §10.3, §10.4).
 * Chunks are rasterized once per (zoom bucket, chunk) pair and reused every frame; only water
 * shimmer is redrawn dynamically on top.
 */
import { Camera, OVERVIEW_ZOOM_THRESHOLD, TILE_SIZE } from "./camera";
import { shadeColor, withAlpha } from "./color";
import { hillshadeFactorAt } from "./hillshade";
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

const CHUNK_TILES = 16;
type ZoomBucket = 1 | 0.5 | 0.25;

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
    this.drawCornerBlend(ctx, mapX, mapY, px, py, size);
    this.drawDecoration(ctx, mapX, mapY, terrain, px, py, size);
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
   * Softens a diagonal-only coastline corner (this tile and its diagonal neighbor disagree about
   * being water, but both orthogonal neighbors agree with the diagonal) — the case the cardinal
   * edge blend above can't reach, otherwise the pixel-grid corner shows through.
   */
  private drawCornerBlend(
    ctx: CanvasRenderingContext2D,
    mapX: number,
    mapY: number,
    px: number,
    py: number,
    size: number,
  ): void {
    const idx = tileIndex(this.map, mapX, mapY);
    const isWater = (this.map.terrain[idx] as number) === WATER_ID;
    const corners: Array<{ dx: number; dy: number; cx: number; cy: number }> = [
      { dx: -1, dy: -1, cx: 0, cy: 0 },
      { dx: 1, dy: -1, cx: size, cy: 0 },
      { dx: -1, dy: 1, cx: 0, cy: size },
      { dx: 1, dy: 1, cx: size, cy: size },
    ];

    for (const corner of corners) {
      const dnx = mapX + corner.dx;
      const dny = mapY + corner.dy;
      const onx = mapX + corner.dx;
      const ony = mapY;
      const omx = mapX;
      const omy = mapY + corner.dy;
      if (
        !inBounds(this.map, dnx, dny) ||
        !inBounds(this.map, onx, ony) ||
        !inBounds(this.map, omx, omy)
      ) {
        continue;
      }
      const diagIsWater = (this.map.terrain[tileIndex(this.map, dnx, dny)] as number) === WATER_ID;
      if (diagIsWater === isWater) continue;
      const o1Water = (this.map.terrain[tileIndex(this.map, onx, ony)] as number) === WATER_ID;
      const o2Water = (this.map.terrain[tileIndex(this.map, omx, omy)] as number) === WATER_ID;
      if (o1Water !== diagIsWater || o2Water !== diagIsWater) continue; // a full edge, not a bare corner

      const color = diagIsWater ? WATER_SHALLOW_COLOR : renderColorFor(this.map, mapX, mapY);
      const r = size * 0.34;
      const cx = px + corner.cx;
      const cy = py + corner.cy;
      const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      gradient.addColorStop(0, withAlpha(color, 0.32));
      gradient.addColorStop(1, withAlpha(color, 0));
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    }
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
        const width = Math.max(2, Math.min(6, 2 + flow * 0.5)) * (px / TILE_SIZE);
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

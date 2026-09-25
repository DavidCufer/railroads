/**
 * Track renderer: cached per-chunk offscreen canvases, same scheme as TerrainRenderer (SPEC
 * §10.3, §10.4) — dark rails with ties at zoom ≥ 1, a single line at lower zoom, double track as
 * parallel lines, bridges colored distinctively by type, small junction dots, and a small red
 * marker on nodes where two edges meet at a sharper-than-45° angle (SPEC §5.1: buildable, but not
 * traversable as a through route).
 */
import { Camera, OVERVIEW_ZOOM_THRESHOLD, TILE_SIZE } from "./camera";
import {
  BRIDGE_COLORS,
  CATENARY_POLE_COLOR,
  CATENARY_WIRE_COLOR,
  JUNCTION_DOT_COLOR,
  SHARP_TURN_MARKER_COLOR,
  TIE_COLOR,
  TRACK_COLOR,
} from "./palette";
import { hasSharpJunction } from "../sim/track/turn";
import type { TrackGraph } from "../sim/track/graph";
import type { TrackEdge } from "../sim/track/types";
import { ChunkCache } from "./chunkCache";

const CHUNK_TILES = 16;
type ZoomBucket = 1 | 0.5 | 0.25;

/** Same rationale/sizing as TerrainRenderer's cap (Phase 12 memory-bounds backstop). */
const TRACK_CHUNK_CACHE_MAX = 350;

function pickBucket(zoom: number): ZoomBucket {
  if (zoom >= 0.75) return 1;
  if (zoom >= OVERVIEW_ZOOM_THRESHOLD) return 0.5;
  return 0.25;
}

function tileXY(tile: number, mapWidth: number): [number, number] {
  return [tile % mapWidth, Math.floor(tile / mapWidth)];
}

function chunkCacheKey(cx: number, cy: number, bucket: ZoomBucket): string {
  return `${bucket}|${cx}|${cy}`;
}

interface EdgeBBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function edgeBBox(edge: TrackEdge, mapWidth: number): EdgeBBox {
  const [ax, ay] = tileXY(edge.a, mapWidth);
  const [bx, by] = tileXY(edge.b, mapWidth);
  return {
    minX: Math.min(ax, bx),
    minY: Math.min(ay, by),
    maxX: Math.max(ax, bx),
    maxY: Math.max(ay, by),
  };
}

export class TrackRenderer {
  private cache = new ChunkCache<HTMLCanvasElement>(TRACK_CHUNK_CACHE_MAX);
  private mapWidth: number;
  private mapHeight: number;
  private graph: TrackGraph;

  constructor(mapWidth: number, mapHeight: number, graph: TrackGraph) {
    this.mapWidth = mapWidth;
    this.mapHeight = mapHeight;
    this.graph = graph;
  }

  setMap(mapWidth: number, mapHeight: number, graph: TrackGraph): void {
    this.mapWidth = mapWidth;
    this.mapHeight = mapHeight;
    this.graph = graph;
    this.cache.clear();
  }

  /** Drops cached chunk canvases touched by these tiles (endpoints + any bridge span), at every
   * zoom bucket — call after any track mutation (build/upgrade/bulldoze). */
  invalidateTiles(tiles: readonly number[]): void {
    const buckets: ZoomBucket[] = [1, 0.5, 0.25];
    for (const tile of tiles) {
      const [x, y] = tileXY(tile, this.mapWidth);
      const cx = Math.floor(x / CHUNK_TILES);
      const cy = Math.floor(y / CHUNK_TILES);
      for (const bucket of buckets) this.cache.delete(chunkCacheKey(cx, cy, bucket));
    }
  }

  /** Number of chunk canvases currently cached (bounded by `TRACK_CHUNK_CACHE_MAX`) — exposed for
   * the Phase 12 memory-bounds e2e test. */
  get cacheSize(): number {
    return this.cache.size;
  }

  draw(ctx: CanvasRenderingContext2D, camera: Camera, viewportW: number, viewportH: number): void {
    const bucket = pickBucket(camera.zoom);
    const chunkWorldSize = CHUNK_TILES * TILE_SIZE;
    const chunksX = Math.ceil(this.mapWidth / CHUNK_TILES);
    const chunksY = Math.ceil(this.mapHeight / CHUNK_TILES);

    const topLeft = camera.screenToWorld(0, 0, viewportW, viewportH);
    const bottomRight = camera.screenToWorld(viewportW, viewportH, viewportW, viewportH);
    const chunkMinX = Math.max(0, Math.floor(topLeft.x / chunkWorldSize) - 1);
    const chunkMinY = Math.max(0, Math.floor(topLeft.y / chunkWorldSize) - 1);
    const chunkMaxX = Math.min(chunksX - 1, Math.floor(bottomRight.x / chunkWorldSize) + 1);
    const chunkMaxY = Math.min(chunksY - 1, Math.floor(bottomRight.y / chunkWorldSize) + 1);

    for (let cy = chunkMinY; cy <= chunkMaxY; cy++) {
      for (let cx = chunkMinX; cx <= chunkMaxX; cx++) {
        const key = chunkCacheKey(cx, cy, bucket);
        let canvas = this.cache.get(key);
        if (!canvas) {
          canvas = this.renderChunk(cx, cy, bucket);
          this.cache.set(key, canvas);
        }
        const worldX = cx * chunkWorldSize;
        const worldY = cy * chunkWorldSize;
        const screen = camera.worldToScreen(worldX, worldY, viewportW, viewportH);
        const tilesX = Math.min(CHUNK_TILES, this.mapWidth - cx * CHUNK_TILES);
        const tilesY = Math.min(CHUNK_TILES, this.mapHeight - cy * CHUNK_TILES);
        const destW = tilesX * TILE_SIZE * camera.zoom;
        const destH = tilesY * TILE_SIZE * camera.zoom;
        ctx.drawImage(canvas, screen.x, screen.y, destW, destH);
      }
    }
  }

  private renderChunk(cx: number, cy: number, bucket: ZoomBucket): HTMLCanvasElement {
    const tilesX = Math.min(CHUNK_TILES, this.mapWidth - cx * CHUNK_TILES);
    const tilesY = Math.min(CHUNK_TILES, this.mapHeight - cy * CHUNK_TILES);
    const px = TILE_SIZE * bucket;
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.ceil(tilesX * px));
    canvas.height = Math.max(1, Math.ceil(tilesY * px));
    const ctx = canvas.getContext("2d");
    if (!ctx) return canvas;

    const originX = cx * CHUNK_TILES;
    const originY = cy * CHUNK_TILES;
    const rangeMinX = originX;
    const rangeMinY = originY;
    const rangeMaxX = originX + tilesX - 1;
    const rangeMaxY = originY + tilesY - 1;
    const tiesStyle = bucket === 1;

    const localCenter = (tile: number): [number, number] => {
      const [x, y] = tileXY(tile, this.mapWidth);
      return [(x - originX + 0.5) * px, (y - originY + 0.5) * px];
    };

    for (const edge of this.graph.allEdges()) {
      const bbox = edgeBBox(edge, this.mapWidth);
      if (
        bbox.maxX < rangeMinX ||
        bbox.minX > rangeMaxX ||
        bbox.maxY < rangeMinY ||
        bbox.minY > rangeMaxY
      ) {
        continue;
      }
      this.drawEdge(ctx, edge, localCenter, px, tiesStyle);
    }

    if (tiesStyle) {
      for (const node of this.graph.allNodes()) {
        const [x, y] = tileXY(node, this.mapWidth);
        if (x < rangeMinX || x > rangeMaxX || y < rangeMinY || y > rangeMaxY) continue;
        this.drawJunction(ctx, node, localCenter, px);
      }
    }

    return canvas;
  }

  private drawEdge(
    ctx: CanvasRenderingContext2D,
    edge: TrackEdge,
    localCenter: (tile: number) => [number, number],
    px: number,
    tiesStyle: boolean,
  ): void {
    const [x1, y1] = localCenter(edge.a);
    const [x2, y2] = localCenter(edge.b);
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const perpX = -uy;
    const perpY = ux;
    const scale = px / TILE_SIZE;

    if (edge.bridge) {
      this.drawBridge(ctx, x1, y1, x2, y2, perpX, perpY, edge, scale);
      if (edge.electrified && tiesStyle) {
        this.drawCatenary(ctx, x1, y1, x2, y2, perpX, perpY, edge, scale);
      }
      return;
    }

    const railColor = TRACK_COLOR;
    // Separation between the two tracks of a double edge — wide enough to read as clearly two
    // tracks (not one thick one) at zoom 1-1.5, where this is drawn from the cached "tiesStyle"
    // raster (Phase 4 review: at the old, tighter gap the two rail pairs' inner rails nearly
    // touched). Only used for `edge.double`; single track never references it.
    const gap = 5 * scale;
    ctx.lineCap = "round";

    if (!tiesStyle) {
      ctx.strokeStyle = railColor;
      ctx.lineWidth = Math.max(1, (edge.double ? 2.4 : 1.6) * scale);
      ctx.beginPath();
      if (edge.double) {
        ctx.moveTo(x1 - perpX * gap, y1 - perpY * gap);
        ctx.lineTo(x2 - perpX * gap, y2 - perpY * gap);
        ctx.moveTo(x1 + perpX * gap, y1 + perpY * gap);
        ctx.lineTo(x2 + perpX * gap, y2 + perpY * gap);
      } else {
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
      }
      ctx.stroke();
      return;
    }

    const railGap = 2.2 * scale;
    const drawRailPair = (ox: number, oy: number): void => {
      ctx.strokeStyle = railColor;
      ctx.lineWidth = Math.max(1, 1.1 * scale);
      ctx.beginPath();
      ctx.moveTo(x1 + ox - perpX * railGap, y1 + oy - perpY * railGap);
      ctx.lineTo(x2 + ox - perpX * railGap, y2 + oy - perpY * railGap);
      ctx.moveTo(x1 + ox + perpX * railGap, y1 + oy + perpY * railGap);
      ctx.lineTo(x2 + ox + perpX * railGap, y2 + oy + perpY * railGap);
      ctx.stroke();

      ctx.strokeStyle = TIE_COLOR;
      ctx.lineWidth = Math.max(1, 1.4 * scale);
      const tieSpacing = 7 * scale;
      const tieHalfLen = 4.2 * scale;
      const steps = Math.max(1, Math.floor(len / tieSpacing));
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        const tx = x1 + ox + dx * t;
        const ty = y1 + oy + dy * t;
        ctx.beginPath();
        ctx.moveTo(tx - perpX * tieHalfLen, ty - perpY * tieHalfLen);
        ctx.lineTo(tx + perpX * tieHalfLen, ty + perpY * tieHalfLen);
        ctx.stroke();
      }
    };

    if (edge.double) {
      drawRailPair(-perpX * gap, -perpY * gap);
      drawRailPair(perpX * gap, perpY * gap);
    } else {
      drawRailPair(0, 0);
    }

    if (edge.electrified) this.drawCatenary(ctx, x1, y1, x2, y2, perpX, perpY, edge, scale);
  }

  /** Catenary poles + wire on electrified track (SPEC §7.7: "electric... requires electrified
   * track", rendered so it reads distinctly at zoom ≥ 1) — a thin wire line offset from the
   * centerline, with short perpendicular pole ticks at regular intervals connecting it back to the
   * track. Only called from the `tiesStyle` (zoom ≥ 0.75) rendering path; at lower zoom buckets the
   * track itself collapses to a single plain line, too small to read poles on top of anyway. */
  private drawCatenary(
    ctx: CanvasRenderingContext2D,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    perpX: number,
    perpY: number,
    edge: TrackEdge,
    scale: number,
  ): void {
    const wireOffset = (edge.double ? 20 : 16) * scale;
    const wx1 = x1 + perpX * wireOffset;
    const wy1 = y1 + perpY * wireOffset;
    const wx2 = x2 + perpX * wireOffset;
    const wy2 = y2 + perpY * wireOffset;

    ctx.strokeStyle = CATENARY_WIRE_COLOR;
    ctx.lineWidth = Math.max(0.8, 0.9 * scale);
    ctx.beginPath();
    ctx.moveTo(wx1, wy1);
    ctx.lineTo(wx2, wy2);
    ctx.stroke();

    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1;
    const spacing = 9 * scale;
    const steps = Math.max(1, Math.round(len / spacing));
    ctx.strokeStyle = CATENARY_POLE_COLOR;
    ctx.lineWidth = Math.max(1, 1.3 * scale);
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const bx = x1 + dx * t;
      const by = y1 + dy * t;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(bx + perpX * wireOffset, by + perpY * wireOffset);
      ctx.stroke();
    }
  }

  private drawBridge(
    ctx: CanvasRenderingContext2D,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    perpX: number,
    perpY: number,
    edge: TrackEdge,
    scale: number,
  ): void {
    const colors = BRIDGE_COLORS[edge.bridge as keyof typeof BRIDGE_COLORS];
    const deckHalfWidth = (edge.double ? 6.5 : 4.5) * scale;

    ctx.strokeStyle = colors.deck;
    ctx.lineWidth = deckHalfWidth * 2;
    ctx.lineCap = "butt";
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    // Trestle/tie cross-marks along the deck read as distinct from plain track at a glance.
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1;
    const spacing = 8 * scale;
    const steps = Math.max(1, Math.floor(len / spacing));
    ctx.strokeStyle = colors.trestle;
    ctx.lineWidth = Math.max(1, 1.3 * scale);
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const tx = x1 + dx * t;
      const ty = y1 + dy * t;
      ctx.beginPath();
      ctx.moveTo(tx - perpX * deckHalfWidth, ty - perpY * deckHalfWidth);
      ctx.lineTo(tx + perpX * deckHalfWidth, ty + perpY * deckHalfWidth);
      ctx.stroke();
    }
  }

  private drawJunction(
    ctx: CanvasRenderingContext2D,
    node: number,
    localCenter: (tile: number) => [number, number],
    px: number,
  ): void {
    const edges = this.graph.edgesAt(node);
    const [x, y] = localCenter(node);
    const scale = px / TILE_SIZE;

    if (edges.length >= 3) {
      ctx.fillStyle = JUNCTION_DOT_COLOR;
      ctx.beginPath();
      ctx.arc(x, y, 2.6 * scale, 0, Math.PI * 2);
      ctx.fill();
    }

    if (hasSharpJunction(this.graph, node)) {
      ctx.fillStyle = SHARP_TURN_MARKER_COLOR;
      ctx.beginPath();
      ctx.arc(x, y, 2.2 * scale, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(20, 10, 10, 0.8)";
      ctx.lineWidth = Math.max(0.5, 0.6 * scale);
      ctx.stroke();
    }
  }
}

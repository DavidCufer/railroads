/**
 * Track renderer: cached per-chunk offscreen canvases, same scheme as TerrainRenderer (SPEC
 * §10.3, §10.4) — dark rails with ties at zoom ≥ 1, a single line at lower zoom, double track as
 * parallel lines, bridges colored distinctively by type, small junction dots, and a small red
 * marker on nodes where two edges meet at a sharper-than-45° angle (SPEC §5.1: buildable, but not
 * traversable as a through route).
 *
 * STYLE §7: rails (and ties, and the double-track offset, and the catenary wire) follow a
 * circular fillet arc at every 45° bend instead of meeting in a hard corner — see
 * `src/render/trackPath.ts` for the shared curve geometry the train renderer also samples, so
 * consists follow exactly the same line drawn here. A sharp (>45°) junction has no traversable
 * bend to smooth, so it stays a plain pointed corner, matching its existing red marker. Bridges
 * are a single straight structural span (SPEC §5.1 deviation, see `src/sim/track/types.ts`) and
 * never bend at their own ends, though an approach track curving into one is drawn normally.
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
import {
  buildEdgeGeometry,
  isFilletBend,
  type EdgePath,
  type PathPiece,
  type PathSample,
} from "./trackPath";

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

/** This edge's "away from node" direction at `node` (the compass direction from `node` toward the
 * edge's other end) — the same convention `src/sim/track/turn.ts`'s `hasSharpJunction` uses. */
function awayDirAt(edge: TrackEdge, node: number): number {
  return edge.a === node ? edge.direction : (edge.direction + 4) % 8;
}

/** Strokes a tile-space piece list into a chunk-local pixel-space path (uniform scale/translate
 * only, so a tile-space circle stays a circle — no per-point sampling needed for the arcs). Caller
 * sets `ctx.strokeStyle`/`lineWidth` and calls `ctx.stroke()`. */
function tracePieceList(
  ctx: CanvasRenderingContext2D,
  pieces: readonly PathPiece[],
  originX: number,
  originY: number,
  px: number,
): void {
  ctx.beginPath();
  pieces.forEach((p, i) => {
    if (p.kind === "line") {
      const x0 = (p.x0 - originX) * px;
      const y0 = (p.y0 - originY) * px;
      const x1 = (p.x1 - originX) * px;
      const y1 = (p.y1 - originY) * px;
      if (i === 0) ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
    } else {
      const cx = (p.cx - originX) * px;
      const cy = (p.cy - originY) * px;
      const r = p.r * px;
      if (i === 0) ctx.moveTo(cx + r * Math.cos(p.a0), cy + r * Math.sin(p.a0));
      ctx.arc(cx, cy, r, p.a0, p.a1, p.a1 < p.a0);
    }
  });
}

/** Samples `path` at `steps + 1` evenly-fraction-spaced points (same "fraction of total length"
 * convention the old straight-edge tie loop used) and converts each to chunk-local pixel space. */
function sampleEvenly(
  path: EdgePath,
  steps: number,
  originX: number,
  originY: number,
  px: number,
): Array<PathSample & { lx: number; ly: number }> {
  const out: Array<PathSample & { lx: number; ly: number }> = [];
  for (let s = 0; s <= steps; s++) {
    const sample = path.pointAt((s / steps) * path.length);
    out.push({ ...sample, lx: (sample.x - originX) * px, ly: (sample.y - originY) * px });
  }
  return out;
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
      this.drawEdge(ctx, edge, originX, originY, px, localCenter, tiesStyle);
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

  /** This edge's fillet partner direction at `node` (the *other* edge's own away-from-node
   * direction), or `null` if there is no valid 45° bend to fillet there — a dead end, a straight
   * through-pair, or a sharp (>45°) junction (already flagged with the existing red marker). */
  private findFilletPartnerDir(
    node: number,
    excludeNeighbor: number,
    thisAwayDir: number,
  ): number | null {
    for (const neighbor of this.graph.neighborsOf(node)) {
      if (neighbor === excludeNeighbor) continue;
      const otherEdge = this.graph.getEdge(node, neighbor);
      if (!otherEdge) continue;
      const otherAway = awayDirAt(otherEdge, node);
      if (isFilletBend(thisAwayDir, otherAway)) return otherAway;
    }
    return null;
  }

  private drawEdge(
    ctx: CanvasRenderingContext2D,
    edge: TrackEdge,
    originX: number,
    originY: number,
    px: number,
    localCenter: (tile: number) => [number, number],
    tiesStyle: boolean,
  ): void {
    const scale = px / TILE_SIZE;

    if (edge.bridge) {
      const [x1, y1] = localCenter(edge.a);
      const [x2, y2] = localCenter(edge.b);
      const dx = x2 - x1;
      const dy = y2 - y1;
      const len = Math.hypot(dx, dy) || 1;
      const perpX = -dy / len;
      const perpY = dx / len;
      this.drawBridge(ctx, x1, y1, x2, y2, perpX, perpY, edge, scale);
      if (edge.electrified && tiesStyle) {
        this.drawCatenaryStraight(ctx, x1, y1, x2, y2, perpX, perpY, edge, scale);
      }
      return;
    }

    const dirAB = edge.direction;
    const partnerA = this.findFilletPartnerDir(edge.a, edge.b, dirAB);
    const partnerB = this.findFilletPartnerDir(edge.b, edge.a, (dirAB + 4) % 8);
    const centerline = buildEdgeGeometry(this.mapWidth, edge.a, edge.b, partnerA, partnerB);

    const railColor = TRACK_COLOR;
    // Separation between the two tracks of a double edge — wide enough to read as clearly two
    // tracks (not one thick one) at zoom 1-1.5, where this is drawn from the cached "tiesStyle"
    // raster (Phase 4 review: at the old, tighter gap the two rail pairs' inner rails nearly
    // touched). Only used for `edge.double`; single track never references it. Tile-space (not
    // pixel) since `EdgePath.offset` works in tile units.
    const gapTiles = 5 / TILE_SIZE;
    ctx.lineCap = "round";

    if (!tiesStyle) {
      ctx.strokeStyle = railColor;
      ctx.lineWidth = Math.max(1, (edge.double ? 2.4 : 1.6) * scale);
      if (edge.double) {
        tracePieceList(ctx, centerline.offset(-gapTiles).pieces, originX, originY, px);
        ctx.stroke();
        tracePieceList(ctx, centerline.offset(gapTiles).pieces, originX, originY, px);
        ctx.stroke();
      } else {
        tracePieceList(ctx, centerline.pieces, originX, originY, px);
        ctx.stroke();
      }
      if (edge.electrified)
        this.drawCatenaryOnPath(ctx, centerline, edge, originX, originY, px, scale);
      return;
    }

    const railGapTiles = 2.2 / TILE_SIZE;
    const tieHalfLenTiles = 4.2 / TILE_SIZE;
    const tieSpacingTiles = 7 / TILE_SIZE;

    const drawRailPair = (trackCenterline: EdgePath): void => {
      ctx.strokeStyle = railColor;
      ctx.lineWidth = Math.max(1, 1.1 * scale);
      tracePieceList(ctx, trackCenterline.offset(-railGapTiles).pieces, originX, originY, px);
      ctx.stroke();
      tracePieceList(ctx, trackCenterline.offset(railGapTiles).pieces, originX, originY, px);
      ctx.stroke();

      ctx.strokeStyle = TIE_COLOR;
      ctx.lineWidth = Math.max(1, 1.4 * scale);
      const steps = Math.max(1, Math.floor(trackCenterline.length / tieSpacingTiles));
      for (const sample of sampleEvenly(trackCenterline, steps, originX, originY, px)) {
        const perpX = -Math.sin(sample.angle);
        const perpY = Math.cos(sample.angle);
        const halfLenPx = tieHalfLenTiles * px;
        ctx.beginPath();
        ctx.moveTo(sample.lx - perpX * halfLenPx, sample.ly - perpY * halfLenPx);
        ctx.lineTo(sample.lx + perpX * halfLenPx, sample.ly + perpY * halfLenPx);
        ctx.stroke();
      }
    };

    if (edge.double) {
      drawRailPair(centerline.offset(-gapTiles));
      drawRailPair(centerline.offset(gapTiles));
    } else {
      drawRailPair(centerline);
    }

    if (edge.electrified)
      this.drawCatenaryOnPath(ctx, centerline, edge, originX, originY, px, scale);
  }

  /** Catenary poles + wire on electrified track (SPEC §7.7: "electric... requires electrified
   * track", rendered so it reads distinctly at zoom ≥ 1) — the wire follows the same curved
   * centerline as the rails (STYLE §7: "electrified catenary poles follow curves"), offset
   * perpendicular, with short poles at regular intervals connecting it back to the track. Only
   * called from the `tiesStyle` (zoom ≥ 0.75) rendering path; at lower zoom buckets the track
   * itself collapses to a single plain line, too small to read poles on top of anyway. */
  private drawCatenaryOnPath(
    ctx: CanvasRenderingContext2D,
    centerline: EdgePath,
    edge: TrackEdge,
    originX: number,
    originY: number,
    px: number,
    scale: number,
  ): void {
    const wireOffsetTiles = ((edge.double ? 20 : 16) * scale) / px;
    const wire = centerline.offset(wireOffsetTiles);

    ctx.strokeStyle = CATENARY_WIRE_COLOR;
    ctx.lineWidth = Math.max(0.8, 0.9 * scale);
    tracePieceList(ctx, wire.pieces, originX, originY, px);
    ctx.stroke();

    const spacingTiles = (9 * scale) / px;
    const steps = Math.max(1, Math.round(centerline.length / spacingTiles));
    const baseSamples = sampleEvenly(centerline, steps, originX, originY, px);
    const wireSamples = sampleEvenly(wire, steps, originX, originY, px);
    ctx.strokeStyle = CATENARY_POLE_COLOR;
    ctx.lineWidth = Math.max(1, 1.3 * scale);
    for (let i = 0; i < baseSamples.length; i++) {
      const base = baseSamples[i] as PathSample & { lx: number; ly: number };
      const wirePt = wireSamples[i] as PathSample & { lx: number; ly: number };
      ctx.beginPath();
      ctx.moveTo(base.lx, base.ly);
      ctx.lineTo(wirePt.lx, wirePt.ly);
      ctx.stroke();
    }
  }

  /** Same as `drawCatenaryOnPath` but for a bridge's fixed straight deck (never curved). */
  private drawCatenaryStraight(
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

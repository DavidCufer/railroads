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
 *
 * PLAN Phase 16.1 (play-test 3): a station tile never bends (no fillet at its own node) and never
 * pinches a touching double edge's taper to 0 at itself — see `trackPath.ts`'s
 * `isPassingLoopStation`/`stationApproachOffsetAt` for how the displaced single↔double turnout
 * moves onto the single-track side instead.
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
  doubleTrackOffsetAt,
  hasDoubleNeighborAt,
  isFilletBend,
  isPassingLoopStation,
  stationApproachOffsetAt,
  type EdgePath,
  type PathPiece,
  type PathSample,
} from "./trackPath";

const CHUNK_TILES = 16;
type ZoomBucket = 1 | 0.5 | 0.25;

/** Sampling resolution (tiles) for a double edge's diverging track, drawn as a polyline instead of
 * an `EdgePath` (see `drawVariableOffsetLine`) — fine enough that the polyline reads as smoothly
 * curved through a fillet at any zoom. */
const DIVERGING_SAMPLE_SPACING_TILES = 0.12;

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
  /** Station tiles (PLAN Phase 16.1) — a double edge never tapers at one of these, and a fillet
   * arc is never drawn through one (the station tile is always straight). Chunk canvases are
   * cached, so this needs its own setter that busts the cache, same as `setMap`/`invalidateTiles`. */
  private stationTiles: ReadonlySet<number> = new Set();

  constructor(mapWidth: number, mapHeight: number, graph: TrackGraph) {
    this.mapWidth = mapWidth;
    this.mapHeight = mapHeight;
    this.graph = graph;
  }

  setMap(mapWidth: number, mapHeight: number, graph: TrackGraph): void {
    this.mapWidth = mapWidth;
    this.mapHeight = mapHeight;
    this.graph = graph;
    this.stationTiles = new Set();
    this.cache.clear();
  }

  /** Call whenever the set of built stations changes (a station build is the only thing that adds
   * one — SPEC has no bulldoze-station command). Stations are rare events, so simply dropping the
   * whole chunk cache is fine (no need to track exactly which chunks a station's approach geometry
   * reaches). */
  setStations(stationTiles: ReadonlySet<number>): void {
    this.stationTiles = stationTiles;
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
    // PLAN Phase 16.1 ("the station tile is always straight"): never fillet a bend at a station's
    // own node — a train platform reads as one clean straight run through the tile, whatever angle
    // the track happens to meet it at.
    const partnerA = this.stationTiles.has(edge.a)
      ? null
      : this.findFilletPartnerDir(edge.a, edge.b, dirAB);
    const partnerB = this.stationTiles.has(edge.b)
      ? null
      : this.findFilletPartnerDir(edge.b, edge.a, (dirAB + 4) % 8);
    const centerline = buildEdgeGeometry(this.mapWidth, edge.a, edge.b, partnerA, partnerB);

    const railColor = TRACK_COLOR;
    ctx.lineCap = "round";
    const centerlineLen = centerline.length;

    // PLAN Phase 16 (play-test 2): a double edge's two tracks are no longer symmetric offsets of a
    // shared centerline — one ("through") *is* the centerline exactly, the other ("diverging")
    // eases out to `DOUBLE_TRACK_SPACING_TILES` away from it. That's what lets a single↔double
    // transition taper smoothly instead of splaying: the through track needs no special handling at
    // all (it's already the single track's own line), only the diverging one ramps in `offsetAt`.
    // PLAN Phase 16.1: a station never pinches this taper to 0 at its own end — see
    // `isPassingLoopStation`'s doc comment for where the displaced taper goes instead.
    let secondaryOffsetAt: ((d: number) => number) | null = null;
    if (edge.double) {
      const taperAtA =
        !hasDoubleNeighborAt(this.graph, edge.a, edge.b) && !this.stationTiles.has(edge.a);
      const taperAtB =
        !hasDoubleNeighborAt(this.graph, edge.b, edge.a) && !this.stationTiles.has(edge.b);
      secondaryOffsetAt = (d) => doubleTrackOffsetAt(d, centerlineLen, taperAtA, taperAtB);
    } else {
      const approachAtA = isPassingLoopStation(this.graph, edge.a, this.stationTiles);
      const approachAtB = isPassingLoopStation(this.graph, edge.b, this.stationTiles);
      if (approachAtA || approachAtB) {
        secondaryOffsetAt = (d) =>
          stationApproachOffsetAt(d, centerlineLen, approachAtA, approachAtB);
      }
    }

    if (!tiesStyle) {
      ctx.strokeStyle = railColor;
      ctx.lineWidth = Math.max(1, (edge.double ? 2.4 : 1.6) * scale);
      tracePieceList(ctx, centerline.pieces, originX, originY, px);
      ctx.stroke();
      if (secondaryOffsetAt) {
        this.drawVariableOffsetLine(ctx, centerline, secondaryOffsetAt, originX, originY, px);
      }
      if (edge.electrified)
        this.drawCatenaryOnPath(ctx, centerline, edge, originX, originY, px, scale);
      return;
    }

    const railGapTiles = 2.2 / TILE_SIZE;
    const tieHalfLenTiles = 4.2 / TILE_SIZE;
    const tieSpacingTiles = 7 / TILE_SIZE;

    ctx.strokeStyle = railColor;
    ctx.lineWidth = Math.max(1, 1.1 * scale);
    tracePieceList(ctx, centerline.offset(-railGapTiles).pieces, originX, originY, px);
    ctx.stroke();
    tracePieceList(ctx, centerline.offset(railGapTiles).pieces, originX, originY, px);
    ctx.stroke();

    if (secondaryOffsetAt) {
      const offsetAt = secondaryOffsetAt;
      // Second track's own two rails, at the through track's rail gap either side of its
      // (variable) own offset — sampled directly rather than via `EdgePath.offset`, which only
      // supports one constant offset for a whole edge. Same code path whether this is a genuine
      // double edge or a single edge's ghost approach into a passing-loop station (Phase 16.1) —
      // the latter just never gets a train lane, since the edge itself isn't double.
      this.drawVariableOffsetLine(
        ctx,
        centerline,
        (d) => offsetAt(d) - railGapTiles,
        originX,
        originY,
        px,
      );
      this.drawVariableOffsetLine(
        ctx,
        centerline,
        (d) => offsetAt(d) + railGapTiles,
        originX,
        originY,
        px,
      );

      // One shared, widening tie per sample (SPEC §5.1: "shared ballast bed") — spans from the
      // through track's own outer rail to the second track's own (growing) outer rail, so it reads
      // as one normal-width tie right at a single-track transition and widens into a shared
      // double-width tie further into the double section (or the station's own passing loop).
      this.drawTies(
        ctx,
        centerline,
        (d) => ({ left: -tieHalfLenTiles, right: offsetAt(d) + tieHalfLenTiles }),
        tieSpacingTiles,
        originX,
        originY,
        px,
        scale,
      );
    } else {
      this.drawTies(
        ctx,
        centerline,
        () => ({ left: -tieHalfLenTiles, right: tieHalfLenTiles }),
        tieSpacingTiles,
        originX,
        originY,
        px,
        scale,
      );
    }

    if (edge.electrified)
      this.drawCatenaryOnPath(ctx, centerline, edge, originX, originY, px, scale);
  }

  /** Strokes a smooth polyline tracking `centerline` with a per-distance perpendicular offset that
   * varies along the edge (`offsetAt`) — used for a double edge's diverging track/rail, which can't
   * be expressed as one `EdgePath.offset(dist)` call (that only supports a single constant offset
   * for the whole edge, arcs included). Sampled finely enough (`DIVERGING_SAMPLE_SPACING_TILES`)
   * that the polyline reads as smoothly curved at any zoom this is drawn at. */
  private drawVariableOffsetLine(
    ctx: CanvasRenderingContext2D,
    centerline: EdgePath,
    offsetAt: (distance: number) => number,
    originX: number,
    originY: number,
    px: number,
  ): void {
    const length = centerline.length;
    const steps = Math.max(4, Math.ceil(length / DIVERGING_SAMPLE_SPACING_TILES));
    ctx.beginPath();
    for (let s = 0; s <= steps; s++) {
      const d = (s / steps) * length;
      const sample = centerline.pointAt(d);
      const off = offsetAt(d);
      const perpX = -Math.sin(sample.angle);
      const perpY = Math.cos(sample.angle);
      const x = (sample.x + perpX * off - originX) * px;
      const y = (sample.y + perpY * off - originY) * px;
      if (s === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  /** Draws one tie (perpendicular cross-mark) per `spacingTiles` along `centerline`, each spanning
   * from `extentAt(d).left` to `extentAt(d).right` (signed perpendicular distances, not necessarily
   * symmetric — see the "shared ballast bed" comment above `drawEdge`'s double-track branch). */
  private drawTies(
    ctx: CanvasRenderingContext2D,
    centerline: EdgePath,
    extentAt: (distance: number) => { left: number; right: number },
    spacingTiles: number,
    originX: number,
    originY: number,
    px: number,
    scale: number,
  ): void {
    ctx.strokeStyle = TIE_COLOR;
    ctx.lineWidth = Math.max(1, 1.4 * scale);
    const length = centerline.length;
    const steps = Math.max(1, Math.floor(length / spacingTiles));
    for (let s = 0; s <= steps; s++) {
      const d = (s / steps) * length;
      const sample = centerline.pointAt(d);
      const { left, right } = extentAt(d);
      const perpX = -Math.sin(sample.angle);
      const perpY = Math.cos(sample.angle);
      const x0 = (sample.x + perpX * left - originX) * px;
      const y0 = (sample.y + perpY * left - originY) * px;
      const x1 = (sample.x + perpX * right - originX) * px;
      const y1 = (sample.y + perpY * right - originY) * px;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
    }
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
    // Each wire point is a *direct* perpendicular offset of its corresponding centerline sample
    // (not a fraction-matched sample of a separately-built offset curve — offsetting an arc
    // changes its length, same as a curve's outer rail being longer than its inner one, so
    // sampling the two curves independently "by fraction of length" drifts out of alignment on a
    // bend). This keeps every pole exactly perpendicular and the wire polyline naturally smooth.
    const wireOffsetTiles = ((edge.double ? 20 : 16) * scale) / px;
    const spacingTiles = (9 * scale) / px;
    const steps = Math.max(1, Math.round(centerline.length / spacingTiles));
    const baseSamples = sampleEvenly(centerline, steps, originX, originY, px);
    const wirePoints = baseSamples.map((s) => {
      const perpX = -Math.sin(s.angle);
      const perpY = Math.cos(s.angle);
      const wx = s.x + perpX * wireOffsetTiles;
      const wy = s.y + perpY * wireOffsetTiles;
      return { lx: (wx - originX) * px, ly: (wy - originY) * px };
    });

    ctx.strokeStyle = CATENARY_WIRE_COLOR;
    ctx.lineWidth = Math.max(0.8, 0.9 * scale);
    ctx.beginPath();
    wirePoints.forEach((p, i) => (i === 0 ? ctx.moveTo(p.lx, p.ly) : ctx.lineTo(p.lx, p.ly)));
    ctx.stroke();

    ctx.strokeStyle = CATENARY_POLE_COLOR;
    ctx.lineWidth = Math.max(1, 1.3 * scale);
    for (let i = 0; i < baseSamples.length; i++) {
      const base = baseSamples[i] as PathSample & { lx: number; ly: number };
      const wirePt = wirePoints[i] as { lx: number; ly: number };
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

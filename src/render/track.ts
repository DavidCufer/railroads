/**
 * Track renderer: cached per-chunk offscreen canvases, same scheme as TerrainRenderer (SPEC
 * §10.3, §10.4) — dark rails with ties at zoom ≥ 1, plain lines at lower zoom, bridges colored
 * distinctively by type, small junction dots, and a small red marker on nodes where two edges
 * meet at a sharper-than-45° angle (SPEC §5.1: buildable, but not traversable as a through route).
 *
 * PLAN Phase 17 B: everything geometric comes from the general lane model in `laneGeometry.ts` —
 * the graph is decomposed into *strands* (runs through degree-2 nodes, plus a short connector arc
 * for every traversable bend at a junction). Each strand has one centerline (straights + STYLE §7
 * fillet arcs) and a lane half-width `w(s)`: 0 on single track, half the lane spacing on double,
 * smoothstep-eased between. Rails are the two lanes at ±w(s) each with its own rail pair, and
 * **ties are one set per strand**, perpendicular to the centerline, spanning both lanes — so no
 * two tie sets ever cross, on straights, curves, turnouts, stations, junctions or bridges.
 * The train renderer places vehicles on the very same lane paths (`laneGeometry.ts`).
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
import { directionBetween } from "../sim/trains/geometry";
import type { TrackGraph } from "../sim/track/graph";
import type { TrackEdge } from "../sim/track/types";
import { ChunkCache } from "./chunkCache";
import { drawChunkSnapped } from "./pixelSnap";
import { buildTrackStrands, type LanePath, type Strand } from "./laneGeometry";

const CHUNK_TILES = 16;
type ZoomBucket = 1 | 0.5 | 0.25;

/** Polyline sampling step (tiles) for rails — fine enough that fillet arcs read as smooth curves. */
const RAIL_SAMPLE_TILES = 0.1;
/** Below this lane half-width (tiles) the second lane coincides with the first and isn't drawn. */
const LANE_VISIBLE_EPS = 0.004;
/** Connector arcs skip ties over their first/last stretch, where they still overlap the ties of
 * the through track / the branch strand they join. */
const CONNECTOR_TIE_MARGIN_START = 0.3;
const CONNECTOR_TIE_MARGIN_END = 0.12;
const TURNOUT_TIE_MARGIN_START = 0.5;

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

/** One drawable piece of a strand: an edge's arc-length range (or a whole connector). */
interface DrawItem {
  strand: Strand;
  sA: number;
  sB: number;
  /** The graph edge, absent for connectors. */
  edge: TrackEdge | undefined;
}

interface Frame {
  ctx: CanvasRenderingContext2D;
  originX: number;
  originY: number;
  px: number;
  scale: number;
}

/** Chunk-local pixel point at signed perpendicular `offset` (tiles) from a centerline sample. */
function offsetPoint(
  f: Frame,
  x: number,
  y: number,
  angle: number,
  offset: number,
): [number, number] {
  return [
    (x - Math.sin(angle) * offset - f.originX) * f.px,
    (y + Math.cos(angle) * offset - f.originY) * f.px,
  ];
}

/** Evenly spaced parameters covering `[s0, s1]` (always includes both ends). */
function paramsFor(s0: number, s1: number, step: number): number[] {
  const n = Math.max(2, Math.ceil((s1 - s0) / step));
  const out: number[] = [];
  for (let i = 0; i <= n; i++) out.push(s0 + ((s1 - s0) * i) / n);
  return out;
}

export class TrackRenderer {
  private cache = new ChunkCache<HTMLCanvasElement>(TRACK_CHUNK_CACHE_MAX);
  private mapWidth: number;
  private mapHeight: number;
  private graph: TrackGraph;
  /** Station tiles (PLAN Phase 16.1) — passing-loop stations are drawn with both lanes apart, and
   * a fillet is never drawn through one. Chunk canvases are cached, so this needs its own setter
   * that busts the cache, same as `setMap`/`invalidateTiles`. */
  private stationTiles: ReadonlySet<number> = new Set();
  /** Lazily rebuilt strand decomposition of `graph` (dropped whenever the track or stations change). */
  private strands: Strand[] | null = null;

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
    this.strands = null;
    this.cache.clear();
  }

  /** Call whenever the set of built stations changes (a station build is the only thing that adds
   * one — SPEC has no bulldoze-station command). Stations are rare events, so simply dropping the
   * whole chunk cache is fine. */
  setStations(stationTiles: ReadonlySet<number>): void {
    this.stationTiles = stationTiles;
    this.strands = null;
    this.cache.clear();
  }

  /** Drops cached chunk canvases touched by these tiles (endpoints + any bridge span), at every
   * zoom bucket — call after any track mutation (build/upgrade/bulldoze). A change at one node can
   * re-shape neighbouring edges (fillets, lane easing), so the surrounding two tiles are dropped
   * too. */
  invalidateTiles(tiles: readonly number[]): void {
    this.strands = null;
    const buckets: ZoomBucket[] = [1, 0.5, 0.25];
    const dropped = new Set<string>();
    for (const tile of tiles) {
      const [x, y] = tileXY(tile, this.mapWidth);
      for (let dy = -2; dy <= 2; dy += 2) {
        for (let dx = -2; dx <= 2; dx += 2) {
          const cx = Math.floor(Math.max(0, x + dx) / CHUNK_TILES);
          const cy = Math.floor(Math.max(0, y + dy) / CHUNK_TILES);
          for (const bucket of buckets) {
            const key = chunkCacheKey(cx, cy, bucket);
            if (dropped.has(key)) continue;
            dropped.add(key);
            this.cache.delete(key);
          }
        }
      }
    }
  }

  /** Number of chunk canvases currently cached (bounded by `TRACK_CHUNK_CACHE_MAX`) — exposed for
   * the Phase 12 memory-bounds e2e test. */
  get cacheSize(): number {
    return this.cache.size;
  }

  private getStrands(): Strand[] {
    this.strands ??= buildTrackStrands({
      mapWidth: this.mapWidth,
      graph: this.graph,
      stationTiles: this.stationTiles,
    });
    return this.strands;
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
        const tilesX = Math.min(CHUNK_TILES, this.mapWidth - cx * CHUNK_TILES);
        const tilesY = Math.min(CHUNK_TILES, this.mapHeight - cy * CHUNK_TILES);
        drawChunkSnapped(
          ctx,
          camera,
          viewportW,
          viewportH,
          canvas,
          { x: 0, y: 0, w: canvas.width, h: canvas.height },
          {
            x0: cx * chunkWorldSize,
            y0: cy * chunkWorldSize,
            x1: cx * chunkWorldSize + tilesX * TILE_SIZE,
            y1: cy * chunkWorldSize + tilesY * TILE_SIZE,
          },
        );
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
    const frame: Frame = { ctx, originX, originY, px, scale: px / TILE_SIZE };

    const touchesChunk = (tiles: readonly number[]): boolean => {
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const t of tiles) {
        const [x, y] = tileXY(t, this.mapWidth);
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
      return !(maxX < rangeMinX || minX > rangeMaxX || maxY < rangeMinY || minY > rangeMaxY);
    };

    const items: DrawItem[] = [];
    for (const strand of this.getStrands()) {
      if (strand.connector) {
        if (touchesChunk(strand.nodes)) {
          items.push({ strand, sA: 0, sB: strand.lane.length, edge: undefined });
        }
        continue;
      }
      for (const e of strand.edges) {
        if (!touchesChunk([e.a, e.b])) continue;
        items.push({ strand, sA: e.sA, sB: e.sB, edge: this.graph.getEdge(e.a, e.b) });
      }
    }

    // Decks first, then ties, then rails, then catenary — so a neighbouring item never paints over
    // another's rails.
    for (const item of items) {
      if (item.edge?.bridge) this.drawBridgeDeck(frame, item);
    }
    if (tiesStyle) {
      for (const item of items) {
        if (!item.edge?.bridge) this.drawTies(frame, item);
      }
    }
    for (const item of items) this.drawRails(frame, item, tiesStyle);
    if (tiesStyle) {
      for (const item of items) {
        if (item.edge ? item.edge.electrified : item.strand.electrified) {
          this.drawCatenary(frame, item);
        }
      }
      const turnouts = new Set<number>();
      for (const st of this.getStrands())
        if (st.turnoutAt !== undefined) turnouts.add(st.turnoutAt);
      for (const node of this.graph.allNodes()) {
        if (turnouts.has(node)) continue;
        const [x, y] = tileXY(node, this.mapWidth);
        if (x < rangeMinX || x > rangeMaxX || y < rangeMinY || y > rangeMaxY) continue;
        if (this.isDiamond(node)) this.drawDiamond(ctx, node, frame);
        else this.drawJunction(ctx, node, frame);
      }
    }

    return canvas;
  }

  /** Rails: each lane (at ±w(s)) gets its own rail pair; with `tiesStyle` off, one line per lane. */
  private drawRails(f: Frame, item: DrawItem, tiesStyle: boolean): void {
    const { ctx, scale } = f;
    const lane = item.strand.lane;
    const s = paramsFor(item.sA, item.sB, RAIL_SAMPLE_TILES);
    const centers = s.map((v) => lane.centerAt(v));
    const widths = s.map((v) => lane.halfWidthAt(v));
    const railGap = 2.2 / TILE_SIZE;

    ctx.strokeStyle = TRACK_COLOR;
    ctx.lineWidth = tiesStyle ? Math.max(1, 1.1 * scale) : Math.max(1, 1.6 * scale);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    // The outer rail of each lane is always drawn (at w=0 they are the single track's own two
    // rails). The inner rails only exist once the lanes are a full gauge apart (w >= gauge): before
    // that they would cross each other in an "X", so they start at the centerline as a V — like a
    // real turnout frog — and open up as the lanes separate. Without ties (overview zoom) each lane
    // is just one line, drawn only once it has separated from the first.
    const rails: Array<{ lane: number; rail: number; minW: number }> = tiesStyle
      ? [
          { lane: 1, rail: railGap, minW: 0 },
          { lane: -1, rail: -railGap, minW: 0 },
          { lane: 1, rail: -railGap, minW: railGap },
          { lane: -1, rail: railGap, minW: railGap },
        ]
      : [
          { lane: 1, rail: 0, minW: 0 },
          { lane: -1, rail: 0, minW: LANE_VISIBLE_EPS },
        ];
    for (const { lane: laneSign, rail, minW } of rails) {
      let open = false;
      ctx.beginPath();
      for (let i = 0; i < s.length; i++) {
        const w = widths[i] as number;
        if (w < minW || (minW > 0 && w <= 0)) {
          if (open) {
            ctx.stroke();
            ctx.beginPath();
            open = false;
          }
          continue;
        }
        const c = centers[i] as { x: number; y: number; angle: number };
        const [x, y] = offsetPoint(f, c.x, c.y, c.angle, laneSign * w + rail);
        if (open) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
        open = true;
      }
      if (open) ctx.stroke();
    }
  }

  /** One tie per fixed arc-length step along the strand centerline, perpendicular to it, spanning
   * both lanes plus overhang. Tie positions are global to the strand (`i * spacing`), each claimed
   * by exactly one edge range, so adjacent ranges never double up or leave gaps. */
  private drawTies(f: Frame, item: DrawItem): void {
    const { ctx, scale } = f;
    const lane = item.strand.lane;
    const tieHalf = 4.2 / TILE_SIZE;
    const spacing = 7 / TILE_SIZE;
    const isLast = item.sB >= lane.length - 1e-9;
    const first = item.sA <= 1e-9 ? 0 : Math.ceil(item.sA / spacing - 1e-9);
    ctx.strokeStyle = TIE_COLOR;
    ctx.lineWidth = Math.max(1, 1.4 * scale);
    ctx.lineCap = "butt";
    for (let i = first; ; i++) {
      const s = i * spacing;
      if (isLast ? s > item.sB + 1e-9 : s >= item.sB - 1e-9) break;
      if (item.strand.connector) {
        // A turnout arc starts on the through line's outer lane, whose own ties cover it.
        const startMargin =
          item.strand.turnoutAt !== undefined
            ? TURNOUT_TIE_MARGIN_START
            : CONNECTOR_TIE_MARGIN_START;
        if (s < startMargin || s > lane.length - CONNECTOR_TIE_MARGIN_END) continue;
      }
      const c = lane.centerAt(s);
      const ext = lane.halfWidthAt(s) + tieHalf;
      const [x0, y0] = offsetPoint(f, c.x, c.y, c.angle, -ext);
      const [x1, y1] = offsetPoint(f, c.x, c.y, c.angle, ext);
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
    }
  }

  /** Catenary poles + wire along the strand (SPEC §7.7), on the +side of the strand direction. */
  private drawCatenary(f: Frame, item: DrawItem): void {
    const { ctx, scale } = f;
    const lane: LanePath = item.strand.lane;
    const wireOffset = (item.edge?.double ? 20 : 16) / TILE_SIZE;
    const spacing = 9 / TILE_SIZE;
    const steps = Math.max(1, Math.round((item.sB - item.sA) / spacing));
    const base: Array<[number, number]> = [];
    const wire: Array<[number, number]> = [];
    for (let i = 0; i <= steps; i++) {
      const s = item.sA + ((item.sB - item.sA) * i) / steps;
      const c = lane.centerAt(s);
      base.push(offsetPoint(f, c.x, c.y, c.angle, 0));
      wire.push(offsetPoint(f, c.x, c.y, c.angle, wireOffset));
    }
    ctx.strokeStyle = CATENARY_WIRE_COLOR;
    ctx.lineWidth = Math.max(0.8, 0.9 * scale);
    ctx.beginPath();
    wire.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
    ctx.stroke();
    ctx.strokeStyle = CATENARY_POLE_COLOR;
    ctx.lineWidth = Math.max(1, 1.3 * scale);
    for (let i = 0; i < base.length; i++) {
      const [bx, by] = base[i] as [number, number];
      const [wx, wy] = wire[i] as [number, number];
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(wx, wy);
      ctx.stroke();
    }
  }

  /** A bridge is a colored deck under its strand range with trestle cross-marks (SPEC §5.1); the
   * rails are drawn over it like on any other track. */
  private drawBridgeDeck(f: Frame, item: DrawItem): void {
    const { ctx, scale } = f;
    const edge = item.edge as TrackEdge;
    const colors = BRIDGE_COLORS[edge.bridge as keyof typeof BRIDGE_COLORS];
    const lane = item.strand.lane;
    const deckHalfPx = (edge.double ? 8.5 : 4.5) * scale;
    const s = paramsFor(item.sA, item.sB, RAIL_SAMPLE_TILES * 2);

    ctx.strokeStyle = colors.deck;
    ctx.lineWidth = deckHalfPx * 2;
    ctx.lineCap = "butt";
    ctx.lineJoin = "round";
    ctx.beginPath();
    s.forEach((v, i) => {
      const c = lane.centerAt(v);
      const [x, y] = offsetPoint(f, c.x, c.y, c.angle, 0);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    ctx.strokeStyle = colors.trestle;
    ctx.lineWidth = Math.max(1, 1.3 * scale);
    const spacing = 8 / TILE_SIZE;
    const steps = Math.max(1, Math.floor((item.sB - item.sA) / spacing));
    const halfTiles = deckHalfPx / f.px;
    for (let i = 0; i <= steps; i++) {
      const v = item.sA + ((item.sB - item.sA) * i) / steps;
      const c = lane.centerAt(v);
      const [x0, y0] = offsetPoint(f, c.x, c.y, c.angle, -halfTiles);
      const [x1, y1] = offsetPoint(f, c.x, c.y, c.angle, halfTiles);
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
    }
  }

  /** A node where two single-track lines cross at 90° with no way to turn from one onto the other:
   * four legs a quarter-turn apart, all plain (single, not bridged), not a station. Drawn as a
   * diamond crossing (PLAN Phase 25A) instead of two overlapping tie sets under a junction dot. */
  private isDiamond(node: number): boolean {
    if (this.stationTiles.has(node)) return false;
    const edges = this.graph.edgesAt(node);
    if (edges.length !== 4) return false;
    const dirs: number[] = [];
    for (const e of edges) {
      if (e.double || e.bridge) return false;
      const other = e.a === node ? e.b : e.a;
      dirs.push(directionBetween(node, other, this.mapWidth));
    }
    dirs.sort((p, q) => p - q);
    return (
      dirs[1] === (dirs[0] as number) + 2 &&
      dirs[2] === (dirs[0] as number) + 4 &&
      dirs[3] === (dirs[0] as number) + 6
    );
  }

  /** Diamond crossing: one tie plate under both lines (the two tie sets no longer cross), the four
   * rails carried straight across it, a frog at each rail intersection and check rails inside the
   * running rails on both approaches. */
  private drawDiamond(ctx: CanvasRenderingContext2D, node: number, f: Frame): void {
    const [tx, ty] = tileXY(node, this.mapWidth);
    const cx = tx + 0.5;
    const cy = ty + 0.5;
    const edges = this.graph.edgesAt(node);
    const first = edges[0] as TrackEdge;
    const dir = directionBetween(node, first.a === node ? first.b : first.a, this.mapWidth);
    const base = (dir * Math.PI) / 4;
    const pt = (u: number, n: number, angle: number): [number, number] => [
      (cx + Math.cos(angle) * u - Math.sin(angle) * n - f.originX) * f.px,
      (cy + Math.sin(angle) * u + Math.cos(angle) * n - f.originY) * f.px,
    ];
    const scale = f.scale;
    const railGap = 2.2 / TILE_SIZE;
    const plate = 4.4 / TILE_SIZE;
    const reach = plate + 0.06;

    // Tie plate: a square aligned with the lines, dark sleepers laid across each direction.
    ctx.fillStyle = TIE_COLOR;
    ctx.beginPath();
    for (const [i, [u, n]] of (
      [
        [-plate, -plate],
        [plate, -plate],
        [plate, plate],
        [-plate, plate],
      ] as const
    ).entries()) {
      const [x, y] = pt(u, n, base);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(30, 22, 16, 0.55)";
    ctx.lineWidth = Math.max(1, 1.2 * scale);
    for (const angle of [base, base + Math.PI / 2]) {
      for (const u of [-0.5 * plate, 0.5 * plate]) {
        const [x0, y0] = pt(u, -plate, angle);
        const [x1, y1] = pt(u, plate, angle);
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
      }
    }

    // Running rails straight across, then check rails just inside them on each approach.
    ctx.strokeStyle = TRACK_COLOR;
    ctx.lineCap = "butt";
    for (const angle of [base, base + Math.PI / 2]) {
      ctx.lineWidth = Math.max(1, 1.1 * scale);
      for (const side of [-1, 1]) {
        const [x0, y0] = pt(-reach, side * railGap, angle);
        const [x1, y1] = pt(reach, side * railGap, angle);
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
      }
      ctx.lineWidth = Math.max(0.8, 0.9 * scale);
      const inner = railGap - 1.5 / TILE_SIZE;
      for (const side of [-1, 1]) {
        for (const end of [-1, 1]) {
          const [x0, y0] = pt(end * (railGap + 0.05), side * inner, angle);
          const [x1, y1] = pt(end * (plate - 0.005), side * inner, angle);
          ctx.beginPath();
          ctx.moveTo(x0, y0);
          ctx.lineTo(x1, y1);
          ctx.stroke();
        }
      }
    }

    // Frogs where the running rails of the two lines meet.
    ctx.fillStyle = JUNCTION_DOT_COLOR;
    const half = 1.2 * scale;
    for (const a of [-1, 1]) {
      for (const b of [-1, 1]) {
        const [x, y] = pt(a * railGap, b * railGap, base);
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(base);
        ctx.fillRect(-half, -half, half * 2, half * 2);
        ctx.restore();
      }
    }
  }

  private drawJunction(ctx: CanvasRenderingContext2D, node: number, f: Frame): void {
    const edges = this.graph.edgesAt(node);
    const [tx, ty] = tileXY(node, this.mapWidth);
    const x = (tx - f.originX + 0.5) * f.px;
    const y = (ty - f.originY + 0.5) * f.px;
    const scale = f.scale;

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

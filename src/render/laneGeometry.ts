/**
 * General track/lane geometry model (PLAN Phase 17 B) — the single source of truth for where rails,
 * ties and vehicles are drawn. Replaces the Phase 16/16.1 special cases (per-edge "through" and
 * "diverging" tracks, station approach ghosts) with one idea:
 *
 *  - A **centerline path** (`LanePath`): straight pieces + circular fillet arcs (`trackPath.ts`)
 *    through a list of nodes, parameterised by arc length `s` in tiles.
 *  - A **lane half-width** `laneHalfWidthAt(s)`: 0 on single track, `LANE_HALF_TILES` on double,
 *    eased with a smoothstep over `TURNOUT_EASE_TILES` wherever the two meet. Two lanes sit at
 *    `±halfWidth` of the centerline, symmetric, so nothing depends on which way a path happens to
 *    be oriented (the old model's asymmetry is what produced crossing tie fans on curves).
 *  - **Ties: one set per strand**, perpendicular to the centerline, spanning both lanes.
 *  - **Vehicles** ride the same path by arc length in the lane on the right-hand side of their
 *    own travel (`laneAt(s, +1)`), so a train always sits on a rail that is actually drawn.
 *
 * Easing is measured along the path (`LanePath.halfWidthAt`), so it spans several one-tile edges.
 *
 * Node "split" rule (`nodeIsSplit`): a node is drawn with both lanes apart iff it is a station
 * with some double edge touching it (a passing loop), or a double line passes through it (two
 * double edges leaving ≥135° apart — a single branch may attach, it gets a ghost funnel). Every
 * other node is drawn single, so a double edge tapers to one track there and a single edge next to
 * a passing-loop station grows a second (ghost) lane over `TURNOUT_EASE_TILES`. Easing is
 * measured along the path (`LanePath.halfWidthAt`) from the node's fillet midpoint, so it spans
 * several one-tile edges; where it overlaps a fillet arc the offset just keeps easing continuously
 * across the arc — no transition ever restarts on a curve, and none is ever squeezed into half an
 * edge.
 *
 * Render-only. `src/sim/**` is untouched.
 */
import { DIRS8 } from "../sim/map/grid";
import { directionSteps, edgeKey, type TrackGraph } from "../sim/track/graph";
import { legsFormCrossing } from "../sim/track/turn";
import { directionBetween } from "../sim/trains/geometry";
import {
  DOUBLE_TRACK_SPACING_TILES,
  EdgePath,
  FILLET_RADIUS_TILES,
  FILLET_TANGENT_TILES,
  TURNOUT_EASE_TILES,
  halfFillet,
  isFilletBend,
  type PathPiece,
  type PathSample,
} from "./trackPath";

/** Half the center-to-center distance between a double edge's two lanes, in tiles. */
export const LANE_HALF_TILES = DOUBLE_TRACK_SPACING_TILES / 2;

/** Arc length of half a 45° fillet (from its tangent point to its midpoint). */
export const HALF_ARC_TILES = (FILLET_RADIUS_TILES * Math.PI) / 8;

export interface GeomEnv {
  mapWidth: number;
  graph: TrackGraph;
  stationTiles: ReadonlySet<number>;
  /** Optional per-frame memo for `nodeIsSplit` (trains re-query the same nodes every frame). */
  splitCache?: Map<number, boolean>;
}

export function smoothstep(x: number): number {
  const t = Math.max(0, Math.min(1, x));
  return t * t * (3 - 2 * t);
}

/** See the module doc: both lanes are drawn apart at this node. */
export function nodeIsSplit(env: GeomEnv, node: number): boolean {
  const cached = env.splitCache?.get(node);
  if (cached !== undefined) return cached;
  const edges = env.graph.edgesAt(node);
  let split = false;
  if (edges.length > 0) {
    if (env.stationTiles.has(node)) {
      split = edges.some((e) => e.double);
    } else {
      // A double line passes through the node: two double edges leaving ≥135° apart (straight, or
      // the 45° bend a train can take). Single branches may attach; they get a ghost lane funnel.
      const away = edges
        .filter((e) => e.double)
        .map((e) => (e.a === node ? e.direction : (e.direction + 4) % 8));
      for (let i = 0; i < away.length && !split; i++) {
        for (let j = i + 1; j < away.length; j++) {
          if (directionSteps(away[i] as number, away[j] as number) >= 3) {
            split = true;
            break;
          }
        }
      }
    }
  }
  env.splitCache?.set(node, split);
  return split;
}

/** A centerline path with per-node arc-length positions and a lane half-width function. */
export class LanePath {
  constructor(
    readonly path: EdgePath,
    /** Arc-length position of each node (the midpoint of its fillet arc, or the node itself). May
     * be negative for a node whose fillet was trimmed off the start of the pieces. */
    readonly nodeS: readonly number[],
    private readonly edgeDouble: readonly boolean[],
    private readonly nodeSplit: readonly boolean[],
  ) {}

  get length(): number {
    return this.path.length;
  }

  /**
   * Lane half-width at arc length `s` (tiles). Measured along the *path*, not per edge — graph
   * edges are one tile long, so a "1.5 tile" ease necessarily spans two or three of them:
   *  - on a double edge: full width, easing (smoothstep) to 0 over `TURNOUT_EASE_TILES` toward the
   *    nearest non-split node of its double run (a single↔double transition, a junction with a
   *    single branch, a dead end);
   *  - on a single edge: 0, except within `TURNOUT_EASE_TILES` of a split node (a passing-loop
   *    station), where the second lane fades out over the single track (the "ghost" turnout).
   * Only nodes within `TURNOUT_EASE_TILES` of `s` can matter, so a path window that reaches that
   * far past the positions being queried gives exactly the same answer as the whole strand.
   */
  halfWidthAt(s: number): number {
    const m = this.edgeDouble.length;
    if (m === 0) return 0;
    const S = this.nodeS;
    const E = TURNOUT_EASE_TILES;
    let lo = 0;
    let hi = m - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if ((S[mid] as number) <= s) lo = mid;
      else hi = mid - 1;
    }
    const k = lo;
    const x = Math.max(S[k] as number, Math.min(S[k + 1] as number, s));
    if (this.edgeDouble[k]) {
      let f = 1;
      for (let j = k; j >= 0; j--) {
        if (!this.nodeSplit[j]) {
          f = Math.min(f, smoothstep((x - (S[j] as number)) / E));
          break;
        }
        if (j === 0 || !this.edgeDouble[j - 1] || x - (S[j - 1] as number) >= E) break;
      }
      for (let j = k + 1; j <= m; j++) {
        if (!this.nodeSplit[j]) {
          f = Math.min(f, smoothstep(((S[j] as number) - x) / E));
          break;
        }
        if (j === m || !this.edgeDouble[j] || (S[j + 1] as number) - x >= E) break;
      }
      return LANE_HALF_TILES * f;
    }
    let ghost = 0;
    for (let j = k; j >= 0; j--) {
      if (this.nodeSplit[j]) {
        ghost = Math.max(ghost, 1 - smoothstep((x - (S[j] as number)) / E));
        break;
      }
      if (j === 0 || this.edgeDouble[j - 1] || x - (S[j - 1] as number) >= E) break;
    }
    for (let j = k + 1; j <= m; j++) {
      if (this.nodeSplit[j]) {
        ghost = Math.max(ghost, 1 - smoothstep(((S[j] as number) - x) / E));
        break;
      }
      if (j === m || this.edgeDouble[j] || (S[j + 1] as number) - x >= E) break;
    }
    return LANE_HALF_TILES * ghost;
  }

  /** Centerline sample; beyond either end the path continues in a straight line. */
  centerAt(s: number): PathSample {
    if (s < 0 || s > this.path.length) {
      const edge = this.path.pointAt(s < 0 ? 0 : this.path.length);
      const over = s < 0 ? s : s - this.path.length;
      return {
        x: edge.x + Math.cos(edge.angle) * over,
        y: edge.y + Math.sin(edge.angle) * over,
        angle: edge.angle,
      };
    }
    return this.path.pointAt(s);
  }

  /** Point on lane `side` (+1 = the side you get by rotating the heading +90°, i.e. the
   * right-hand side of travel on a y-down screen; −1 = the other lane; 0 = centerline). */
  laneAt(s: number, side: number): PathSample {
    const c = this.centerAt(s);
    if (side === 0) return c;
    const w = this.halfWidthAt(Math.max(0, Math.min(this.path.length, s))) * side;
    return { x: c.x - Math.sin(c.angle) * w, y: c.y + Math.cos(c.angle) * w, angle: c.angle };
  }
}

function tileCenter(tile: number, mapWidth: number): { x: number; y: number } {
  return { x: (tile % mapWidth) + 0.5, y: Math.floor(tile / mapWidth) + 0.5 };
}

export interface LanePathSpec {
  nodes: readonly number[];
  /** Veto for a fillet at interior node index `k` (default: allowed). */
  allowFillet?: (k: number) => boolean;
  /** The strand starts / ends at the tangent point of a junction connector instead of the node. */
  trimStart?: boolean;
  trimEnd?: boolean;
  /** Emit only the fillet arc at interior node 1 (junction connector between `nodes[0]`,
   * `nodes[1]`, `nodes[2]`). */
  arcOnly?: boolean;
  /** Extra distance (tiles) the trimmed start / end is pulled back along its edge, beyond the
   * fillet tangent trim — a turnout branch leaves from the outer lane, not from the centerline,
   * so its arc's vertex sits `√2·w` along the branch. The node then sits at the path's end. */
  startShift?: number;
  endShift?: number;
  /** `arcOnly`: the fillet vertex is moved to `centers[1] + vertexShift` (turnout connector). */
  vertexShift?: { x: number; y: number };
  /** Every lane is drawn single (w = 0): a turnout connector is one track. */
  forceSingle?: boolean;
  /** No ghost funnel at a non-station junction end of a single strand: a branch stays single
   * right up to its turnout instead of fanning out into a second lane. */
  noJunctionGhost?: boolean;
}

/** True if the two consecutive route steps through `node` form the one traversable 45° bend. */
export function isBendAt(mapWidth: number, prev: number, node: number, next: number): boolean {
  const back = directionBetween(node, prev, mapWidth);
  const fwd = directionBetween(node, next, mapWidth);
  return isFilletBend(back, fwd);
}

export function buildLanePath(env: GeomEnv, spec: LanePathSpec): LanePath {
  const { mapWidth, graph } = env;
  const nodes = spec.nodes;
  const m = nodes.length - 1;
  const t = FILLET_TANGENT_TILES;
  const centers = nodes.map((n) => tileCenter(n, mapWidth));
  if (spec.vertexShift && spec.arcOnly) {
    const c = centers[1] as { x: number; y: number };
    centers[1] = { x: c.x + spec.vertexShift.x, y: c.y + spec.vertexShift.y };
  }
  const startShift = spec.startShift ?? 0;
  const endShift = spec.endShift ?? 0;
  const dirs: number[] = [];
  const units: Array<{ x: number; y: number }> = [];
  for (let k = 0; k < m; k++) {
    const dir = directionBetween(nodes[k] as number, nodes[k + 1] as number, mapWidth);
    dirs.push(dir);
    const [dx, dy] = DIRS8[dir] as readonly [number, number];
    const len = Math.hypot(dx, dy);
    units.push({ x: dx / len, y: dy / len });
  }

  const fil: boolean[] = nodes.map(() => false);
  for (let k = 1; k < m; k++) {
    const allowed = spec.allowFillet ? spec.allowFillet(k) : true;
    fil[k] = allowed && isFilletBend(((dirs[k - 1] as number) + 4) % 8, dirs[k] as number);
  }
  const virt = fil.slice();
  if (spec.trimStart) virt[0] = true;
  if (spec.trimEnd) virt[m] = true;

  const pieces: PathPiece[] = [];
  for (let k = 0; k < m; k++) {
    const c0 = centers[k] as { x: number; y: number };
    const c1 = centers[k + 1] as { x: number; y: number };
    const u = units[k] as { x: number; y: number };
    if (!spec.arcOnly) {
      const tS = t + (k === 0 ? startShift : 0);
      const tE = t + (k + 1 === m ? endShift : 0);
      const x0 = virt[k] ? c0.x + u.x * tS : c0.x;
      const y0 = virt[k] ? c0.y + u.y * tS : c0.y;
      const x1 = virt[k + 1] ? c1.x - u.x * tE : c1.x;
      const y1 = virt[k + 1] ? c1.y - u.y * tE : c1.y;
      pieces.push({ kind: "line", x0, y0, x1, y1 });
    }
    if (fil[k + 1] && k + 1 < m) {
      const hf = halfFillet(c1.x, c1.y, ((dirs[k] as number) + 4) % 8, dirs[k + 1] as number);
      pieces.push({
        kind: "arc",
        cx: hf.center.x,
        cy: hf.center.y,
        r: hf.radius,
        a0: hf.angleAtTangent,
        a1: hf.angleAtTangent + 2 * hf.sweepToMid,
      });
    }
  }
  const path = new EdgePath(pieces);

  // Node positions along the path: each segment between two node midpoints is its straight line
  // (node distance minus the tangent trim at each filleted end) plus half an arc at each end.
  const segLen: number[] = [];
  for (let k = 0; k < m; k++) {
    const c0 = centers[k] as { x: number; y: number };
    const c1 = centers[k + 1] as { x: number; y: number };
    const trimS = virt[k] ? t + (k === 0 ? startShift : 0) : 0;
    const trimE = virt[k + 1] ? t + (k + 1 === m ? endShift : 0) : 0;
    const arcS = virt[k] && !(k === 0 && startShift > 0) ? HALF_ARC_TILES : 0;
    const arcE = virt[k + 1] && !(k + 1 === m && endShift > 0) ? HALF_ARC_TILES : 0;
    segLen.push(Math.hypot(c1.x - c0.x, c1.y - c0.y) - trimS - trimE + arcS + arcE);
  }
  const nodeS: number[] = new Array<number>(m + 1).fill(0);
  if (spec.arcOnly) {
    nodeS[1] = HALF_ARC_TILES;
    nodeS[0] = nodeS[1] - (segLen[0] as number);
  } else {
    nodeS[0] = spec.trimStart && startShift <= 0 ? -HALF_ARC_TILES : 0;
    for (let k = 0; k < m; k++) nodeS[k + 1] = (nodeS[k] as number) + (segLen[k] as number);
  }
  if (spec.arcOnly) {
    for (let k = 1; k < m; k++) nodeS[k + 1] = (nodeS[k] as number) + (segLen[k] as number);
  }

  const edgeDouble = segLen.map(
    (_, k) => graph.getEdge(nodes[k] as number, nodes[k + 1] as number)?.double ?? false,
  );
  if (spec.forceSingle) {
    return new LanePath(
      path,
      nodeS,
      edgeDouble.map(() => false),
      nodes.map(() => false),
    );
  }
  const nodeSplit = nodes.map((n) => nodeIsSplit(env, n));
  if (spec.noJunctionGhost) {
    for (const k of [0, m]) {
      const n = nodes[k] as number;
      const adjacentDouble = edgeDouble[k === 0 ? 0 : m - 1];
      if (!adjacentDouble && !env.stationTiles.has(n) && graph.neighborsOf(n).length >= 3) {
        nodeSplit[k] = false;
      }
    }
  }
  return new LanePath(path, nodeS, edgeDouble, nodeSplit);
}

// --- Whole-network strands (track renderer) -----------------------------------------------------

export interface StrandEdge {
  a: number;
  b: number;
  /** Arc-length range of this edge on the strand, clamped to `[0, length]`. */
  sA: number;
  sB: number;
}

export interface Strand {
  lane: LanePath;
  edges: StrandEdge[];
  /** Junction connector (just a fillet arc); its `edges` list is empty. */
  connector: boolean;
  /** Tiles the strand touches — for chunk culling. */
  nodes: readonly number[];
  /** Any edge electrified (connectors: either edge it joins). */
  electrified: boolean;
  /** Turnout connector: the junction node whose arc leaves the through line's outer lane. */
  turnoutAt?: number;
}

/** A single branch leaving a straight double line at 45° diverges from the near (outer) lane: the
 * arc's vertex moves from the junction node to where the branch line meets that lane, `√2·w` along
 * the branch. Returns null unless `j` is that case for the pair (`nMain`, `nBranch`). */
function turnoutShift(
  env: GeomEnv,
  j: number,
  nMain: number,
  nBranch: number,
): { x: number; y: number; dist: number } | null {
  const { graph, mapWidth, stationTiles } = env;
  if (stationTiles.has(j)) return null;
  if (!graph.getEdge(j, nMain)?.double || graph.getEdge(j, nBranch)?.double) return null;
  const back = directionBetween(j, nMain, mapWidth);
  const branch = directionBetween(j, nBranch, mapWidth);
  let hasOpposite = false;
  for (const o of graph.neighborsOf(j)) {
    const d = directionBetween(j, o, mapWidth);
    if (d === (back + 4) % 8 && graph.getEdge(j, o)?.double) hasOpposite = true;
    if (o !== nBranch && d === (branch + 4) % 8) return null; // branch continues straight through
  }
  if (!hasOpposite) return null;
  const [dx, dy] = DIRS8[branch] as readonly [number, number];
  const len = Math.hypot(dx, dy);
  const dist = Math.SQRT2 * LANE_HALF_TILES;
  return { x: (dx / len) * dist, y: (dy / len) * dist, dist };
}

function awayDir(a: number, b: number, mapWidth: number): number {
  return directionBetween(a, b, mapWidth);
}

/** Decomposes the graph into strands (maximal runs through degree-2 nodes) plus a short connector
 * arc for every traversable bend at a junction, so the drawn rails match exactly the path a
 * bending train follows (`buildRouteLanePath`). */
export function buildTrackStrands(env: GeomEnv): Strand[] {
  const { graph, mapWidth, stationTiles } = env;
  env.splitCache ??= new Map();
  const strands: Strand[] = [];
  const nodesAll = graph.allNodes().sort((p, q) => p - q);

  // Junction classification: which traversable bends need a connector, and which edge ends are
  // trimmed back to the connector's tangent point.
  const trimmed = new Map<string, number>();
  const connectors: Array<{
    n1: number;
    j: number;
    n2: number;
    shift?: { x: number; y: number };
  }> = [];
  for (const j of nodesAll) {
    const neighbors = graph.neighborsOf(j).sort((p, q) => p - q);
    if (neighbors.length < 3 || stationTiles.has(j)) continue;
    const dirs = neighbors.map((n) => awayDir(j, n, mapWidth));
    // A crossing (two straight pairs) has no connector arcs: the lines run straight over each other.
    if (legsFormCrossing(dirs)) continue;
    const through = dirs.map((d, i) =>
      dirs.some((d2, i2) => i2 !== i && directionSteps(d, d2) === 4),
    );
    for (let i = 0; i < neighbors.length; i++) {
      for (let i2 = i + 1; i2 < neighbors.length; i2++) {
        if (!isFilletBend(dirs[i] as number, dirs[i2] as number)) continue;
        const n1 = neighbors[i] as number;
        const n2 = neighbors[i2] as number;
        const turnout =
          through[i] && !through[i2]
            ? turnoutShift(env, j, n1, n2)
            : through[i2] && !through[i]
              ? turnoutShift(env, j, n2, n1)
              : null;
        if (turnout) {
          // Main neighbour first, so the connector starts on the through line.
          const mainFirst = through[i] as boolean;
          connectors.push({
            n1: mainFirst ? n1 : n2,
            j,
            n2: mainFirst ? n2 : n1,
            shift: turnout,
          });
          trimmed.set(`${edgeKey(j, mainFirst ? n2 : n1)}@${j}`, turnout.dist);
          continue;
        }
        connectors.push({ n1, j, n2 });
        if (!through[i]) trimmed.set(`${edgeKey(j, n1)}@${j}`, 0);
        if (!through[i2]) trimmed.set(`${edgeKey(j, n2)}@${j}`, 0);
      }
    }
  }

  const visited = new Set<string>();
  const walk = (start: number, first: number): number[] => {
    const list = [start, first];
    visited.add(edgeKey(start, first));
    let prev = start;
    let cur = first;
    while (cur !== start && graph.neighborsOf(cur).length === 2) {
      const next = graph.neighborsOf(cur).find((n) => n !== prev) as number;
      if (visited.has(edgeKey(cur, next))) break;
      visited.add(edgeKey(cur, next));
      list.push(next);
      prev = cur;
      cur = next;
    }
    return list;
  };

  const emit = (list: number[]): void => {
    const startKey = `${edgeKey(list[0] as number, list[1] as number)}@${list[0]}`;
    const last = list.length - 1;
    const endKey = `${edgeKey(list[last - 1] as number, list[last] as number)}@${list[last]}`;
    const lane = buildLanePath(env, {
      nodes: list,
      allowFillet: (k) => !stationTiles.has(list[k] as number),
      trimStart: trimmed.has(startKey),
      trimEnd: trimmed.has(endKey),
      startShift: trimmed.get(startKey) ?? 0,
      endShift: trimmed.get(endKey) ?? 0,
      noJunctionGhost: true,
    });
    const edges: StrandEdge[] = [];
    let electrified = false;
    for (let k = 0; k < last; k++) {
      const a = list[k] as number;
      const b = list[k + 1] as number;
      edges.push({
        a,
        b,
        sA: Math.max(0, lane.nodeS[k] as number),
        sB: Math.min(lane.length, lane.nodeS[k + 1] as number),
      });
      if (graph.getEdge(a, b)?.electrified) electrified = true;
    }
    strands.push({ lane, edges, connector: false, nodes: list, electrified });
  };

  for (const n of nodesAll) {
    const nb = graph.neighborsOf(n);
    if (nb.length === 2) continue;
    for (const first of nb.sort((p, q) => p - q)) {
      if (!visited.has(edgeKey(n, first))) emit(walk(n, first));
    }
  }
  // Pure loops of degree-2 nodes.
  for (const n of nodesAll) {
    for (const first of graph.neighborsOf(n).sort((p, q) => p - q)) {
      if (!visited.has(edgeKey(n, first))) emit(walk(n, first));
    }
  }

  for (const c of connectors) {
    const list = [c.n1, c.j, c.n2];
    const lane = buildLanePath(env, {
      nodes: list,
      arcOnly: true,
      ...(c.shift ? { vertexShift: c.shift } : {}),
      forceSingle: c.shift !== undefined,
    });
    const electrified =
      (graph.getEdge(c.j, c.n1)?.electrified ?? false) ||
      (graph.getEdge(c.j, c.n2)?.electrified ?? false);
    strands.push({
      lane,
      edges: [],
      connector: true,
      nodes: list,
      electrified,
      ...(c.shift ? { turnoutAt: c.j } : {}),
    });
  }
  return strands;
}

// --- Train route paths --------------------------------------------------------------------------

/** Centerline + lanes for a run of consecutive route nodes (a train's recent history plus the
 * next couple of nodes). Fillets wherever the route bends 45°, except at stations — identical to
 * what `buildTrackStrands` draws. */
export function buildRouteLanePath(env: GeomEnv, nodes: readonly number[]): LanePath {
  return buildLanePath(env, {
    nodes,
    allowFillet: (k) => !env.stationTiles.has(nodes[k] as number),
  });
}

/** Prepends nodes behind `chain[0]` by following the track backwards (straight ahead, or a legal
 * 45° bend, at each node) until the chain is at least `minLength` tiles long or the track ends /
 * forks with no clear continuation. Purely cosmetic history for the consist's tail. */
export function extendChainBackward(env: GeomEnv, chain: number[], minLength: number): number[] {
  const { graph, mapWidth } = env;
  const out = chain.slice();
  const lengthOf = (): number => {
    let total = 0;
    for (let i = 0; i + 1 < out.length; i++) {
      const a = tileCenter(out[i] as number, mapWidth);
      const b = tileCenter(out[i + 1] as number, mapWidth);
      total += Math.hypot(b.x - a.x, b.y - a.y);
    }
    return total;
  };
  for (let guard = 0; guard < 24 && out.length >= 2 && lengthOf() < minLength; guard++) {
    const first = out[0] as number;
    const second = out[1] as number;
    const heading = directionBetween(first, second, mapWidth);
    let best = -1;
    let bestSteps = 99;
    for (const cand of graph.neighborsOf(first).sort((p, q) => p - q)) {
      if (cand === second || out.includes(cand)) continue;
      const steps = directionSteps(directionBetween(cand, first, mapWidth), heading);
      if (steps <= 1 && steps < bestSteps) {
        best = cand;
        bestSteps = steps;
      }
    }
    if (best < 0) break;
    out.unshift(best);
  }
  return out;
}

export interface PlacedVehicle {
  x: number;
  y: number;
  angle: number;
  length: number;
}

/** Places vehicles end to end behind arc-length position `headS` (the loco's nose), separated by
 * `gap` tiles measured along the path. Each vehicle spans `[sFront - length, sFront]`; it is drawn
 * centered between the lane points at its two ends and rotated to the chord between them, so the
 * facing ends of consecutive vehicles are exactly `gap` apart along the rails on straight, diagonal
 * and curved track alike. */
export function placeVehicles(
  lane: LanePath,
  headS: number,
  lengths: readonly number[],
  gap: number,
  side = 1,
): PlacedVehicle[] {
  const out: PlacedVehicle[] = [];
  let sFront = headS;
  for (const length of lengths) {
    const front = lane.laneAt(sFront, side);
    const rear = lane.laneAt(sFront - length, side);
    const dx = front.x - rear.x;
    const dy = front.y - rear.y;
    out.push({
      x: (front.x + rear.x) / 2,
      y: (front.y + rear.y) / 2,
      angle: dx === 0 && dy === 0 ? front.angle : Math.atan2(dy, dx),
      length,
    });
    sFront -= length + gap;
  }
  return out;
}

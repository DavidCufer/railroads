/**
 * Build-time junction layout rules (PLAN Phase 27 A, SPEC §5.1 addendum). The free-form tile graph can
 * express layouts whose geometry the turnout/crossing model cannot draw and the interlock cannot keep
 * apart; instead of predefined junction pieces the build is refused, with a reason and a red preview
 * (like the Phase 18 sharp-turn rule). Pure functions of the graph plus the steps about to be built:
 *
 *  1. **No mid-tile crossings** — two diagonals of one 2×2 cell (an X with no node in the middle) may not
 *     both exist. Lines cross only *at a node*, straight over.
 *  2. **Junction shape** — a junction node (degree ≥ 3, not a station) needs a straight-through pair of
 *     legs with at most one branch on each side of it (turnout / diamond / X), or is a symmetric Y fork.
 *     No junction on a bend of the main line, no two branches on one side.
 *  3. **Junction spacing** — two junction nodes on one line must be ≥ `JUNCTION_MIN_SPACING_TILES`
 *     apart along it (room for the turnout curve).
 *
 * There is no separate clearance rule: on the 8-direction grid, edges that share no node are always ≥ 1/√2
 * tile apart (≥ 0.43 between the outer lanes of two double lines) and a vehicle is 0.26 wide, so the only
 * way for unconnected track to conflict is to cross (rule 1); connected track is rules 2–3 plus the
 * interlock's per-junction clearance (`conflicts.ts`).
 *
 * Only what a build *changes* is checked (its touched nodes / its new edges), so an old save that already
 * breaks a rule still loads, plays and can be extended elsewhere; `findExistingLayoutIssues` lists them
 * for the map's warning markers.
 */
import { DIRS8 } from "../map/grid";
import { directionSteps, type TrackGraph } from "./graph";
import type { TrackEdge } from "./types";

export const JUNCTION_MIN_SPACING_TILES = 2;

export type LayoutViolationKind =
  "midTileCrossing" | "junctionOnBend" | "tooManyBranches" | "junctionsTooClose";

export interface LayoutViolation {
  kind: LayoutViolationKind;
  /** Node (or, for a mid-tile crossing, the top-left tile of the cell) the problem sits at. */
  tile: number;
  /** New edges (`a`-`b` tile pairs) to draw red in the preview. */
  steps: Array<[number, number]>;
}

export interface LayoutStep {
  a: number;
  b: number;
}

/** Existing graph plus the edges about to be built. */
class View {
  private extra = new Map<string, LayoutStep>();
  constructor(
    readonly graph: TrackGraph,
    readonly width: number,
    steps: readonly LayoutStep[],
  ) {
    for (const s of steps) this.extra.set(this.key(s.a, s.b), s);
  }
  private key(a: number, b: number): string {
    return a < b ? `${a}|${b}` : `${b}|${a}`;
  }
  isNew(a: number, b: number): boolean {
    return this.extra.has(this.key(a, b)) && !this.graph.hasEdge(a, b);
  }
  has(a: number, b: number): boolean {
    return this.graph.hasEdge(a, b) || this.extra.has(this.key(a, b));
  }
  isBridge(a: number, b: number): boolean {
    return !!this.graph.getEdge(a, b)?.bridge;
  }
  neighbors(node: number): number[] {
    const out = new Set(this.graph.neighborsOf(node));
    for (const s of this.extra.values()) {
      if (s.a === node) out.add(s.b);
      else if (s.b === node) out.add(s.a);
    }
    return [...out];
  }
  dir(from: number, to: number): number {
    return stepDir(this.width, from, to);
  }
  length(a: number, b: number): number {
    const dx = Math.abs((a % this.width) - (b % this.width));
    const dy = Math.abs(Math.floor(a / this.width) - Math.floor(b / this.width));
    return Math.max(dx, dy) * (dx !== 0 && dy !== 0 ? Math.SQRT2 : 1);
  }
  xy(tile: number): [number, number] {
    return [tile % this.width, Math.floor(tile / this.width)];
  }
}

function stepDir(width: number, from: number, to: number): number {
  const sx = Math.sign((to % width) - (from % width));
  const sy = Math.sign(Math.floor(to / width) - Math.floor(from / width));
  return DIRS8.findIndex(([dx, dy]) => dx === sx && dy === sy);
}

/** Whether the outward leg directions of a junction node form a legal turnout / crossing / Y shape. */
export function junctionShape(legs: readonly number[]): "ok" | "bend" | "branches" {
  if (legs.length < 3) return "ok";
  // A symmetric fork: a stem and two legs 135° either side of it.
  if (legs.length === 3) {
    for (const stem of legs) {
      const others = legs.filter((l) => l !== stem);
      if (
        others.every((o) => directionSteps(stem, o) === 3) &&
        directionSteps(others[0] as number, others[1] as number) === 2
      )
        return "ok";
    }
  }
  let sawStraight = false;
  for (const a of legs) {
    const opposite = (a + 4) % 8;
    if (!legs.includes(opposite)) continue;
    sawStraight = true;
    let left = 0;
    let right = 0;
    for (const l of legs) {
      if (l === a || l === opposite) continue;
      // Side of the axis a -> opposite: legs a+1..a+3 are one side, a+5..a+7 the other.
      if ((l - a + 8) % 8 < 4) left++;
      else right++;
    }
    if (left <= 1 && right <= 1) return "ok";
  }
  return sawStraight ? "branches" : "bend";
}

function legsOf(view: View, node: number): number[] {
  return view.neighbors(node).map((n) => view.dir(node, n));
}

function isJunction(view: View, stationTiles: ReadonlySet<number>, node: number): boolean {
  return !stationTiles.has(node) && view.neighbors(node).length >= 3;
}

/** Distance (tiles) from `node` along each leg to the next junction node, if it is closer than `limit`
 * (stops at stations, dead ends and anything that is not a plain 2-leg bend). */
function nearJunctionOnLeg(
  view: View,
  stationTiles: ReadonlySet<number>,
  node: number,
  first: number,
  limit: number,
): number | undefined {
  let prev = node;
  let cur = first;
  let dist = view.length(node, first);
  while (dist < limit) {
    if (stationTiles.has(cur)) return undefined;
    const next = view.neighbors(cur);
    if (next.length >= 3) return dist;
    if (next.length !== 2) return undefined;
    const after = next[0] === prev ? (next[1] as number) : (next[0] as number);
    dist += view.length(cur, after);
    prev = cur;
    cur = after;
  }
  return undefined;
}

/** Rule violations a build of `steps` (new edges) would
 * introduce. */
export function findLayoutViolations(
  graph: TrackGraph,
  mapWidth: number,
  stationTiles: ReadonlySet<number>,
  steps: readonly LayoutStep[],
): LayoutViolation[] {
  const view = new View(graph, mapWidth, steps);
  const out: LayoutViolation[] = [];
  const fresh = steps.filter((s) => view.isNew(s.a, s.b));

  // 1. Mid-tile crossings.
  for (const s of fresh) {
    if (view.isBridge(s.a, s.b)) continue;
    const [ax, ay] = view.xy(s.a);
    const [bx, by] = view.xy(s.b);
    if (Math.abs(bx - ax) !== 1 || Math.abs(by - ay) !== 1) continue;
    const x0 = Math.min(ax, bx);
    const y0 = Math.min(ay, by);
    const p = y0 * mapWidth + x0;
    const q = y0 * mapWidth + x0 + 1;
    const r = (y0 + 1) * mapWidth + x0;
    const t = (y0 + 1) * mapWidth + x0 + 1;
    const partner = (ax - bx) * (ay - by) > 0 ? [q, r] : [p, t];
    if (view.has(partner[0] as number, partner[1] as number))
      out.push({ kind: "midTileCrossing", tile: p, steps: [[s.a, s.b]] });
  }

  // 2 + 3. Junction shape and spacing at every node a new edge touches.
  const touched = new Set<number>();
  for (const s of fresh) {
    touched.add(s.a);
    touched.add(s.b);
  }
  for (const node of touched) {
    if (!isJunction(view, stationTiles, node)) continue;
    const mine = fresh
      .filter((s) => s.a === node || s.b === node)
      .map((s): [number, number] => [s.a, s.b]);
    const shape = junctionShape(legsOf(view, node));
    if (shape !== "ok")
      out.push({
        kind: shape === "bend" ? "junctionOnBend" : "tooManyBranches",
        tile: node,
        steps: mine,
      });
    for (const n of view.neighbors(node)) {
      const d = nearJunctionOnLeg(view, stationTiles, node, n, JUNCTION_MIN_SPACING_TILES - 1e-9);
      if (d !== undefined) {
        out.push({ kind: "junctionsTooClose", tile: node, steps: mine });
        break;
      }
    }
  }

  return out;
}

export interface ExistingLayoutIssue {
  kind: LayoutViolationKind;
  tile: number;
}

/** Every rule the existing graph already breaks (old saves) — drives the warning markers on the map. */
export function findExistingLayoutIssues(
  graph: TrackGraph,
  mapWidth: number,
  stationTiles: ReadonlySet<number>,
): ExistingLayoutIssue[] {
  const issues: ExistingLayoutIssue[] = [];
  const view = new View(graph, mapWidth, []);
  for (const node of graph.allNodes()) {
    if (!isJunction(view, stationTiles, node)) continue;
    const shape = junctionShape(legsOf(view, node));
    if (shape !== "ok")
      issues.push({ kind: shape === "bend" ? "junctionOnBend" : "tooManyBranches", tile: node });
    for (const n of view.neighbors(node)) {
      const other = nearJunctionOnLeg(
        view,
        stationTiles,
        node,
        n,
        JUNCTION_MIN_SPACING_TILES - 1e-9,
      );
      if (other !== undefined) {
        issues.push({ kind: "junctionsTooClose", tile: node });
        break;
      }
    }
  }
  for (const e of graph.allEdges() as TrackEdge[]) {
    if (e.bridge || e.direction % 2 === 0) continue;
    const ax = e.a % mapWidth;
    const ay = Math.floor(e.a / mapWidth);
    if (e.b % mapWidth !== ax + 1) continue;
    if (graph.hasEdge(ay * mapWidth + ax + 1, (ay + 1) * mapWidth + ax))
      issues.push({ kind: "midTileCrossing", tile: ay * mapWidth + ax });
  }
  return issues;
}

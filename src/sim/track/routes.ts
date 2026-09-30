/**
 * Explicit routes through track nodes (PLAN Phase 29 A). A route is a pair of legs (neighbour tiles) of one node
 * that a train may run between. Geometry only decides which routes a *build* creates; afterwards they are stored
 * and a later build into the same node only ever adds routes. A node that has no stored routes (an old save, raw
 * `addEdge` in tests) is "derived" with the pre-Phase-29 rules: any two legs within 45°, except that a crossing
 * node (two straight pairs) connects only its straight pairs.
 *
 * Result: a node can be a turnout, a diamond, a diamond with one slip, a double slip, a Y ...
 */
import { directionSteps, type TrackGraph } from "./graph";
import { legsConnect, legsFormCrossing } from "./turn";

export type Route = readonly [number, number];

export function routeKey(a: number, b: number): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/** Outward DIRS8 direction from `node` along its edge to neighbour `n`. */
export function legDirection(graph: TrackGraph, node: number, n: number): number {
  const e = graph.getEdge(node, n);
  if (!e) return -1;
  return e.a === node ? e.direction : (e.direction + 4) % 8;
}

function pairsOf(legs: readonly number[]): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let i = 0; i < legs.length; i++)
    for (let j = i + 1; j < legs.length; j++) out.push([legs[i] as number, legs[j] as number]);
  return out;
}

/** Routes the pre-Phase-29 geometry rules give `node`. */
export function derivedRoutes(graph: TrackGraph, node: number): Route[] {
  const legs = graph.neighborsOf(node);
  const dirs = legs.map((n) => legDirection(graph, node, n));
  const crossing = legs.length === 4 && legsFormCrossing(dirs);
  const out: Route[] = [];
  for (let i = 0; i < legs.length; i++)
    for (let j = i + 1; j < legs.length; j++) {
      const di = dirs[i] as number;
      const dj = dirs[j] as number;
      if (!legsConnect(di, dj)) continue;
      if (crossing && directionSteps(di, dj) !== 4) continue;
      out.push([legs[i] as number, legs[j] as number]);
    }
  return out;
}

/** The routes through `node` (explicit when stored, else derived). */
export function routesAt(graph: TrackGraph, node: number): Route[] {
  const set = graph.explicitRoutes(node);
  if (!set) return derivedRoutes(graph, node);
  return Array.from(set, (k) => {
    const [p, q] = k.split("|") as [string, string];
    return [Number(p), Number(q)] as Route;
  });
}

/** True if a train may run between legs `a` and `b` of `node`. */
export function hasRoute(graph: TrackGraph, node: number, a: number, b: number): boolean {
  const set = graph.explicitRoutes(node);
  if (set) return set.has(routeKey(a, b));
  const da = legDirection(graph, node, a);
  const db = legDirection(graph, node, b);
  if (da < 0 || db < 0 || !legsConnect(da, db)) return false;
  if (directionSteps(da, db) === 4) return true;
  const legs = graph.neighborsOf(node);
  return !(legs.length === 4 && legsFormCrossing(legs.map((n) => legDirection(graph, node, n))));
}

/** Stores `node`'s derived routes as explicit ones (no-op when already explicit). */
export function materializeRoutes(graph: TrackGraph, node: number): void {
  if (graph.explicitRoutes(node)) return;
  graph.setExplicitRoutes(
    node,
    new Set(derivedRoutes(graph, node).map(([a, b]) => routeKey(a, b))),
  );
}

/** Makes every junction (degree ≥ 3) explicit — done when a save loads so later edits keep its routes. */
export function materializeAllJunctions(graph: TrackGraph): void {
  for (const node of graph.allNodes())
    if (graph.neighborsOf(node).length >= 3) materializeRoutes(graph, node);
}

export function addRoute(graph: TrackGraph, node: number, a: number, b: number): boolean {
  const da = legDirection(graph, node, a);
  const db = legDirection(graph, node, b);
  if (da < 0 || db < 0 || a === b || !legsConnect(da, db)) return false;
  materializeRoutes(graph, node);
  graph.explicitRoutes(node)?.add(routeKey(a, b));
  return true;
}

export function removeRoute(graph: TrackGraph, node: number, a: number, b: number): void {
  materializeRoutes(graph, node);
  graph.explicitRoutes(node)?.delete(routeKey(a, b));
}

/** Leg sets of `nodes` before a build adds edges (input to `registerBuildRoutes`). The nodes' existing routes are
 * made explicit here, *before* the new legs can change what geometry would derive. */
export function snapshotLegs(graph: TrackGraph, nodes: Iterable<number>): Map<number, Set<number>> {
  const out = new Map<number, Set<number>>();
  for (const node of nodes) {
    if (graph.neighborsOf(node).length >= 2) materializeRoutes(graph, node);
    out.set(node, new Set(graph.neighborsOf(node)));
  }
  return out;
}

/**
 * After a build added its edges: give every node a new leg arrived at routes for it. A new leg connects to each
 * other leg within 45°; if the node is now a crossing (two straight pairs) the new legs get only the straight
 * route, so a line joining later never turns an existing turnout into a slip or drops it. Routes the drag itself
 * passes through (`path`) are added too. Existing routes are never removed.
 */
export function registerBuildRoutes(
  graph: TrackGraph,
  before: ReadonlyMap<number, ReadonlySet<number>>,
  path: readonly number[],
): void {
  for (const [node, old] of before) {
    const legs = graph.neighborsOf(node);
    const fresh = legs.filter((n) => !old.has(n));
    if (fresh.length === 0 && legs.length < 2) continue;
    materializeRoutes(graph, node);
    const set = graph.explicitRoutes(node) as Set<string>;
    const dirs = legs.map((n) => legDirection(graph, node, n));
    const crossing = legs.length === 4 && legsFormCrossing(dirs);
    for (const [a, b] of pairsOf(legs)) {
      if (!fresh.includes(a) && !fresh.includes(b)) continue;
      const da = legDirection(graph, node, a);
      const db = legDirection(graph, node, b);
      if (!legsConnect(da, db)) continue;
      if (crossing && directionSteps(da, db) !== 4) continue;
      set.add(routeKey(a, b));
    }
  }
  for (let i = 1; i + 1 < path.length; i++) {
    const node = path[i] as number;
    if (!before.has(node)) continue;
    const a = path[i - 1] as number;
    const b = path[i + 1] as number;
    if (graph.hasEdge(node, a) && graph.hasEdge(node, b)) addRoute(graph, node, a, b);
  }
}

/**
 * Track graph (SPEC §5.1): nodes are tiles that carry any track, edges connect two tile centers
 * (adjacent for plain track, or the two land ends of a bridge). Supports efficient add/remove and
 * adjacency queries — the pathfinder and renderer both walk this per frame/search step.
 */
import { DIRS8 } from "../map/grid";
import type { TrackEdge } from "./types";

export function edgeKey(a: number, b: number): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/** Index into DIRS8 for the unit step (sx, sy) — dx/dy reduced to their sign. Throws if the two
 * tiles aren't aligned along one of the 8 compass directions (a graph invariant). */
export function directionIndex(dx: number, dy: number): number {
  const sx = Math.sign(dx);
  const sy = Math.sign(dy);
  for (let i = 0; i < DIRS8.length; i++) {
    const [ddx, ddy] = DIRS8[i] as readonly [number, number];
    if (ddx === sx && ddy === sy) return i;
  }
  throw new Error(`directionIndex: (${dx}, ${dy}) is not an 8-direction step`);
}

/** Angular distance between two DIRS8 indices, in 45° steps (0–4). */
export function directionSteps(i: number, j: number): number {
  const diff = Math.abs(i - j) % DIRS8.length;
  return Math.min(diff, DIRS8.length - diff);
}

export class TrackGraph {
  private edges = new Map<string, TrackEdge>();
  private adjacency = new Map<number, Set<number>>();
  /** Explicit routes (PLAN Phase 29 A): node -> set of `routeKey(n1, n2)` neighbour-tile pairs a train may
   * traverse. A node without an entry is "derived": see `routes.ts`. Only `routes.ts` writes these. */
  private routeSets = new Map<number, Set<string>>();

  private link(a: number, b: number): void {
    let setA = this.adjacency.get(a);
    if (!setA) {
      setA = new Set();
      this.adjacency.set(a, setA);
    }
    setA.add(b);
    let setB = this.adjacency.get(b);
    if (!setB) {
      setB = new Set();
      this.adjacency.set(b, setB);
    }
    setB.add(a);
  }

  private unlink(a: number, b: number): void {
    this.adjacency.get(a)?.delete(b);
    this.adjacency.get(b)?.delete(a);
    if (this.adjacency.get(a)?.size === 0) this.adjacency.delete(a);
    if (this.adjacency.get(b)?.size === 0) this.adjacency.delete(b);
  }

  getEdge(a: number, b: number): TrackEdge | undefined {
    return this.edges.get(edgeKey(a, b));
  }

  hasEdge(a: number, b: number): boolean {
    return this.edges.has(edgeKey(a, b));
  }

  addEdge(edge: TrackEdge): void {
    const key = edgeKey(edge.a, edge.b);
    this.edges.set(key, edge);
    this.link(edge.a, edge.b);
  }

  removeEdge(a: number, b: number): TrackEdge | undefined {
    const key = edgeKey(a, b);
    const edge = this.edges.get(key);
    if (!edge) return undefined;
    this.edges.delete(key);
    this.unlink(a, b);
    this.dropRoutesVia(a, b);
    this.dropRoutesVia(b, a);
    return edge;
  }

  private dropRoutesVia(node: number, leg: number): void {
    const set = this.routeSets.get(node);
    if (!set) return;
    for (const k of Array.from(set)) {
      const [p, q] = k.split("|") as [string, string];
      if (Number(p) === leg || Number(q) === leg) set.delete(k);
    }
    if (!this.adjacency.has(node)) this.routeSets.delete(node);
  }

  /** The explicit route set of `node` (mutable), or undefined while the node is derived. */
  explicitRoutes(node: number): Set<string> | undefined {
    return this.routeSets.get(node);
  }

  setExplicitRoutes(node: number, routes: Set<string>): void {
    this.routeSets.set(node, routes);
  }

  /** Every node with explicit routes (serialisation). */
  allExplicitRoutes(): Array<[number, string[]]> {
    return Array.from(this.routeSets, ([n, set]) => [n, Array.from(set)]);
  }

  /** Tile indices reachable from `tile` by a single edge. */
  neighborsOf(tile: number): number[] {
    const set = this.adjacency.get(tile);
    return set ? Array.from(set) : [];
  }

  /** All edges incident to `tile`. */
  edgesAt(tile: number): TrackEdge[] {
    return this.neighborsOf(tile)
      .map((n) => this.getEdge(tile, n))
      .filter((e): e is TrackEdge => e !== undefined);
  }

  hasTrack(tile: number): boolean {
    return this.adjacency.has(tile);
  }

  allEdges(): TrackEdge[] {
    return Array.from(this.edges.values());
  }

  /** All tiles that carry at least one edge. */
  allNodes(): number[] {
    return Array.from(this.adjacency.keys());
  }

  get edgeCount(): number {
    return this.edges.size;
  }
}

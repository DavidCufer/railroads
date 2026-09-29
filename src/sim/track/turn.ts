/**
 * Turn rule (SPEC §5.1): a train may pass through a node from edge A to edge B only if the
 * heading change is ≤45°. Sharper geometry (up to and including a full junction/crossing) is
 * still buildable — it just isn't traversable as a through route outside stations.
 */
import { directionIndex, directionSteps } from "./graph";
import type { TrackGraph } from "./graph";

/** True if turning from a heading of `dirIn` (arriving) to `dirOut` (leaving) is ≤45°.
 * Both are DIRS8 indices. */
export function turnAllowed(dirIn: number, dirOut: number): boolean {
  return directionSteps(dirIn, dirOut) <= 1;
}

function tileXY(tile: number, mapWidth: number): [number, number] {
  return [tile % mapWidth, Math.floor(tile / mapWidth)];
}

/** True if a train can pass straight through `node`, arriving from `prevTile` and continuing to
 * `nextTile` (does not check that either edge actually exists in the graph). */
export function canTraverse(
  prevTile: number,
  node: number,
  nextTile: number,
  mapWidth: number,
): boolean {
  const [px, py] = tileXY(prevTile, mapWidth);
  const [nx, ny] = tileXY(node, mapWidth);
  const [qx, qy] = tileXY(nextTile, mapWidth);
  const dirIn = directionIndex(nx - px, ny - py);
  const dirOut = directionIndex(qx - nx, qy - ny);
  return turnAllowed(dirIn, dirOut);
}

/** True if some edge at `tile` cannot connect to any other edge there within the 45° turn rule
 * (SPEC §5.1) — the small red marker on old sharp junctions: buildable then, refused now (PLAN Phase
 * 18 A), but existing saves may still contain them. An ordinary turnout (a branch that is sharp
 * against one leg but legal against the other) is *not* flagged. */
export function hasSharpJunction(graph: TrackGraph, tile: number): boolean {
  const legs = outwardLegs(graph, tile);
  if (legs.length < 2) return false;
  return legs.some((leg, i) => !legs.some((other, j) => i !== j && legsConnect(leg, other)));
}

/** Outward DIRS8 direction of every edge at `node` (the direction you leave `node` along it). */
export function outwardLegs(graph: TrackGraph, node: number): number[] {
  return graph.edgesAt(node).map((e) => (e.a === node ? e.direction : (e.direction + 4) % 8));
}

/** True if a train can run between two legs of one node (given as outward directions): arriving
 * along `legA` and leaving along `legB` deflects by ≤45° (SPEC §5.1). */
export function legsConnect(legA: number, legB: number): boolean {
  return turnAllowed((legA + 4) % 8, legB);
}

/** A step of a build about to happen: edge `a`-`b` (tile indices, which may span a bridge). */
export interface NewEdgeStep {
  a: number;
  b: number;
}

function stepDirection(mapWidth: number, from: number, to: number): number {
  return directionIndex(
    Math.sign((to % mapWidth) - (from % mapWidth)),
    Math.sign(Math.floor(to / mapWidth) - Math.floor(from / mapWidth)),
  );
}

/** PLAN Phase 18 A — the build-time turn rule. Every new edge must be able to connect to
 * *something* at each of its ends: at each end node it needs either no other track there at all (a
 * dead end), or at least one other leg (existing or part of the same build) it can pass to with a
 * deflection of ≤45°. Station tiles are exempt (trains reverse there). A branch that is sharp against
 * one leg but legal against another (a normal turnout / Y-junction) is fine. Returns the new steps
 * that break the rule — checked against the *existing* edges too, so a hairpin built in several
 * pieces is rejected exactly like one drawn in a single drag. */
export function findSharpSteps<T extends NewEdgeStep>(
  graph: TrackGraph,
  mapWidth: number,
  stationTiles: ReadonlySet<number>,
  steps: readonly T[],
): T[] {
  const newLegs = new Map<number, Array<{ step: T; dir: number }>>();
  const add = (node: number, step: T, dir: number): void => {
    const list = newLegs.get(node) ?? [];
    list.push({ step, dir });
    newLegs.set(node, list);
  };
  for (const step of steps) {
    add(step.a, step, stepDirection(mapWidth, step.a, step.b));
    add(step.b, step, stepDirection(mapWidth, step.b, step.a));
  }
  const bad = new Set<T>();
  for (const [node, legs] of newLegs) {
    if (stationTiles.has(node)) continue;
    const existing = outwardLegs(graph, node);
    for (const leg of legs) {
      const others = [...existing, ...legs.filter((l) => l !== leg).map((l) => l.dir)];
      if (others.length > 0 && !others.some((o) => legsConnect(leg.dir, o))) bad.add(leg.step);
    }
  }
  return steps.filter((s) => bad.has(s));
}

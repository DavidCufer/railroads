/**
 * Geometric conflict groups (PLAN Phase 27 B, SPEC §7.5 addendum). Pure function of the track graph:
 * finds everywhere two trains' bodies can physically meet, whether or not the lines share a node.
 *
 *  - **Junction nodes** (degree ≥ 3, not a station): one conflict point per node.
 *  - **Mid-tile crossings**: two diagonal edges of one 2×2 tile cell (`(x,y)-(x+1,y+1)` and
 *    `(x+1,y)-(x,y+1)`) cross halfway along both with no shared node. Every other pair of edges that
 *    do not share a node stays ≥ 1/√2 tile apart, so this is the only crossing without a node. Its
 *    conflict point id is `mapSize + cell index` (stable across recomputes, so saved claims stay valid).
 *  - **Clearance**: how far along each leg a vehicle still overlaps one on another leg, derived from
 *    the angle between the legs and whether they are double track (lane offset) — replaces the fixed
 *    0.35-tile constant of Phase 25A, which let trains overlap at 45° turnouts and on double mains.
 *
 * Bridges are ignored (a deck passes over whatever is below it).
 */
import {
  JUNCTION_CLEARANCE_MAX_TILES,
  JUNCTION_CLEARANCE_MIN_TILES,
  JUNCTION_LANE_SEP_TILES,
  JUNCTION_VEHICLE_SEP_TILES,
} from "../../data/trains";
import { directionSteps, edgeKey, type TrackGraph } from "./graph";
import type { TrackEdge } from "./types";

export interface EdgePoint {
  /** Conflict point id (a node tile index, or `mapSize + cell` for a mid-tile crossing). */
  id: number;
  /** Fraction of the edge from its lower-index end `a` to `b` (0.5 for a mid-tile crossing). */
  frac: number;
}

export interface ConflictMap {
  mapSize: number;
  /** `edgeKey` -> mid-tile crossing points on that edge (junction nodes are not listed: they are edge ends). */
  crossingsOnEdge: ReadonlyMap<string, readonly EdgePoint[]>;
  /** Crossing point id -> its two edges. */
  crossings: ReadonlyMap<number, readonly [TrackEdge, TrackEdge]>;
  /** Clearance (tiles) of every junction node and crossing point. */
  clearance: ReadonlyMap<number, number>;
}

/** Tiles from a conflict point at which vehicles on two of its legs `steps` × 45° apart no longer overlap. */
export function legClearance(steps: number, doubleLegs: number): number {
  const sep = JUNCTION_VEHICLE_SEP_TILES + JUNCTION_LANE_SEP_TILES * doubleLegs;
  const angle = (Math.min(steps, 4) * Math.PI) / 4;
  return angle < Math.PI / 2 - 1e-9 ? sep / Math.sin(angle) : sep;
}

function clamp(v: number): number {
  return Math.max(JUNCTION_CLEARANCE_MIN_TILES, Math.min(JUNCTION_CLEARANCE_MAX_TILES, v));
}

export function nodeClearance(graph: TrackGraph, node: number): number {
  const legs = graph.edgesAt(node).map((e) => ({
    dir: e.a === node ? e.direction : (e.direction + 4) % 8,
    double: e.double ? 1 : 0,
  }));
  let worst = 0;
  for (let i = 0; i < legs.length; i++)
    for (let j = i + 1; j < legs.length; j++) {
      const a = legs[i] as (typeof legs)[number];
      const b = legs[j] as (typeof legs)[number];
      worst = Math.max(worst, legClearance(directionSteps(a.dir, b.dir), a.double + b.double));
    }
  return clamp(worst);
}

export function computeConflictMap(
  graph: TrackGraph,
  stationTiles: ReadonlySet<number>,
  mapWidth: number,
  mapHeight: number,
): ConflictMap {
  const mapSize = mapWidth * mapHeight;
  const crossingsOnEdge = new Map<string, EdgePoint[]>();
  const crossings = new Map<number, readonly [TrackEdge, TrackEdge]>();
  const clearance = new Map<number, number>();

  for (const node of graph.allNodes())
    if (!stationTiles.has(node) && graph.neighborsOf(node).length >= 3)
      clearance.set(node, nodeClearance(graph, node));

  // Diagonal single-step edges running down-right ("\"): look for the "/" partner in the same cell.
  for (const e of graph.allEdges()) {
    if (e.bridge || e.direction % 2 === 0) continue;
    const ax = e.a % mapWidth;
    const ay = Math.floor(e.a / mapWidth);
    const bx = e.b % mapWidth;
    if (bx !== ax + 1) continue; // "\" has a=(x,y), b=(x+1,y+1); "/" has a=(x+1,y), b=(x,y+1)
    const other = graph.getEdge(ay * mapWidth + ax + 1, (ay + 1) * mapWidth + ax);
    if (!other || other.bridge) continue;
    const id = mapSize + ay * mapWidth + ax;
    crossings.set(id, [e, other]);
    for (const edge of [e, other]) {
      const key = edgeKey(edge.a, edge.b);
      const list = crossingsOnEdge.get(key) ?? [];
      list.push({ id, frac: 0.5 });
      crossingsOnEdge.set(key, list);
    }
    clearance.set(id, clamp(legClearance(2, (e.double ? 1 : 0) + (other.double ? 1 : 0))));
  }
  return { mapSize, crossingsOnEdge, crossings, clearance };
}

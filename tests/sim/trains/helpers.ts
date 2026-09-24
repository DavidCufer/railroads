/** Synthetic track graphs for train routing/block/movement unit tests. */
import { TrackGraph, directionIndex } from "../../../src/sim/track/graph";
import type { TrackEdge } from "../../../src/sim/track/types";
import type { BridgeType } from "../../../src/data/track";

export interface LineOptions {
  double?: boolean;
  bridge?: BridgeType | null;
  bridgeSpan?: number[];
}

/** Adds a straight edge between two tiles a fixed grid-step apart (dx, dy each -1/0/1, or a
 * multi-tile bridge jump when `bridgeSpan` is given). */
export function addEdge(
  graph: TrackGraph,
  mapWidth: number,
  aX: number,
  aY: number,
  bX: number,
  bY: number,
  options: LineOptions = {},
): TrackEdge {
  const a = aY * mapWidth + aX;
  const b = bY * mapWidth + bX;
  const direction = directionIndex(Math.sign(bX - aX), Math.sign(bY - aY));
  const edge: TrackEdge = {
    a: Math.min(a, b),
    b: Math.max(a, b),
    direction: a < b ? direction : (direction + 4) % 8,
    double: options.double ?? false,
    electrified: false,
    bridge: options.bridge ?? null,
    bridgeSpan: options.bridgeSpan ?? [],
    cost: 1000,
  };
  graph.addEdge(edge);
  return edge;
}

/** Builds a straight chain of plain track from (x0,y) to (x1,y) (x1 >= x0), one edge per tile. */
export function addStraightLine(
  graph: TrackGraph,
  mapWidth: number,
  x0: number,
  x1: number,
  y: number,
  options: LineOptions = {},
): void {
  for (let x = x0; x < x1; x++) addEdge(graph, mapWidth, x, y, x + 1, y, options);
}

export function tile(mapWidth: number, x: number, y: number): number {
  return y * mapWidth + x;
}

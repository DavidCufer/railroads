/**
 * Block partitioning (SPEC §7.5): the track graph is split into maximal chains of edges between
 * boundary nodes — stations, junctions (degree ≥ 3), and dead ends (degree 1). Pure function of
 * the current track graph + station tiles; recomputed by src/sim/trains/index.ts whenever
 * `GameState.trackVersion` changes, never mutated in place.
 */
import { edgeKey, type TrackGraph } from "../track/graph";
import type { TrackEdge } from "../track/types";

export interface Block {
  id: number;
  edges: readonly TrackEdge[];
  /** The two boundary nodes this block runs between. For a closed loop with no boundary node at
   * all (a player-built ring with no station/junction/dead-end anywhere on it — a rare edge case),
   * these coincide at one arbitrary node on the ring, and the whole ring is a single block. */
  nodeA: number;
  nodeB: number;
  /** True only if every edge in the block is double-tracked (SPEC §7.5: "a block counts as double
   * only if every edge in it is double"). */
  double: boolean;
}

export interface BlockPartition {
  blocks: readonly Block[];
  /** `edgeKey(a, b)` -> block id. */
  edgeToBlock: ReadonlyMap<string, number>;
  /** node tile -> true if it's a block boundary (station, junction, or dead end). */
  boundaries: ReadonlySet<number>;
}

function isBoundaryNode(
  graph: TrackGraph,
  stationTiles: ReadonlySet<number>,
  tile: number,
): boolean {
  return stationTiles.has(tile) || graph.neighborsOf(tile).length !== 2;
}

/** The neighbor of `tile` along a degree-2 chain that isn't `from`. */
function otherNeighbor(graph: TrackGraph, tile: number, from: number): number {
  const neighbors = graph.neighborsOf(tile);
  return (neighbors[0] === from ? neighbors[1] : neighbors[0]) as number;
}

export function computeBlocks(
  graph: TrackGraph,
  stationTiles: ReadonlySet<number>,
): BlockPartition {
  const visited = new Set<string>();
  const blocks: Block[] = [];
  const edgeToBlock = new Map<string, number>();
  const boundaries = new Set<number>();
  for (const tile of graph.allNodes()) {
    if (isBoundaryNode(graph, stationTiles, tile)) boundaries.add(tile);
  }

  for (const startEdge of graph.allEdges()) {
    const startKey = edgeKey(startEdge.a, startEdge.b);
    if (visited.has(startKey)) continue;
    visited.add(startKey);

    // Extend forward from `b`, then backward from `a`, stopping at a boundary node or a closed
    // loop (the next edge is already part of this same walk).
    const forward: TrackEdge[] = [];
    let prev = startEdge.a;
    let cur = startEdge.b;
    while (!isBoundaryNode(graph, stationTiles, cur)) {
      const next = otherNeighbor(graph, cur, prev);
      const edge = graph.getEdge(cur, next);
      if (!edge) break;
      const key = edgeKey(edge.a, edge.b);
      if (visited.has(key)) break; // closed loop with no boundary anywhere
      visited.add(key);
      forward.push(edge);
      prev = cur;
      cur = next;
    }
    const nodeB = cur;

    const backward: TrackEdge[] = [];
    prev = startEdge.b;
    cur = startEdge.a;
    while (!isBoundaryNode(graph, stationTiles, cur)) {
      const next = otherNeighbor(graph, cur, prev);
      const edge = graph.getEdge(cur, next);
      if (!edge) break;
      const key = edgeKey(edge.a, edge.b);
      if (visited.has(key)) break;
      visited.add(key);
      backward.push(edge);
      prev = cur;
      cur = next;
    }
    const nodeA = cur;

    const edges = [...backward.reverse(), startEdge, ...forward];
    const id = blocks.length;
    const double = edges.every((e) => e.double);
    blocks.push({ id, edges, nodeA, nodeB, double });
    for (const e of edges) edgeToBlock.set(edgeKey(e.a, e.b), id);
  }

  return { blocks, edgeToBlock, boundaries };
}

export function blockIdForEdge(
  partition: BlockPartition,
  a: number,
  b: number,
): number | undefined {
  return partition.edgeToBlock.get(edgeKey(a, b));
}

/** The boundary node at the far end of `block` from `fromNode`. */
export function blockOtherEnd(block: Block, fromNode: number): number {
  return block.nodeA === fromNode ? block.nodeB : block.nodeA;
}

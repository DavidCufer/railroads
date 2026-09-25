/**
 * Train routing (SPEC §7.3): A* over the track graph whose search state is (node,
 * incomingDirection) so the 45° turn rule is enforced during the search itself — a node can be
 * entered from different directions with different continuations allowed, so the plain
 * single-node visited-set used by the Track-mode build pathfinder (track/pathfind.ts) isn't
 * enough here. Also enforces wooden-bridge weight limits and electrification, and allows a 180°
 * reversal only at a station node (SPEC: "Reversing is only possible at stations").
 */
import type { WeightClass } from "../../data/trains";
import { WOODEN_BRIDGE_MAX_WEIGHT_CLASS } from "../../data/track";
import { directionSteps, type TrackGraph } from "../track/graph";
import { turnAllowed } from "../track/turn";
import { directionBetween, edgeLengthTiles, octileTileDistance } from "./geometry";

const WEIGHT_ORDER: readonly WeightClass[] = ["light", "medium", "heavy"];

function bridgeAllowsWeight(bridge: string | null, weightClass: WeightClass): boolean {
  if (bridge !== "wood") return true;
  return (
    WEIGHT_ORDER.indexOf(weightClass) <=
    WEIGHT_ORDER.indexOf(WOODEN_BRIDGE_MAX_WEIGHT_CLASS as WeightClass)
  );
}

export interface RouteOptions {
  weightClass: WeightClass;
  /** Electric locomotives require every edge of the route to be electrified. */
  electric: boolean;
  /** DIRS8 index of the direction the train is already moving in, or -1 if unconstrained (SPEC:
   * "start of a route from a station may leave in either direction"). */
  incomingDirection: number;
  stationTiles: ReadonlySet<number>;
  /** Extra cost added to any edge inside a penalized block — the deadlock-reroute mechanism
   * (SPEC §7.5: "tries an alternate route with the blocking block penalized"). */
  blockPenalties?: ReadonlyMap<number, number>;
  edgeToBlock?: ReadonlyMap<string, number>;
  /** Safety cap on explored (node, direction) states. */
  maxExpansions?: number;
}

interface HeapItem {
  f: number;
  tile: number;
  dir: number;
}

class MinHeap {
  private items: HeapItem[] = [];
  get size(): number {
    return this.items.length;
  }
  push(item: HeapItem): void {
    this.items.push(item);
    let i = this.items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if ((this.items[parent] as HeapItem).f <= (this.items[i] as HeapItem).f) break;
      [this.items[parent], this.items[i]] = [
        this.items[i] as HeapItem,
        this.items[parent] as HeapItem,
      ];
      i = parent;
    }
  }
  pop(): HeapItem | undefined {
    const top = this.items[0];
    const last = this.items.pop();
    if (this.items.length > 0 && last !== undefined) {
      this.items[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = i * 2 + 2;
        let smallest = i;
        if (
          l < this.items.length &&
          (this.items[l] as HeapItem).f < (this.items[smallest] as HeapItem).f
        )
          smallest = l;
        if (
          r < this.items.length &&
          (this.items[r] as HeapItem).f < (this.items[smallest] as HeapItem).f
        )
          smallest = r;
        if (smallest === i) break;
        [this.items[i], this.items[smallest]] = [
          this.items[smallest] as HeapItem,
          this.items[i] as HeapItem,
        ];
        i = smallest;
      }
    }
    return top;
  }
}

function stateKey(tile: number, dir: number): string {
  return `${tile}|${dir}`;
}

/**
 * Finds the shortest (tile-distance) route from `start` to `goal`, both tile indices, respecting
 * the 45° turn rule (with a reversal exception at station tiles), wooden-bridge weight limits and
 * electrification. Returns the full node list (including both ends) or null if unreachable.
 */
export function findTrainRoute(
  mapWidth: number,
  graph: TrackGraph,
  start: number,
  goal: number,
  options: RouteOptions,
): number[] | null {
  if (start === goal) return [start];

  const gScore = new Map<string, number>();
  const cameFrom = new Map<string, { tile: number; dir: number } | null>();
  const closed = new Set<string>();
  const heap = new MinHeap();

  const startKey = stateKey(start, options.incomingDirection);
  gScore.set(startKey, 0);
  cameFrom.set(startKey, null);
  heap.push({
    f: octileTileDistance(start, goal, mapWidth),
    tile: start,
    dir: options.incomingDirection,
  });

  const maxExpansions = options.maxExpansions ?? 20_000;
  let expansions = 0;
  let goalKey: string | null = null;

  while (heap.size > 0) {
    const current = heap.pop();
    if (!current) break;
    const key = stateKey(current.tile, current.dir);
    if (closed.has(key)) continue;
    closed.add(key);
    if (expansions++ > maxExpansions) break;
    if (current.tile === goal) {
      goalKey = key;
      break;
    }

    const currentG = gScore.get(key) ?? Infinity;
    for (const neighborTile of graph.neighborsOf(current.tile)) {
      const edge = graph.getEdge(current.tile, neighborTile);
      if (!edge) continue;
      if (!bridgeAllowsWeight(edge.bridge, options.weightClass)) continue;
      if (options.electric && !edge.electrified) continue;

      const dirOut = directionBetween(current.tile, neighborTile, mapWidth);
      if (current.dir >= 0) {
        const isStation = options.stationTiles.has(current.tile);
        const reversal = directionSteps(current.dir, dirOut) === 4;
        if (!turnAllowed(current.dir, dirOut) && !(isStation && reversal)) continue;
      }

      const blockId = options.edgeToBlock?.get(
        edge.a < edge.b ? `${edge.a}|${edge.b}` : `${edge.b}|${edge.a}`,
      );
      const penalty = blockId !== undefined ? (options.blockPenalties?.get(blockId) ?? 0) : 0;
      const tentativeG = currentG + edgeLengthTiles(edge) + penalty;

      const nKey = stateKey(neighborTile, dirOut);
      if (tentativeG < (gScore.get(nKey) ?? Infinity)) {
        gScore.set(nKey, tentativeG);
        cameFrom.set(nKey, { tile: current.tile, dir: current.dir });
        heap.push({
          f: tentativeG + octileTileDistance(neighborTile, goal, mapWidth),
          tile: neighborTile,
          dir: dirOut,
        });
      }
    }
  }

  if (!goalKey) return null;

  const path: number[] = [];
  let cursor: string | null = goalKey;
  while (cursor) {
    const entry = cameFrom.get(cursor);
    const tileStr = cursor.split("|")[0] as string;
    path.push(Number(tileStr));
    if (!entry) break;
    cursor = stateKey(entry.tile, entry.dir);
  }
  path.reverse();
  return path;
}

/** True if `options.electric`'s route fails *only* because of missing electrification — i.e. a
 * route exists once that one constraint is dropped (SPEC §7.3's "clear reason in the UI: 'Route
 * not electrified'", PLAN Phase 8). Used by the train panel to distinguish that from a genuinely
 * disconnected network, which shows the generic "No route" message instead. */
export function isElectrificationOnlyBlocker(
  mapWidth: number,
  graph: TrackGraph,
  start: number,
  goal: number,
  options: RouteOptions,
): boolean {
  if (!options.electric) return false;
  if (findTrainRoute(mapWidth, graph, start, goal, options) !== null) return false;
  return findTrainRoute(mapWidth, graph, start, goal, { ...options, electric: false }) !== null;
}

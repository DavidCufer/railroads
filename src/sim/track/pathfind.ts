/**
 * A* pathfinder for the Track/Double drag-to-build UX (SPEC §5.2): "prefer straight lines and
 * cheaper terrain, with a penalty for direction changes" so dragging a finger across the map
 * traces a path that feels intentional rather than jagged. Also used by Double mode, restricted
 * to existing single track.
 *
 * Nodes only ever land on buildable land tiles; a step to a non-adjacent tile represents a bridge
 * jumping the water/river tiles in between (see track/cost.ts `spanTilesBetween`).
 */
import { DIRS8, inBounds, tileIndex } from "../map/grid";
import { terrainAt } from "../map/terrain";
import type { GameMap } from "../map/types";
import { directionIndex, directionSteps, type TrackGraph } from "./graph";
import { bridgeCost, cheapestBridgeType, isLand, normalEdgeCost, type CostContext } from "./cost";

/** Extra cost per 45° of direction change, to bias the search toward straight runs. Comparable in
 * magnitude to the cheapest per-tile track cost so it meaningfully discourages zigzagging without
 * making a genuinely-needed turn prohibitively expensive. */
const TURN_PENALTY_PER_STEP = 2_500;

/** Max tiles of water/river a single bridge jump is allowed to scan past while searching — the
 * largest span any bridge type can cover (steel, SPEC §5.3). */
const MAX_BRIDGE_SEARCH_SPAN = 8;

/** Safety cap on explored states so a drag toward an unreachable/far corner can't hang a frame. */
const MAX_EXPANSIONS = 20_000;

export interface PathfindOptions {
  /** Restrict travel to existing single (non-double) edges of this graph — Double mode. */
  existingTrackOnly?: TrackGraph;
  /** Extra tiles of margin around the start/goal bounding box the search may explore. */
  searchPadding?: number;
}

interface Neighbor {
  tile: number;
  cost: number;
}

function candidateNeighbors(
  map: GameMap,
  tile: number,
  ctx: CostContext,
  options: PathfindOptions,
): Neighbor[] {
  if (options.existingTrackOnly) {
    const graph = options.existingTrackOnly;
    const out: Neighbor[] = [];
    for (const n of graph.neighborsOf(tile)) {
      const edge = graph.getEdge(tile, n);
      if (edge && !edge.double) out.push({ tile: n, cost: 0 });
    }
    return out;
  }

  const x = tile % map.width;
  const y = Math.floor(tile / map.width);
  const out: Neighbor[] = [];

  for (const [dx, dy] of DIRS8) {
    let nx = x + dx;
    let ny = y + dy;
    if (!inBounds(map, nx, ny)) continue;

    let steps = 1;
    while (!isLand(map, tileIndex(map, nx, ny))) {
      steps++;
      if (steps > MAX_BRIDGE_SEARCH_SPAN + 1) {
        steps = -1;
        break;
      }
      nx = x + dx * steps;
      ny = y + dy * steps;
      if (!inBounds(map, nx, ny)) {
        steps = -1;
        break;
      }
    }
    if (steps < 0) continue;

    const landing = tileIndex(map, nx, ny);
    if (steps === 1) {
      out.push({ tile: landing, cost: normalEdgeCost(map, tile, landing, ctx) });
      continue;
    }

    // Bridge jump: everything strictly between `tile` and `landing` is the span it crosses.
    const spanTiles: number[] = [];
    for (let s = 1; s < steps; s++) {
      spanTiles.push(tileIndex(map, x + dx * s, y + dy * s));
    }
    const kind = spanTiles.every(
      (t) => terrainAt(map, t % map.width, Math.floor(t / map.width)) === "river",
    )
      ? ("river" as const)
      : ("water" as const);
    const type = cheapestBridgeType(kind, spanTiles.length, ctx.year);
    if (!type) continue;
    out.push({ tile: landing, cost: bridgeCost(type, kind, spanTiles.length, ctx) });
  }
  return out;
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

function octileHeuristic(map: GameMap, a: number, b: number): number {
  const ax = a % map.width;
  const ay = Math.floor(a / map.width);
  const bx = b % map.width;
  const by = Math.floor(b / map.width);
  const dx = Math.abs(ax - bx);
  const dy = Math.abs(ay - by);
  const straight = Math.abs(dx - dy);
  const diag = Math.min(dx, dy);
  return (straight + diag * 1.41) * 3_000; // ~cheapest plausible per-tile cost, keeps it near-admissible
}

function stateKey(tile: number, dir: number): string {
  return `${tile}|${dir}`;
}

/**
 * Finds a build path from `start` to `goal` (both tile indices). Returns the node list (land
 * tiles only — bridges skip their spanned tiles) or null if no path was found within the search
 * bound/expansion cap.
 */
export function findBuildPath(
  map: GameMap,
  start: number,
  goal: number,
  year: number,
  options: PathfindOptions = {},
): number[] | null {
  if (start === goal) return [start];

  const padding = options.searchPadding ?? 24;
  const sx = start % map.width;
  const sy = Math.floor(start / map.width);
  const gx = goal % map.width;
  const gy = Math.floor(goal / map.width);
  const minX = Math.max(0, Math.min(sx, gx) - padding);
  const maxX = Math.min(map.width - 1, Math.max(sx, gx) + padding);
  const minY = Math.max(0, Math.min(sy, gy) - padding);
  const maxY = Math.min(map.height - 1, Math.max(sy, gy) + padding);

  const ctx: CostContext = { year, buildCostMult: 1 };
  const gScore = new Map<string, number>();
  const cameFrom = new Map<string, { tile: number; dir: number } | null>();

  const heap = new MinHeap();
  gScore.set(stateKey(start, -1), 0);
  cameFrom.set(stateKey(start, -1), null);
  heap.push({ f: octileHeuristic(map, start, goal), tile: start, dir: -1 });

  let expansions = 0;
  let goalKey: string | null = null;
  const closed = new Set<string>();

  while (heap.size > 0) {
    const current = heap.pop();
    if (!current) break;
    const key = stateKey(current.tile, current.dir);
    if (closed.has(key)) continue; // stale heap entry, already expanded with a better g
    closed.add(key);
    if (expansions++ > MAX_EXPANSIONS) break;
    if (current.tile === goal) {
      goalKey = key;
      break;
    }

    const x = current.tile % map.width;
    const y = Math.floor(current.tile / map.width);
    const currentG = gScore.get(key) ?? Infinity;
    for (const neighbor of candidateNeighbors(map, current.tile, ctx, options)) {
      const nx = neighbor.tile % map.width;
      const ny = Math.floor(neighbor.tile / map.width);
      if (nx < minX || nx > maxX || ny < minY || ny > maxY) continue;
      const dir = directionIndex(Math.sign(nx - x), Math.sign(ny - y));
      const turnPenalty =
        current.dir < 0 ? 0 : directionSteps(current.dir, dir) * TURN_PENALTY_PER_STEP;
      const tentativeG = currentG + neighbor.cost + turnPenalty;
      const nKey = stateKey(neighbor.tile, dir);
      if (tentativeG < (gScore.get(nKey) ?? Infinity)) {
        gScore.set(nKey, tentativeG);
        cameFrom.set(nKey, { tile: current.tile, dir: current.dir });
        heap.push({
          f: tentativeG + octileHeuristic(map, neighbor.tile, goal),
          tile: neighbor.tile,
          dir,
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

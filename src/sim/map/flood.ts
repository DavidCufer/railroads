/**
 * Priority-flood depression filling (Barnes, Lehman & Mulla 2014, "Priority-Flood + epsilon"),
 * run on the continuous pre-quantization elevation field. Guarantees every land tile has a
 * strictly-downhill (non-random) path to water, which river carving (./rivers.ts) then just
 * follows via the recorded `parent` pointers — no local minima, no random walks.
 */
import { FLOOD_EPSILON } from "../../data/mapGen";
import { DIRS8, inBounds, tileIndex } from "./grid";
import { terrainId } from "./terrain";
import type { GameMap } from "./types";

const WATER_ID = terrainId("water");

/** Binary min-heap of (tile index, filled elevation) pairs. */
class MinHeap {
  private idx: number[] = [];
  private key: number[] = [];

  get size(): number {
    return this.idx.length;
  }

  push(index: number, elevation: number): void {
    this.idx.push(index);
    this.key.push(elevation);
    let i = this.idx.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if ((this.key[parent] as number) <= (this.key[i] as number)) break;
      this.swap(i, parent);
      i = parent;
    }
  }

  pop(): number | undefined {
    if (this.idx.length === 0) return undefined;
    const top = this.idx[0] as number;
    const lastIdx = this.idx.pop() as number;
    const lastKey = this.key.pop() as number;
    if (this.idx.length > 0) {
      this.idx[0] = lastIdx;
      this.key[0] = lastKey;
      let i = 0;
      const n = this.idx.length;
      for (;;) {
        const l = i * 2 + 1;
        const r = i * 2 + 2;
        let smallest = i;
        if (l < n && (this.key[l] as number) < (this.key[smallest] as number)) smallest = l;
        if (r < n && (this.key[r] as number) < (this.key[smallest] as number)) smallest = r;
        if (smallest === i) break;
        this.swap(i, smallest);
        i = smallest;
      }
    }
    return top;
  }

  private swap(a: number, b: number): void {
    const ti = this.idx[a] as number;
    this.idx[a] = this.idx[b] as number;
    this.idx[b] = ti;
    const tk = this.key[a] as number;
    this.key[a] = this.key[b] as number;
    this.key[b] = tk;
  }
}

export interface FloodFillResult {
  /** Filled elevation: >= elevationRaw everywhere, strictly non-decreasing away from water. */
  filled: Float32Array;
  /** Index of the neighbor this tile was reached from while flooding out from water; -1 for water tiles. */
  parent: Int32Array;
}

/**
 * Floods out from every water tile (the seeds), raising each newly-reached land tile's filled
 * elevation to at least `parent + epsilon`. Walking a tile's `parent` chain always moves strictly
 * downhill (in the filled field) and reaches a water tile in a bounded number of steps.
 */
export function priorityFloodFill(map: GameMap, epsilon: number = FLOOD_EPSILON): FloodFillResult {
  const n = map.width * map.height;
  const filled = new Float32Array(n);
  const parent = new Int32Array(n).fill(-1);
  const sealed = new Uint8Array(n);
  const heap = new MinHeap();

  for (let i = 0; i < n; i++) {
    if ((map.terrain[i] as number) === WATER_ID) {
      filled[i] = map.elevationRaw[i] as number;
      sealed[i] = 1;
      heap.push(i, filled[i] as number);
    }
  }

  for (;;) {
    const index = heap.pop();
    if (index === undefined) break;
    const x = index % map.width;
    const y = Math.floor(index / map.width);
    const currentFilled = filled[index] as number;

    for (const [dx, dy] of DIRS8) {
      const nx = x + dx;
      const ny = y + dy;
      if (!inBounds(map, nx, ny)) continue;
      const nIdx = tileIndex(map, nx, ny);
      if (sealed[nIdx] === 1) continue;
      sealed[nIdx] = 1;
      const raw = map.elevationRaw[nIdx] as number;
      const nFilled = Math.max(raw, currentFilled + epsilon);
      filled[nIdx] = nFilled;
      parent[nIdx] = index;
      heap.push(nIdx, nFilled);
    }
  }

  return { filled, parent };
}

/**
 * A chunk cache bounded to at most `maxEntries`, evicting the least-recently-used entry once full
 * (SPEC §10.4 / PLAN Phase 12 memory-bounds requirement). `TerrainRenderer`/`TrackRenderer` bake
 * one offscreen canvas per (chunk, zoom bucket) the camera has ever visited; without a cap, a long
 * session that pans across a Large map at every zoom level keeps every one of them resident for
 * the rest of the game (nothing else ever reclaims them). `Map` iterates in insertion order, so
 * re-inserting on every touch (`get` hit or `set`) keeps the least-recently-used entry at the
 * front, cheap to find and drop.
 *
 * Eviction only ever discards a chunk the caller's own cache-miss path already knows how to
 * rebuild (both renderers redraw on a `get` miss) — it costs a bounded amount of extra redraw
 * work, never a correctness issue or a dropped tile.
 */
export class ChunkCache<T> {
  private map = new Map<string, T>();

  constructor(private readonly maxEntries: number) {}

  get(key: string): T | undefined {
    const value = this.map.get(key);
    if (value !== undefined) {
      this.map.delete(key);
      this.map.set(key, value);
    }
    return value;
  }

  set(key: string, value: T): void {
    this.map.delete(key);
    this.map.set(key, value);
    while (this.map.size > this.maxEntries) {
      const oldestKey: string | undefined = this.map.keys().next().value;
      if (oldestKey === undefined) break;
      this.map.delete(oldestKey);
    }
  }

  delete(key: string): void {
    this.map.delete(key);
  }

  clear(): void {
    this.map.clear();
  }

  get size(): number {
    return this.map.size;
  }
}

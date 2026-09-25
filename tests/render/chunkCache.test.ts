import { describe, expect, it } from "vitest";
import { ChunkCache } from "../../src/render/chunkCache";

describe("ChunkCache (Phase 12 memory bounds)", () => {
  it("never exceeds maxEntries, evicting the least-recently-used entry first", () => {
    const cache = new ChunkCache<string>(3);
    cache.set("a", "A");
    cache.set("b", "B");
    cache.set("c", "C");
    expect(cache.size).toBe(3);

    cache.set("d", "D"); // evicts "a" (oldest, never touched again)
    expect(cache.size).toBe(3);
    expect(cache.get("a")).toBeUndefined();
    expect(cache.get("b")).toBe("B");
    expect(cache.get("c")).toBe("C");
    expect(cache.get("d")).toBe("D");
  });

  it("a get() touch protects an entry from being the next eviction", () => {
    const cache = new ChunkCache<string>(2);
    cache.set("a", "A");
    cache.set("b", "B");
    cache.get("a"); // "a" is now more-recently-used than "b"
    cache.set("c", "C"); // should evict "b", not "a"
    expect(cache.get("a")).toBe("A");
    expect(cache.get("b")).toBeUndefined();
    expect(cache.get("c")).toBe("C");
  });

  it("re-set of an existing key counts as a touch, not a duplicate entry", () => {
    const cache = new ChunkCache<number>(2);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("a", 99); // touches "a" again
    cache.set("c", 3); // should evict "b"
    expect(cache.size).toBe(2);
    expect(cache.get("a")).toBe(99);
    expect(cache.get("b")).toBeUndefined();
    expect(cache.get("c")).toBe(3);
  });

  it("delete() and clear() work as expected and never push size negative", () => {
    const cache = new ChunkCache<number>(5);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.delete("a");
    expect(cache.size).toBe(1);
    cache.delete("not-there");
    expect(cache.size).toBe(1);
    cache.clear();
    expect(cache.size).toBe(0);
  });

  it("holds arbitrarily many inserts without ever exceeding the cap", () => {
    const cache = new ChunkCache<number>(10);
    for (let i = 0; i < 1000; i++) {
      cache.set(`k${i}`, i);
      expect(cache.size).toBeLessThanOrEqual(10);
    }
    expect(cache.size).toBe(10);
    // Only the most recent 10 keys survive.
    for (let i = 990; i < 1000; i++) expect(cache.get(`k${i}`)).toBe(i);
    expect(cache.get("k0")).toBeUndefined();
  });
});

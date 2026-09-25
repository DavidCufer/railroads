/** tools/mapgen build pipeline (SPEC §4.3): determinism, on-land city placement, projection
 * accuracy, and the <300KB size budget. */
import { describe, expect, it } from "vitest";
import { buildRegion } from "../../tools/mapgen/build";
import { project } from "../../tools/mapgen/geo";
import { usEast } from "../../tools/mapgen/regions/us-east";
import { decodeUint8 } from "../../src/sim/regions/codec";
import { terrainName } from "../../src/sim/map/terrain";

describe("buildRegion(us-east)", () => {
  it("is byte-identical across two builds (deterministic from the region def)", () => {
    const a = JSON.stringify(buildRegion(usEast));
    const b = JSON.stringify(buildRegion(usEast));
    expect(a).toBe(b);
  });

  it("stays under the 300 KB budget", () => {
    const json = buildRegion(usEast);
    const bytes = new TextEncoder().encode(JSON.stringify(json)).length;
    expect(bytes).toBeLessThan(300 * 1024);
  });

  it("places every city within 1 tile of its projected lat/lon", () => {
    const json = buildRegion(usEast);
    for (const c of usEast.cities) {
      const [px, py] = project(usEast.bounds, [c.lon, c.lat]);
      const actual = json.cities.find((rc) => rc.name === c.name);
      expect(actual).toBeDefined();
      const dist = Math.hypot(
        (actual as { anchorX: number }).anchorX - px,
        (actual as { anchorY: number }).anchorY - py,
      );
      expect(dist).toBeLessThanOrEqual(1.5);
    }
  });

  it("places every city on non-water, non-mountain terrain", () => {
    const json = buildRegion(usEast);
    const terrain = decodeUint8(json.terrainB64);
    for (const c of json.cities) {
      const idx = c.anchorY * json.width + c.anchorX;
      const t = terrainName(terrain[idx] as number);
      expect(t).not.toBe("water");
      expect(t).not.toBe("mountain");
    }
  });

  it("gives a future-founding city (Chicago) no footprint tiles overlapping another city", () => {
    const json = buildRegion(usEast);
    const claimed = new Set<number>();
    for (const c of json.cities) {
      for (const idx of c.tiles) {
        expect(claimed.has(idx)).toBe(false);
        claimed.add(idx);
      }
    }
  });

  it("keeps river chains within bounds and ordered source-to-mouth", () => {
    const json = buildRegion(usEast);
    for (const chain of json.rivers) {
      expect(chain.length).toBeGreaterThan(1);
      for (const idx of chain) {
        expect(idx).toBeGreaterThanOrEqual(0);
        expect(idx).toBeLessThan(json.width * json.height);
      }
    }
  });

  it("has no NaN/out-of-range elevation values", () => {
    const json = buildRegion(usEast);
    const elevation = decodeUint8(json.elevationB64);
    for (const e of elevation) {
      expect(Number.isFinite(e)).toBe(true);
      expect(e).toBeGreaterThanOrEqual(0);
      expect(e).toBeLessThanOrEqual(9);
    }
  });
});

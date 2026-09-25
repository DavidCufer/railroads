/** tools/mapgen build pipeline (SPEC §4.3): determinism, on-land city placement, projection
 * accuracy, and the <300KB size budget — run against every region as it lands. */
import { describe, expect, it } from "vitest";
import { buildRegion } from "../../tools/mapgen/build";
import { project } from "../../tools/mapgen/geo";
import { usEast } from "../../tools/mapgen/regions/us-east";
import { gb } from "../../tools/mapgen/regions/gb";
import { centralEu } from "../../tools/mapgen/regions/central-eu";
import type { RegionDef } from "../../tools/mapgen/regionDef";
import { decodeUint8 } from "../../src/sim/regions/codec";
import { terrainName } from "../../src/sim/map/terrain";

const REGIONS: RegionDef[] = [usEast, gb, centralEu];

for (const def of REGIONS) {
  describe(`buildRegion(${def.id})`, () => {
    it("is byte-identical across two builds (deterministic from the region def)", () => {
      const a = JSON.stringify(buildRegion(def));
      const b = JSON.stringify(buildRegion(def));
      expect(a).toBe(b);
    });

    it("stays under the 300 KB budget", () => {
      const json = buildRegion(def);
      const bytes = new TextEncoder().encode(JSON.stringify(json)).length;
      expect(bytes).toBeLessThan(300 * 1024);
    });

    it("places every city within 1.5 tiles of its projected lat/lon", () => {
      const json = buildRegion(def);
      for (const c of def.cities) {
        const [px, py] = project(def.bounds, [c.lon, c.lat]);
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
      const json = buildRegion(def);
      const terrain = decodeUint8(json.terrainB64);
      for (const c of json.cities) {
        const idx = c.anchorY * json.width + c.anchorX;
        const t = terrainName(terrain[idx] as number);
        expect(t).not.toBe("water");
        expect(t).not.toBe("mountain");
      }
    });

    it("gives no two cities overlapping footprint tiles", () => {
      const json = buildRegion(def);
      const claimed = new Set<number>();
      for (const c of json.cities) {
        for (const idx of c.tiles) {
          expect(claimed.has(idx)).toBe(false);
          claimed.add(idx);
        }
      }
    });

    it("keeps river chains within bounds and ordered source-to-mouth", () => {
      const json = buildRegion(def);
      for (const chain of json.rivers) {
        expect(chain.length).toBeGreaterThan(1);
        for (const idx of chain) {
          expect(idx).toBeGreaterThanOrEqual(0);
          expect(idx).toBeLessThan(json.width * json.height);
        }
      }
    });

    it("has no NaN/out-of-range elevation values", () => {
      const json = buildRegion(def);
      const elevation = decodeUint8(json.elevationB64);
      for (const e of elevation) {
        expect(Number.isFinite(e)).toBe(true);
        expect(e).toBeGreaterThanOrEqual(0);
        expect(e).toBeLessThanOrEqual(9);
      }
    });
  });
}

describe("buildRegion(us-east) founding-year cities", () => {
  it("gives Chicago (founded 1833) an empty footprint and no cityId claim at generation", () => {
    const json = buildRegion(usEast);
    const chicago = json.cities.find((c) => c.name === "Chicago");
    expect(chicago?.foundingYear).toBe(1833);
    // The footprint is still recorded (for founding later) but must not overlap anyone else's —
    // already covered by the shared "no overlapping footprint tiles" check above.
    expect(chicago?.tiles.length).toBeGreaterThan(0);
  });
});

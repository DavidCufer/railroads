/** PLAN Phase 27 D: the first decade is playable — the 25 km/h Grasshopper no longer loses money on a
 * 50–100 km town-to-town passenger line (it lost $6k/yr, docs/BALANCE.md), and the relief fades out by 1845/1850. */
import { describe, expect, it } from "vitest";
import { earlyFareFactor, earlyUpkeepFactor } from "../../src/data/finance";
import { measureRoute } from "./balanceRoutes";

describe("early-era balance (Phase 27 D)", () => {
  for (const km of [50, 100]) {
    it(`1830 Grasshopper, Town↔Town passengers, ${km} km: profitable`, () => {
      const runs = [1, 2, 3].map((seed) =>
        measureRoute({
          cargo: "passengers",
          km,
          year: 1830,
          loco: "grasshopper-0-4-0",
          population: 12_000,
          tier: "town",
          seed,
        }),
      );
      const mean = runs.reduce((a, r) => a + r.profit, 0) / runs.length;
      expect(mean).toBeGreaterThan(0);
    });
  }

  it("relief and fare premium ease out linearly and never touch freight or the later eras", () => {
    expect(earlyUpkeepFactor(1830)).toBeCloseTo(0.4);
    expect(earlyUpkeepFactor(1850)).toBe(1);
    expect(earlyUpkeepFactor(1900)).toBe(1);
    expect(earlyFareFactor(1830, "passengers")).toBeCloseTo(1.8);
    expect(earlyFareFactor(1830, "mail")).toBeCloseTo(1.8);
    expect(earlyFareFactor(1830, "coal")).toBe(1);
    expect(earlyFareFactor(1845, "passengers")).toBe(1);
    expect(earlyFareFactor(1848, "passengers")).toBe(1);
    expect(earlyUpkeepFactor(1842)).toBeGreaterThan(earlyUpkeepFactor(1835));
  });
});

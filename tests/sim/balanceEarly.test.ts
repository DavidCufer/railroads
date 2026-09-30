/** PLAN Phase 27 D / 28A: the first decades are playable. The 25 km/h Grasshopper breaks even on a 50–100 km
 * town-to-town passenger line with depots (Economic model v2: fares at the 1830 premium, a crew of two, cheap
 * stations and no income tax yet), and a Norris returns at least a quarter of its price a year on a 10-tile line. */
import { describe, expect, it } from "vitest";
import { fareIndex, incomeTaxRate } from "../../src/data/economy";
import { measureMean } from "./balanceRoutes";

describe("early-era balance", () => {
  for (const km of [50, 100]) {
    it(`1830 Grasshopper, Town↔Town passengers, ${km} km: at least breaks even`, () => {
      const r = measureMean({
        cargo: "passengers",
        km,
        year: 1830,
        loco: "grasshopper-0-4-0",
        population: 12_000,
        tier: "town",
      });
      expect(r.profit).toBeGreaterThanOrEqual(0);
    });
  }

  it("1840 Norris on a 10-tile (50 km) Town↔Town line returns ≥ 25 %/yr of its price", () => {
    const r = measureMean({
      cargo: "passengers",
      km: 50,
      year: 1840,
      loco: "norris-4-2-0",
      population: 12_000,
      tier: "town",
    });
    expect(r.profit / r.price).toBeGreaterThanOrEqual(0.25);
  });

  it("the fare curve is a premium early and falls in real terms; there is no income tax before the 1910s", () => {
    const real = (year: number, cargo: "passengers" | "coal"): number =>
      fareIndex(year, cargo) / (1 + (year - 1830) * 0.012);
    expect(real(1830, "passengers")).toBeGreaterThan(real(1850, "passengers"));
    expect(real(1850, "passengers")).toBeGreaterThan(real(1900, "passengers"));
    expect(real(1830, "coal")).toBeGreaterThan(real(1870, "coal"));
    expect(real(1850, "coal")).toBeGreaterThan(real(1950, "coal"));
    expect(incomeTaxRate(1909)).toBe(0);
    expect(incomeTaxRate(1915)).toBeGreaterThan(0);
    expect(incomeTaxRate(1950)).toBeGreaterThan(incomeTaxRate(1915));
  });
});

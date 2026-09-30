/** PLAN Phase 28A: electrification has to pay — an Early Electric beats the steam engine of its day. */
import { describe, expect, it } from "vitest";
import { locomotiveById } from "../../../src/data/trains";
import { locoRunningCostPerYear, wearUnitsPerTile } from "../../../src/sim/finance/costs";
import { measureMean } from "../balanceRoutes";

const atlantic = locomotiveById("atlantic-4-4-2")!;
const electric = locomotiveById("early-electric")!;

describe("electric locomotives", () => {
  it("the Early Electric is faster than the Atlantic and ~30 % cheaper to run than steam of its day", () => {
    expect(electric.maxSpeedKmh).toBeGreaterThanOrEqual(110);
    expect(electric.maxSpeedKmh).toBeGreaterThan(atlantic.maxSpeedKmh);
    const run = (l: typeof atlantic) => locoRunningCostPerYear(l, 2, 1910);
    expect(run(electric)).toBeLessThan(run(atlantic) * 0.7);
  });

  it("an electric engine marks the rail less than a steam engine of the same weight class", () => {
    const cars = Array.from({ length: 6 }, () => ({
      cargoType: "passengers" as const,
      loadedUnits: 20,
    }));
    expect(wearUnitsPerTile(electric, cars, 90)).toBeLessThan(wearUnitsPerTile(atlantic, cars, 90));
  });

  it("on an electrified 1910 rich route the Early Electric earns more a year than the Atlantic, catenary upkeep included", () => {
    const spec = {
      cargo: "passengers" as const,
      km: 100,
      year: 1910,
      population: 150_000,
      tier: "metropolis" as const,
    };
    const steam = measureMean({ ...spec, loco: "atlantic-4-4-2" });
    const wire = measureMean({ ...spec, loco: "early-electric", electrified: true });
    expect(wire.profit).toBeGreaterThan(steam.profit);
  });
});

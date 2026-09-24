import { describe, expect, it } from "vitest";
import { STATION_TYPE_DEFS } from "../../../src/data/stations";
import { stationCost, stationUpgradeCost } from "../../../src/sim/stations/cost";
import type { CostContext } from "../../../src/sim/track/cost";

describe("stationCost", () => {
  it("matches the base cost table at year 1830, mult 1", () => {
    const ctx: CostContext = { year: 1830, buildCostMult: 1 };
    expect(stationCost("depot", ctx)).toBeCloseTo(STATION_TYPE_DEFS.depot.cost, 6);
    expect(stationCost("station", ctx)).toBeCloseTo(STATION_TYPE_DEFS.station.cost, 6);
    expect(stationCost("terminal", ctx)).toBeCloseTo(STATION_TYPE_DEFS.terminal.cost, 6);
  });

  it("scales with era inflation and difficulty build-cost multiplier", () => {
    const base: CostContext = { year: 1830, buildCostMult: 1 };
    const later: CostContext = { year: 1900, buildCostMult: 1 };
    const harder: CostContext = { year: 1830, buildCostMult: 1.2 };
    expect(stationCost("depot", later)).toBeGreaterThan(stationCost("depot", base));
    expect(stationCost("depot", harder)).toBeCloseTo(stationCost("depot", base) * 1.2, 6);
  });
});

describe("stationUpgradeCost", () => {
  it("is the difference between the two tiers' scaled costs", () => {
    const ctx: CostContext = { year: 1830, buildCostMult: 1 };
    expect(stationUpgradeCost("depot", "station", ctx)).toBeCloseTo(
      STATION_TYPE_DEFS.station.cost - STATION_TYPE_DEFS.depot.cost,
      6,
    );
    expect(stationUpgradeCost("station", "terminal", ctx)).toBeCloseTo(
      STATION_TYPE_DEFS.terminal.cost - STATION_TYPE_DEFS.station.cost,
      6,
    );
    expect(stationUpgradeCost("depot", "terminal", ctx)).toBeCloseTo(
      STATION_TYPE_DEFS.terminal.cost - STATION_TYPE_DEFS.depot.cost,
      6,
    );
  });
});

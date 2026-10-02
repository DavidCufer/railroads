/** PLAN Phase 34 item 8: a line's revenue, costs and per-year rate are one consistent story. */
import { describe, expect, it } from "vitest";
import { buildStation, buildTrack, buyTrain, setOrders } from "../../../src/sim/commands";
import { lineSummaries } from "../../../src/sim/finance/lines";
import { DAYS_PER_YEAR, HOURS_PER_DAY } from "../../../src/sim/time";
import { makeTestMap, makeTestState, tileAt } from "../track/helpers";

function lineWorld(trains: number) {
  const row = Array.from({ length: 16 }, () => "p").join("");
  const map = makeTestMap([row, row, row]);
  const state = makeTestState(map, { startYear: 1860 });
  state.cash = 1e9;
  buildTrack(
    state,
    Array.from({ length: 16 }, (_, x) => tileAt(map, x, 1)),
  );
  buildStation(state, tileAt(map, 0, 1), "station");
  buildStation(state, tileAt(map, 15, 1), "station");
  const [a, b] = state.stations.map((s) => s.id) as [number, number];
  for (let i = 0; i < trains; i++) {
    const r = buyTrain(state, a, "grasshopper-0-4-0", ["passengers"]);
    expect(r.ok).toBe(true);
    expect(
      setOrders(state, state.trains[i]!.id, [
        { stationId: a, rule: "auto" },
        { stationId: b, rule: "auto" },
      ]).ok,
    ).toBe(true);
  }
  return state;
}

describe("line summaries (Phase 34)", () => {
  it("new trains: costs include the running costs accrued so far, and there is no per-year rate yet", () => {
    const state = lineWorld(2);
    state.ticks += 10 * HOURS_PER_DAY;
    for (const t of state.trains) t.profit.thisYear.revenue = 4000;
    const [line] = lineSummaries(state);
    expect(line?.trainIds).toHaveLength(2);
    expect(line?.revenueThisYear).toBe(8000);
    expect(line?.costsThisYear ?? 0).toBeGreaterThan(0);
    expect(line?.ratePerYear).toBeUndefined();
  });

  it("an old train's rate covers this year to date and last year, not just this year's few days", () => {
    const state = lineWorld(1);
    const t = state.trains[0]!;
    // Two years on, just into the third year (day 30).
    state.ticks = (2 * DAYS_PER_YEAR + 30) * HOURS_PER_DAY;
    t.purchaseTick = 0;
    t.profit.lastYear = { revenue: 120_000, running: 20_000, wages: 10_000, wear: 0, repairs: 0 };
    t.profit.thisYear = { revenue: 10_000, running: 0, wages: 0, wear: 0, repairs: 0 };
    const [line] = lineSummaries(state);
    const rate = line?.ratePerYear ?? 0;
    // (90k + 10k - ~accrued costs) over 390 days → about 92k/yr, not 10k × 12 = 120k and not ×4 absurdities.
    expect(rate).toBeGreaterThan(70_000);
    expect(rate).toBeLessThan(100_000);
    expect(line?.revenueThisYear).toBe(10_000);
  });

  it("a train bought last year contributes only the time it was owned", () => {
    const state = lineWorld(1);
    const t = state.trains[0]!;
    state.ticks = (DAYS_PER_YEAR + 20) * HOURS_PER_DAY;
    t.purchaseTick = (DAYS_PER_YEAR - 100) * HOURS_PER_DAY; // owned 120 days
    t.profit.lastYear = { revenue: 30_000, running: 3_000, wages: 1_000, wear: 0, repairs: 0 };
    t.profit.thisYear = { revenue: 5_000, running: 0, wages: 0, wear: 0, repairs: 0 };
    const rate = lineSummaries(state)[0]?.ratePerYear ?? 0;
    // ~31k profit over 120 days → ~93k/yr.
    expect(rate).toBeGreaterThan(70_000);
    expect(rate).toBeLessThan(110_000);
  });
});

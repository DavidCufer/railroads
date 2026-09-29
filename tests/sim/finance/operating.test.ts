import { describe, expect, it } from "vitest";
import { monthlyFinanceStep, addExpense, addRevenue } from "../../../src/sim/finance/ledger";
import { operatingLast30Days, operatingTrailing } from "../../../src/sim/finance/operating";
import { makeTestMap, makeTestState } from "../track/helpers";

describe("operating view", () => {
  it("averages income and running costs per month and keeps investments apart", () => {
    const state = makeTestState(makeTestMap(["p"]));
    for (let m = 0; m < 3; m++) {
      addRevenue(state, "coal", 1000 * (m + 1));
      addExpense(state, "breakdownRepairs", 300);
      addExpense(state, "construction", 50_000);
      monthlyFinanceStep(state);
    }
    const avg = operatingTrailing(state);
    expect(avg.months).toBe(3);
    expect(avg.income).toBeCloseTo(2000);
    expect(avg.costs).toBeCloseTo(300);
    expect(avg.profit).toBeCloseTo(1700);
    expect(avg.investments).toBeCloseTo(50_000);
    expect(operatingLast30Days(state).income).toBeCloseTo(3000);
  });

  it("keeps only the last 12 months", () => {
    const state = makeTestState(makeTestMap(["p"]));
    for (let m = 0; m < 15; m++) monthlyFinanceStep(state);
    expect(state.finance.monthHistory).toHaveLength(12);
  });
});

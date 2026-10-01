import { describe, expect, it } from "vitest";
import { incomeTaxRate } from "../../../src/data/economy";
import { ledgerOperatingProfit } from "../../../src/data/finance";
import {
  addRevenue,
  monthlyFinanceStep,
  yearlyFinanceRollover,
} from "../../../src/sim/finance/ledger";
import { makeTestMap, makeTestState } from "../track/helpers";

/** Phase 30B: income tax is set aside monthly ("provisional tax"), trued up at the year's end. */
const TICKS_PER_MONTH = 24 * 30;

function runYear(revenueByMonth: number[], startYear = 1930) {
  const state = makeTestState(makeTestMap(["p"]), { startYear, difficulty: "normal", cash: 1e9 });
  const months: number[] = [];
  revenueByMonth.forEach((rev, m) => {
    addRevenue(state, "passengers", rev);
    state.ticks = (m + 1) * TICKS_PER_MONTH;
    monthlyFinanceStep(state);
    months.push(state.finance.thisYear.incomeTax);
  });
  return { state, months };
}

describe("provisional income tax (Phase 30B)", () => {
  it("accrues every month once the year is profitable and the year total matches the old single charge", () => {
    const { state, months } = runYear(Array<number>(12).fill(40_000));
    // Charged from the first month, not in one lump at the end.
    expect(months[0]).toBeGreaterThan(0);
    expect(months[5]!).toBeGreaterThan(months[0]!);
    const profit = ledgerOperatingProfit(state.finance.thisYear);
    state.ticks = 24 * 360;
    yearlyFinanceRollover(state);
    expect(state.finance.lastYear.incomeTax).toBeCloseTo(profit * incomeTaxRate(1930), 5);
    expect(state.finance.taxPaidThisYear).toBe(0);
  });

  it("refunds an overpayment when the year's second half is bad", () => {
    const { state } = runYear([
      100_000, 100_000, 100_000, 100_000, 100_000, 100_000, 0, 0, 0, 0, 0, 0,
    ]);
    const paid = state.finance.thisYear.incomeTax;
    expect(paid).toBeGreaterThan(0);
    // Costs push the year into a loss at the end.
    state.finance.thisYear.crewWages += 2_000_000;
    state.ticks = 24 * 360;
    const cash = state.cash;
    yearlyFinanceRollover(state);
    expect(state.finance.lastYear.incomeTax).toBeCloseTo(0, 5);
    expect(state.cash - cash).toBeCloseTo(paid, 5);
    expect(state.finance.taxLossCarry).toBeGreaterThan(0);
  });

  it("charges nothing before the 1910s", () => {
    const { months } = runYear(Array<number>(12).fill(40_000), 1850);
    expect(months.every((m) => m === 0)).toBe(true);
  });
});

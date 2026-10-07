/** Phase 41 (PLAYTEST-4 UX3): credit warnings come before the lenders act. */
import { describe, expect, it } from "vitest";
import { makeTestMap, makeTestState } from "../track/helpers";
import { creditWarning, dailyCreditWarningStep } from "../../../src/sim/finance/warnings";
import { insolvencyMonthsLeft } from "../../../src/sim/finance/credit";

const MONTH = 30 * 24;
const mk = () =>
  makeTestState(makeTestMap(["p"]), { seed: 1, difficulty: "normal", startYear: 1850 });

describe("credit warnings", () => {
  it("says nothing without debt", () => {
    const s = mk();
    s.ticks = 22 * MONTH;
    expect(creditWarning(s)).toBeUndefined();
  });

  it("announces the end of start-up credit three months ahead, once, only with a loan", () => {
    const s = mk();
    s.finance.loans = 300_000;
    s.ticks = 20 * MONTH;
    expect(creditWarning(s)).toBeUndefined();
    s.ticks = 21 * MONTH + 1;
    expect(creditWarning(s)).toMatchObject({ kind: "startupEnding", monthsLeft: 3 });
    dailyCreditWarningStep(s);
    dailyCreditWarningStep(s);
    s.ticks += 24 * 5;
    dailyCreditWarningStep(s);
    expect(s.news.filter((n) => n.kind === "startupCreditEnding")).toHaveLength(1);
    s.ticks = 23 * MONTH + 1;
    expect(creditWarning(s)).toMatchObject({ kind: "startupEnding", monthsLeft: 1 });
  });

  it("warns when debt is over the limit, before any call, and not again for 90 days", () => {
    const s = mk();
    s.ticks = 30 * MONTH; // start-up credit is over; the company earns nothing, so the limit is 0
    s.finance.loans = 300_000;
    expect(creditWarning(s)).toMatchObject({ kind: "overLimit", debt: 300_000, limit: 0 });
    dailyCreditWarningStep(s);
    s.ticks += 24 * 30;
    dailyCreditWarningStep(s);
    expect(s.news.filter((n) => n.kind === "overLimit")).toHaveLength(1);
    s.ticks += 24 * 70;
    dailyCreditWarningStep(s);
    expect(s.news.filter((n) => n.kind === "overLimit")).toHaveLength(2);
  });

  it("insolvency is counted in months, as the news says", () => {
    const s = mk();
    expect(insolvencyMonthsLeft(s)).toBeUndefined();
    s.finance.negativeCashMonths = 1;
    expect(insolvencyMonthsLeft(s)).toBe(2); // Normal grace is 3 months
  });
});

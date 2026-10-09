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

describe("Phase 44: lenders nervous (Hard)", () => {
  it("warns when debt passes the risk threshold, only on Hard, and posts no news", () => {
    const s = makeTestState(makeTestMap(["p"]), { seed: 1, difficulty: "hard", startYear: 1850 });
    s.ticks = 30 * MONTH;
    s.cash = 2_000_000;
    s.finance.thisMonth.passengers = 1e9; // a huge credit limit, so the limit is not the warning
    s.finance.loans = 200_000;
    expect(creditWarning(s)).toBeUndefined();
    s.finance.loans = 2_500_000;
    expect(creditWarning(s)).toMatchObject({ kind: "lendersNervous" });
    dailyCreditWarningStep(s);
    expect(s.news).toHaveLength(0);
    s.difficulty = "normal"; // no risk threshold: only the ordinary over-limit warning
    expect(creditWarning(s)).toMatchObject({ kind: "overLimit" });
  });
});

/** Phase 30A: leverage-based interest and earnings-based credit (SPEC §9.1). */
import { describe, expect, it } from "vitest";
import { DIFFICULTY, emptyLedgerPeriod } from "../../../src/data/finance";
import { takeLoan } from "../../../src/sim/commands";
import {
  creditLimitFor,
  creditTerms,
  interestRate,
  leverage,
} from "../../../src/sim/finance/credit";
import { monthlyFinanceStep, netWorth } from "../../../src/sim/finance/ledger";
import { makeTestMap, makeTestState } from "../track/helpers";
import type { GameState } from "../../../src/sim/state";

function company(
  opts: { difficulty?: GameState["difficulty"]; cash?: number; loans?: number } = {},
): GameState {
  const state = makeTestState(makeTestMap(["p"]), {
    ...(opts.difficulty ? { difficulty: opts.difficulty } : {}),
    cash: opts.cash ?? 1_000_000,
  });
  state.finance.loans = opts.loans ?? 0;
  return state;
}

describe("interest rises with leverage", () => {
  it("is the base rate with no debt, and climbs with debt ÷ assets", () => {
    const s = company();
    expect(interestRate(s, netWorth(s))).toBeCloseTo(DIFFICULTY.normal.interestRate, 9);
    const rates = [0, 200_000, 500_000, 1_000_000, 3_000_000].map((loans) => {
      const t = company({ loans, cash: 1_000_000 + loans });
      return interestRate(t, netWorth(t));
    });
    for (let i = 1; i < rates.length; i++) expect(rates[i]!).toBeGreaterThan(rates[i - 1]!);
    expect(rates[0]).toBeCloseTo(0.06, 9);
    expect(rates[4]!).toBeGreaterThan(0.06 + 0.05); // 75 % debt: a heavy premium
  });

  it("Hard pays a higher base and a steeper premium than Normal, Easy less", () => {
    const rate = (d: GameState["difficulty"]): number => {
      const s = company({ difficulty: d, loans: 1_000_000, cash: 2_000_000 });
      return interestRate(s, netWorth(s));
    };
    expect(rate("hard")).toBeGreaterThan(rate("normal") + 0.02);
    expect(rate("easy")).toBeLessThan(rate("normal") - 0.02);
  });

  it("is what the monthly step charges, on the whole loan book", () => {
    const s = company({ loans: 1_000_000, cash: 2_000_000 });
    const rate = interestRate(s, netWorth(s));
    const before = s.cash;
    monthlyFinanceStep(s);
    expect(s.finance.monthHistory.at(-1)!.interest).toBeCloseTo(1_000_000 * (rate / 12), 0);
    expect(before - s.cash).toBeGreaterThan(1_000_000 * (0.06 / 12)); // more than the flat rate would cost
  });

  it("leverage is zero without loans and capped at one", () => {
    expect(leverage(company(), 1e6)).toBe(0);
    expect(leverage(company({ loans: 1e9 }), -1e12)).toBe(1);
  });
});

describe("credit follows earnings", () => {
  it("a company with assets but no earnings can borrow only the $500k floor", () => {
    const s = company({ cash: 20_000_000 });
    expect(creditLimitFor(s, netWorth(s))).toBe(500_000);
    expect(takeLoan(s, 500_000).ok).toBe(true);
    expect(takeLoan(s, 100_000)).toMatchObject({ ok: false, reason: "credit-limit-exceeded" });
  });

  it("earnings lift the limit to 5× the year's operating profit, at most half the net worth", () => {
    const s = company({ cash: 20_000_000 });
    const month = emptyLedgerPeriod();
    month.passengers = 1_000_000; // $12M a year, no costs
    s.finance.monthHistory = Array.from({ length: 12 }, () => ({ ...month }));
    const nw = netWorth(s);
    expect(creditLimitFor(s, nw)).toBeCloseTo(Math.min(nw / 2, 5 * 12_000_000), 0);
    s.cash = 200_000_000; // richer: now the earnings are the binding limit
    expect(creditLimitFor(s, netWorth(s))).toBeCloseTo(60_000_000, 0);
  });

  it("creditTerms reports the figures the Finance panel shows", () => {
    const s = company({ loans: 300_000, cash: 1_300_000 });
    const t = creditTerms(s, netWorth(s));
    expect(t.baseRate).toBe(0.06);
    expect(t.rate).toBeCloseTo(t.baseRate + t.premium, 12);
    expect(t.available).toBe(t.limit - 300_000);
    expect(t.leverage).toBeGreaterThan(0.1);
  });
});

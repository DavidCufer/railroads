/**
 * Borrowing (SPEC §9.1, Phase 30A): the interest rate rises with leverage and the credit limit follows earnings.
 * Pure functions of the state, used by the monthly ledger, the loan commands and the Finance panel.
 */
import {
  CREDIT_LIMIT_EARNINGS_MULT,
  CREDIT_LIMIT_FRACTION,
  CREDIT_LIMIT_MIN,
  DIFFICULTY,
  ledgerOperatingProfit,
} from "../../data/finance";
import type { GameState } from "../state";

/** Net worth as the ledger computes it — passed in to avoid a cycle with ledger.ts. */
export interface CreditInputs {
  netWorth: number;
}

/** Debt ÷ assets (assets = net worth + debt), 0 with no loans, approaching 1 as net worth is borrowed away. */
export function leverage(state: GameState, netWorth: number): number {
  const loans = state.finance.loans;
  if (loans <= 0) return 0;
  const assets = Math.max(1, netWorth + loans);
  return Math.min(1, loans / assets);
}

/** Yearly interest rate on the whole loan book right now: the difficulty's base rate plus the leverage premium. */
export function interestRate(state: GameState, netWorth: number): number {
  const diff = DIFFICULTY[state.difficulty];
  const l = leverage(state, netWorth);
  return diff.interestRate + diff.leveragePremium * l * l;
}

/** Operating profit before interest over the last twelve completed months (plus the month so far). */
export function earningsBeforeInterest(state: GameState): number {
  let total = 0;
  for (const month of [...state.finance.monthHistory, state.finance.thisMonth]) {
    total += ledgerOperatingProfit(month) + month.interest;
  }
  return total;
}

/** How much the company may owe in all: the lower of half its net worth and 5× its yearly earnings, at least $500k. */
export function creditLimitFor(state: GameState, netWorth: number): number {
  const byAssets = netWorth * CREDIT_LIMIT_FRACTION;
  const byEarnings = earningsBeforeInterest(state) * CREDIT_LIMIT_EARNINGS_MULT;
  return Math.max(CREDIT_LIMIT_MIN, Math.min(byAssets, byEarnings));
}

export interface CreditTerms {
  /** Yearly interest rate now (`baseRate + premium`). */
  rate: number;
  baseRate: number;
  /** The leverage part of `rate`. */
  premium: number;
  leverage: number;
  limit: number;
  /** Credit left under the limit. */
  available: number;
}

export function creditTerms(state: GameState, netWorth: number): CreditTerms {
  const diff = DIFFICULTY[state.difficulty];
  const l = leverage(state, netWorth);
  const premium = diff.leveragePremium * l * l;
  const limit = creditLimitFor(state, netWorth);
  return {
    rate: diff.interestRate + premium,
    baseRate: diff.interestRate,
    premium,
    leverage: l,
    limit,
    available: Math.max(0, limit - state.finance.loans),
  };
}

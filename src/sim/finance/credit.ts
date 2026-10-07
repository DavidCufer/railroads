/**
 * Borrowing (SPEC §9.1, Phase 30A): the interest rate rises with leverage and the credit limit follows earnings.
 * Pure functions of the state, used by the monthly ledger, the loan commands and the Finance panel.
 */
import {
  COVER_PREMIUM_MAX,
  CREDIT_CALL_FRACTION,
  INTEREST_COVER_FULL,
  CREDIT_LIMIT_EARNINGS_MULT,
  CREDIT_LIMIT_FRACTION,
  CREDIT_LIMIT_MIN,
  CREDIT_STARTUP_MONTHS,
  DIFFICULTY,
  LOAN_TERM_MONTHS,
  ledgerOperatingProfit,
} from "../../data/finance";
import { panicCreditMult } from "./panics";
import { DAYS_PER_MONTH, HOURS_PER_DAY } from "../time";
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

/** Days until the bankruptcy check that ends the grace, or undefined when the company is not insolvent. */
export function insolvencyDaysLeft(state: GameState): number | undefined {
  const months = state.finance.negativeCashMonths;
  if (!DIFFICULTY[state.difficulty].bankruptcy || months <= 0) return undefined;
  const monthsLeft = DIFFICULTY[state.difficulty].graceMonths - months;
  const toMonthEnd = DAYS_PER_MONTH - (Math.floor(state.ticks / HOURS_PER_DAY) % DAYS_PER_MONTH);
  return Math.max(0, (monthsLeft - 1) * DAYS_PER_MONTH + toMonthEnd);
}

/** Months left to recover (what the news says too), or undefined when the company is not insolvent. */
export function insolvencyMonthsLeft(state: GameState): number | undefined {
  const months = state.finance.negativeCashMonths;
  if (!DIFFICULTY[state.difficulty].bankruptcy || months <= 0) return undefined;
  return Math.max(1, DIFFICULTY[state.difficulty].graceMonths - months);
}

/** Premium for earnings that do not cover the interest (0 during the start-up credit and with no loans). */
export function coverPremium(state: GameState): number {
  const loans = state.finance.loans;
  if (loans <= 0 || state.ticks < CREDIT_STARTUP_MONTHS * DAYS_PER_MONTH * HOURS_PER_DAY) return 0;
  const baseInterest = loans * DIFFICULTY[state.difficulty].interestRate;
  const cover = earningsBeforeInterest(state) / baseInterest;
  return (
    COVER_PREMIUM_MAX *
    Math.min(1, Math.max(0, (INTEREST_COVER_FULL - cover) / INTEREST_COVER_FULL))
  );
}

/** Yearly interest rate on the whole loan book right now: the difficulty's base rate plus the leverage premium and the
 * premium for thin interest cover. */
export function interestRate(state: GameState, netWorth: number): number {
  const diff = DIFFICULTY[state.difficulty];
  const l = leverage(state, netWorth);
  return diff.interestRate + diff.leveragePremium * l * l + coverPremium(state);
}

/** Loans the lenders call this month: a share of what is owed above the credit limit (never in the start-up period). */
export function creditCall(state: GameState, netWorth: number): number {
  if (state.ticks < CREDIT_STARTUP_MONTHS * DAYS_PER_MONTH * HOURS_PER_DAY) return 0;
  const excess = state.finance.loans - creditLimitFor(state, netWorth);
  return excess > 0 ? Math.min(state.finance.loans, excess * CREDIT_CALL_FRACTION) : 0;
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
  const startup = state.ticks < CREDIT_STARTUP_MONTHS * DAYS_PER_MONTH * HOURS_PER_DAY;
  return (
    Math.max(startup ? CREDIT_LIMIT_MIN : 0, earnedCreditLimit(state, netWorth)) *
    panicCreditMult(state)
  );
}

/** The limit the company's own record earns, without the start-up floor (what it will have once start-up credit ends). */
export function earnedCreditLimit(state: GameState, netWorth: number): number {
  const byAssets = netWorth * CREDIT_LIMIT_FRACTION;
  const byEarnings = earningsBeforeInterest(state) * CREDIT_LIMIT_EARNINGS_MULT;
  return Math.min(byAssets, byEarnings) * DIFFICULTY[state.difficulty].creditMult;
}

/** Principal due this month: the bonds' schedule, never more than is owed. */
export function principalDue(state: GameState): number {
  const loans = state.finance.loans;
  if (loans <= 0) return 0;
  return Math.min(loans, state.finance.amortMonthly ?? loans / LOAN_TERM_MONTHS);
}

/** Pays this month's scheduled principal out of the loan book (not cash) and returns it; the instalment stays level. */
export function amortise(state: GameState): number {
  const due = principalDue(state);
  state.finance.amortMonthly = state.finance.amortMonthly ?? state.finance.loans / LOAN_TERM_MONTHS;
  state.finance.loans -= due;
  if (state.finance.loans <= 0.005) {
    state.finance.loans = 0;
    state.finance.amortMonthly = 0;
  }
  return due;
}

/** Books a new bond of `amount`: the loan book grows and the monthly schedule rises by `amount ÷ term`. */
export function issueLoan(state: GameState, amount: number): void {
  state.finance.amortMonthly = principalDue(state) + amount / LOAN_TERM_MONTHS;
  state.finance.loans += amount;
}

/** Repays `amount` early; the schedule shrinks in proportion, so a half-repaid book owes half the instalment. */
export function repayPrincipal(state: GameState, amount: number): void {
  const before = state.finance.loans;
  const due = principalDue(state);
  state.finance.loans = Math.max(0, before - amount);
  state.finance.amortMonthly = before > 0 ? (due * state.finance.loans) / before : 0;
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
  const premium = diff.leveragePremium * l * l + coverPremium(state);
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

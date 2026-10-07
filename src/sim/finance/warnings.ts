/**
 * Credit warnings (Phase 41, PLAYTEST-4 UX3): the end of start-up credit and debt above the limit, said before the
 * lenders act. A pure function of the state for the banner, plus a daily step that posts the news once.
 */
import {
  CREDIT_OVER_LIMIT_NEWS_GAP_DAYS,
  CREDIT_STARTUP_MONTHS,
  CREDIT_STARTUP_WARNING_MONTHS,
} from "../../data/finance";
import { NEWS_COLLAPSE_DAYS } from "../../data/news";
import { pushNews } from "../news";
import type { GameState } from "../state";
import { DAYS_PER_MONTH, HOURS_PER_DAY } from "../time";
import { creditLimitFor, earnedCreditLimit } from "./credit";
import { netWorth } from "./ledger";

export type CreditWarning =
  | { kind: "startupEnding"; monthsLeft: number; limit: number }
  | { kind: "overLimit"; debt: number; limit: number };

const STARTUP_END_TICKS = CREDIT_STARTUP_MONTHS * DAYS_PER_MONTH * HOURS_PER_DAY;

/** The credit warning in force now, if any: debt above the limit, or start-up credit ending soon with a loan on the book. */
export function creditWarning(state: GameState): CreditWarning | undefined {
  const debt = state.finance.loans;
  if (debt <= 0) return undefined;
  const worth = netWorth(state);
  if (state.ticks >= STARTUP_END_TICKS) {
    const limit = creditLimitFor(state, worth);
    return debt > limit ? { kind: "overLimit", debt, limit } : undefined;
  }
  const ticksLeft = STARTUP_END_TICKS - state.ticks;
  const monthsLeft = Math.ceil(ticksLeft / (DAYS_PER_MONTH * HOURS_PER_DAY));
  if (monthsLeft > CREDIT_STARTUP_WARNING_MONTHS) return undefined;
  return { kind: "startupEnding", monthsLeft, limit: earnedCreditLimit(state, worth) };
}

/** Posts the news for `creditWarning`: the start-up notice once, over-limit once per `CREDIT_OVER_LIMIT_NEWS_GAP_DAYS`. */
export function dailyCreditWarningStep(state: GameState): void {
  const warning = creditWarning(state);
  if (!warning) return;
  const recent = (kind: string, days: number): boolean =>
    state.news.some((n) => n.kind === kind && (state.ticks - n.tick) / HOURS_PER_DAY <= days);
  if (warning.kind === "startupEnding") {
    if (recent("startupCreditEnding", NEWS_COLLAPSE_DAYS)) return;
    pushNews(state, {
      kind: "startupCreditEnding",
      months: warning.monthsLeft,
      limit: warning.limit,
    });
  } else {
    if (recent("overLimit", CREDIT_OVER_LIMIT_NEWS_GAP_DAYS)) return;
    pushNews(state, { kind: "overLimit", debt: warning.debt, limit: warning.limit });
  }
}

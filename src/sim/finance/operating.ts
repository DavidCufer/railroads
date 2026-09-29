/** Operating view of the ledger (PLAN Phase 24A): recurring income vs recurring costs, averaged per
 * month, kept apart from one-off investments so the player can tell whether the railway is
 * profitable right now. Pure; reads only `state.finance`. */
import {
  addLedgerPeriods,
  emptyLedgerPeriod,
  ledgerInvestments,
  ledgerOperatingCosts,
  ledgerRevenue,
  type LedgerPeriod,
} from "../../data/finance";
import type { GameState } from "../state";

export interface OperatingAverage {
  /** Months averaged over (completed months, or 1 = the running month when none has closed yet). */
  months: number;
  income: number;
  costs: number;
  profit: number;
  investments: number;
}

function average(periods: readonly LedgerPeriod[]): OperatingAverage {
  const total = periods.reduce(addLedgerPeriods, emptyLedgerPeriod());
  const n = Math.max(1, periods.length);
  const income = ledgerRevenue(total) / n;
  const costs = ledgerOperatingCosts(total) / n;
  return {
    months: n,
    income,
    costs,
    profit: income - costs,
    investments: ledgerInvestments(total) / n,
  };
}

/** Average per month over the trailing 12 completed months (fewer early in the game). */
export function operatingTrailing(state: GameState): OperatingAverage {
  const history = state.finance.monthHistory;
  return average(history.length > 0 ? history : [state.finance.thisMonth]);
}

/** The last 30 days (= the last completed month; a game month is 30 days). */
export function operatingLast30Days(state: GameState): OperatingAverage {
  const history = state.finance.monthHistory;
  const last = history[history.length - 1];
  return average([last ?? state.finance.thisMonth]);
}

/** Runtime finance state (SPEC §9) living in `GameState.finance` — balance numbers/ledger shape
 * are in src/data/finance.ts, this is just the mutable state built from them. */
import { emptyLedgerPeriod, type LedgerPeriod } from "../../data/finance";

export interface NetWorthSample {
  tick: number;
  cash: number;
  netWorth: number;
}

export interface FinanceState {
  loans: number;
  /** Running total of currently-standing track/station/improvement build cost (SPEC §9.3's "50% of
   * (track + station + improvement build cost)") — added to on build/upgrade, subtracted from on
   * bulldoze, in src/sim/commands.ts. */
  capitalInvested: number;
  thisMonth: LedgerPeriod;
  thisYear: LedgerPeriod;
  lastYear: LedgerPeriod;
  /** Monthly cash/net-worth samples for the finance panel's line chart (SPEC §10.2). Capped so a
   * very long game doesn't grow this unboundedly. */
  netWorthHistory: NetWorthSample[];
  /** Consecutive month-ends closed with cash < 0 and no credit left (SPEC §9.4). */
  negativeCashMonths: number;
  bankrupt: boolean;
}

export const NET_WORTH_HISTORY_MAX_SAMPLES = 480; // 40 years of monthly samples

export function createFinanceState(): FinanceState {
  return {
    loans: 0,
    capitalInvested: 0,
    thisMonth: emptyLedgerPeriod(),
    thisYear: emptyLedgerPeriod(),
    lastYear: emptyLedgerPeriod(),
    netWorthHistory: [],
    negativeCashMonths: 0,
    bankrupt: false,
  };
}

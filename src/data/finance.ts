/** Starting conditions and difficulty multipliers (SPEC §9.1, §9.6). */

export type Difficulty = "easy" | "normal" | "hard";

export interface DifficultyDef {
  startingCash: number;
  revenueMult: number;
  buildCostMult: number;
  breakdownMult: number;
  interestRate: number;
  bankruptcy: boolean;
}

export const DIFFICULTY: Record<Difficulty, DifficultyDef> = {
  easy: {
    startingCash: 1_500_000,
    revenueMult: 1.25,
    buildCostMult: 0.8,
    breakdownMult: 0.5,
    interestRate: 0.04,
    bankruptcy: false,
  },
  normal: {
    startingCash: 1_000_000,
    revenueMult: 1.0,
    buildCostMult: 1.0,
    breakdownMult: 1.0,
    interestRate: 0.06,
    bankruptcy: true,
  },
  hard: {
    startingCash: 600_000,
    revenueMult: 0.8,
    buildCostMult: 1.2,
    breakdownMult: 1.5,
    interestRate: 0.08,
    bankruptcy: true,
  },
};

export const DEFAULT_DIFFICULTY: Difficulty = "normal";

/** Era inflation (SPEC §9.5): all costs/revenues scale by this factor, ≈2.4× by 1950. */
export function eraInflation(year: number): number {
  return 1.0 + (year - 1830) * 0.012;
}

// --- Loans (SPEC §9.1) -------------------------------------------------------------------------

export const LOAN_INCREMENT = 100_000;
export const CREDIT_LIMIT_FRACTION = 0.5;
export const CREDIT_LIMIT_MIN = 500_000;

// --- Bankruptcy (SPEC §9.4) ---------------------------------------------------------------------

export const BANKRUPTCY_MONTHS = 3;

// --- Net worth (SPEC §9.3) ----------------------------------------------------------------------

/** Fraction of cumulative track/station/improvement build cost counted toward net worth. */
export const NET_WORTH_CONSTRUCTION_FRACTION = 0.5;
export const LOCO_DEPRECIATION_PER_YEAR = 0.05;
export const LOCO_DEPRECIATION_MIN_FRACTION = 0.1;

// --- Ledger (SPEC §9.2) --------------------------------------------------------------------------

/** Revenue/expense totals tracked per month and rolled up per year. "freight" bundles every
 * non-passenger/mail cargo's revenue — the 800×360 finance panel doesn't have room for a per-cargo
 * breakdown, a deviation from SPEC §9.2's "(per cargo type)" note (see PROGRESS.md). */
export interface LedgerPeriod {
  passengers: number;
  mail: number;
  freight: number;
  trainMaintenance: number;
  trackMaintenance: number;
  stationMaintenance: number;
  breakdownRepairs: number;
  interest: number;
  construction: number;
  rollingStock: number;
}

export function emptyLedgerPeriod(): LedgerPeriod {
  return {
    passengers: 0,
    mail: 0,
    freight: 0,
    trainMaintenance: 0,
    trackMaintenance: 0,
    stationMaintenance: 0,
    breakdownRepairs: 0,
    interest: 0,
    construction: 0,
    rollingStock: 0,
  };
}

export function addLedgerPeriods(a: LedgerPeriod, b: LedgerPeriod): LedgerPeriod {
  const result = { ...a };
  for (const key of Object.keys(result) as Array<keyof LedgerPeriod>) result[key] += b[key];
  return result;
}

export function ledgerRevenue(p: LedgerPeriod): number {
  return p.passengers + p.mail + p.freight;
}

export function ledgerExpenses(p: LedgerPeriod): number {
  return (
    p.trainMaintenance +
    p.trackMaintenance +
    p.stationMaintenance +
    p.breakdownRepairs +
    p.interest +
    p.construction +
    p.rollingStock
  );
}

export function ledgerNetProfit(p: LedgerPeriod): number {
  return ledgerRevenue(p) - ledgerExpenses(p);
}

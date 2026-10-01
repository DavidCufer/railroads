/** Starting conditions and difficulty multipliers (SPEC §9.1, §9.6). */

export type Difficulty = "easy" | "normal" | "hard";

export interface DifficultyDef {
  startingCash: number;
  revenueMult: number;
  buildCostMult: number;
  /** Land and way-leave price factor (Phase 30A): franchises in a hard game are scarce and landowners dig in. */
  landMult: number;
  breakdownMult: number;
  interestRate: number;
  /** Leverage premium (Phase 30A): the rate rises by `leveragePremium × (debt ÷ assets)²` — lenders price risk. */
  leveragePremium: number;
  bankruptcy: boolean;
  /** Multiplies the property and corporate income tax schedule (Hard = a heavier schedule, not lower revenue). */
  taxMult: number;
  /** Years the income tax schedule is ahead of the calendar (Hard = the state taxes railways a decade early). */
  taxYearShift: number;
}

export const DIFFICULTY: Record<Difficulty, DifficultyDef> = {
  easy: {
    startingCash: 1_500_000,
    revenueMult: 1.25,
    buildCostMult: 0.8,
    landMult: 0.7,
    breakdownMult: 0.5,
    interestRate: 0.04,
    leveragePremium: 0.08,
    bankruptcy: false,
    taxMult: 0.6,
    taxYearShift: -10,
  },
  normal: {
    startingCash: 1_000_000,
    revenueMult: 1.0,
    buildCostMult: 1.0,
    landMult: 1.0,
    breakdownMult: 1.0,
    interestRate: 0.06,
    leveragePremium: 0.12,
    bankruptcy: true,
    taxMult: 1.0,
    taxYearShift: 0,
  },
  hard: {
    startingCash: 600_000,
    revenueMult: 1.0,
    buildCostMult: 1.2,
    landMult: 1.5,
    breakdownMult: 1.5,
    interestRate: 0.08,
    leveragePremium: 0.2,
    bankruptcy: true,
    taxMult: 1.6,
    taxYearShift: 10,
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
/** Credit from earnings (Phase 30A): lenders lend against cash flow, not only against what the company owns. The
 * limit is the lower of `CREDIT_LIMIT_FRACTION` of net worth and `CREDIT_LIMIT_EARNINGS_MULT` × the last twelve
 * months' operating profit before interest (the interest cover a lender wants), but never below `CREDIT_LIMIT_MIN`. */
export const CREDIT_LIMIT_EARNINGS_MULT = 5;

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
  /** Fuel, oil and servicing of the locomotives. */
  trainMaintenance: number;
  /** Wages of train crews (Economic model v2). */
  crewWages: number;
  trackMaintenance: number;
  /** Wear of the rails from the trains that ran on them (Economic model v2). */
  trackWear: number;
  stationMaintenance: number;
  /** Local property tax on track, stations and improvements (Economic model v2). */
  propertyTax: number;
  /** Corporate income tax, charged at the year's end (Economic model v2). */
  incomeTax: number;
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
    crewWages: 0,
    trackMaintenance: 0,
    trackWear: 0,
    stationMaintenance: 0,
    propertyTax: 0,
    incomeTax: 0,
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

/** Recurring costs of running the railway (SPEC §9.2, Phase 24A "operating" view). */
export function ledgerOperatingCosts(p: LedgerPeriod): number {
  return (
    p.trainMaintenance +
    p.crewWages +
    p.trackMaintenance +
    p.trackWear +
    p.stationMaintenance +
    p.propertyTax +
    p.breakdownRepairs +
    p.interest
  );
}

/** One-off capital spending: track, stations, improvements and trains. */
export function ledgerInvestments(p: LedgerPeriod): number {
  return p.construction + p.rollingStock;
}

/** Revenue minus operating costs — what the railway earns before investing (Phase 24A). */
export function ledgerOperatingProfit(p: LedgerPeriod): number {
  return ledgerRevenue(p) - ledgerOperatingCosts(p);
}

/** How many completed months the operating view averages over. */
export const OPERATING_HISTORY_MONTHS = 12;

export function ledgerExpenses(p: LedgerPeriod): number {
  return ledgerOperatingCosts(p) + p.incomeTax + ledgerInvestments(p);
}

export function ledgerNetProfit(p: LedgerPeriod): number {
  return ledgerRevenue(p) - ledgerExpenses(p);
}

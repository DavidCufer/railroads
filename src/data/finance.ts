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

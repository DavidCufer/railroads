/**
 * Scenarios (Phase 46, SPEC §11c): hand-made challenges on the shipped regions. Each has a fixed start (region, seed, year,
 * difficulty, cash, opening debt), one goal and a deadline, and a 1-3 star rating. Best stars are kept in the player profile
 * (src/save/profile.ts), outside any game save.
 *
 * Stars (`stars: [a, b]`): finishing in time is 1 star. For a goal with a year (connect, deliver) a second star for
 * finishing by year `a` and a third for ending with a yearly operating profit (the last completed year's) of at least `b`;
 * for `survive` a second star for ending with that profit at least `a` and a third for at least `b`.
 *
 * Phase 67: the profit figures are the strong player's Normal medians (`strongPlayerAmount("profit", ...)`, Phase 67
 * bench) of the era row of the start year, in the money of the deadline year. A scenario is a short run, so a connect or
 * deliver scenario asks for the year-5 median (a goal finished early has about that much behind it); `panic1873` runs
 * seven years, so star 2 is the year-5 median and star 3 the year-7 median (interpolated between years 5 and 10).
 */
import type { CargoType } from "./cargo";
import { strongPlayerAmount } from "./goals";
import type { Difficulty } from "./finance";
import type { RegionId } from "../sim/regions/types";

export type ScenarioGoal =
  | { type: "connect"; cities: string[]; byYear: number }
  | { type: "survive"; untilYear: number; maxDebt: number }
  | {
      type: "deliver";
      cargo: CargoType;
      amount: number;
      byYear: number;
      /** Only deliveries at a station within `withinTiles` of this town count (its port). */
      nearCity?: { name: string; withinTiles: number };
    };

export interface ScenarioDef {
  id: string;
  region: RegionId;
  seed: number;
  startYear: number;
  difficulty: Difficulty;
  /** Cash at the start; the default is the difficulty's (with the era multiple). */
  startCash?: number;
  /** Opening debt on top of `startCash` (the loans are paid out as cash, so net worth is unchanged). */
  startLoans?: number;
  goal: ScenarioGoal;
  stars: [number, number];
}

export const SCENARIOS: readonly ScenarioDef[] = [
  {
    id: "semmering",
    region: "central-eu",
    seed: 7,
    startYear: 1850,
    difficulty: "normal",
    startCash: 700_000,
    goal: { type: "connect", cities: ["Vienna", "Trieste"], byYear: 1857 },
    stars: [1853, strongPlayerAmount("profit", 5, 1857, 1850)],
  },
  {
    id: "coalTrieste",
    region: "central-eu",
    seed: 7,
    startYear: 1858,
    difficulty: "normal",
    startCash: 2_500_000,
    goal: {
      type: "deliver",
      cargo: "coal",
      amount: 6_000,
      byYear: 1866,
      nearCity: { name: "Trieste", withinTiles: 8 },
    },
    stars: [1863, strongPlayerAmount("profit", 5, 1866, 1858)],
  },
  {
    id: "transcontinental",
    region: "us-west",
    seed: 7,
    startYear: 1860,
    difficulty: "normal",
    startCash: 900_000,
    goal: { type: "connect", cities: ["Sacramento", "Salt Lake City"], byYear: 1869 },
    stars: [1865, strongPlayerAmount("profit", 5, 1869, 1860)],
  },
  {
    id: "silverRush",
    region: "central-eu",
    seed: 7,
    startYear: 1880,
    difficulty: "normal",
    startCash: 4_000_000,
    goal: { type: "deliver", cargo: "silverBars", amount: 200, byYear: 1890 },
    stars: [1887, strongPlayerAmount("profit", 5, 1890, 1880)],
  },
  // Owner (2026-10-31): the hardest scenario, listed last.
  {
    id: "panic1873",
    region: "us-east",
    seed: 7,
    startYear: 1871,
    difficulty: "normal",
    startCash: 400000,
    startLoans: 2_500_000,
    goal: { type: "survive", untilYear: 1878, maxDebt: 500_000 },
    stars: [
      strongPlayerAmount("profit", 5, 1878, 1871),
      strongPlayerAmount("profit", 7, 1878, 1871),
    ],
  },
];

export function scenarioById(id: string): ScenarioDef | undefined {
  return SCENARIOS.find((s) => s.id === id);
}

/** The new-game options that start `def`. */
export function scenarioNewGameOptions(def: ScenarioDef): {
  region: RegionId;
  seed: number;
  startYear: number;
  difficulty: Difficulty;
  scenarioId: string;
} {
  return {
    region: def.region,
    seed: def.seed,
    startYear: def.startYear,
    difficulty: def.difficulty,
    scenarioId: def.id,
  };
}

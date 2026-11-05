/**
 * Phase 84: one canary run, as a CLI so tests/sim/canary.test.ts can run all eras in parallel child processes.
 *   npx tsx tools/bench/canary.ts <startYear> <normal|hard>   -> prints one line: CANARY {json}
 * The player is Phase 83's "cautious" V2 (no lookahead; the quick Strategist needs 70 s for 2 years, too slow) on a fixed
 * small random map (seed 3), 2 years. Pure functions of the seed: the numbers repeat exactly.
 */
import { playCompany, type Spec } from "./difficulty/play";

export const CANARY_SEED = 3;
export const CANARY_YEARS = 2;

export interface CanaryResult {
  startYear: number;
  difficulty: string;
  startCash: number;
  /** Operating profit of the two completed years, summed ($). */
  profit: number;
  netWorth: number;
  bankruptYear: number | null;
}

export function runCanary(startYear: number, difficulty: "normal" | "hard"): CanaryResult {
  const spec: Spec = {
    kind: "random",
    id: `random:${CANARY_SEED}`,
    startYear,
    difficulty,
    mapSize: "small",
  };
  const r = playCompany(spec, "cautious", { seed: CANARY_SEED, years: CANARY_YEARS, quick: true });
  return {
    startYear,
    difficulty,
    startCash: r.startCash,
    profit: Math.round(r.profit.reduce((a, b) => a + b, 0)),
    netWorth: Math.round(r.netWorth),
    bankruptYear: r.bankruptYear,
  };
}

if (process.argv[1]?.endsWith("canary.ts")) {
  const res = runCanary(Number(process.argv[2]), process.argv[3] as "normal" | "hard");
  console.log("CANARY " + JSON.stringify(res));
}

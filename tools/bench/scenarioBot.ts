/**
 * `npx tsx tools/bench/scenarioBot.ts <scenarioId|all> [play|idle]` - runs the scripted scenario runs of `scenarioRun.ts`
 * (YEARS, TRAINS, ORE, BARS, TRACE, DUMP, POS in the environment tune or trace them).
 */
import { SCENARIOS } from "../../src/data/scenarios";
import { runScenario } from "./scenarioRun";

const arg = process.argv[2];
if (arg) {
  const mode = (process.argv[3] ?? "play") as "play" | "idle";
  for (const def of SCENARIOS) {
    if (arg !== "all" && arg !== def.id) continue;
    if (def.goal.type === "survive") continue;
    const r = runScenario(def.id, mode);
    console.log(mode, JSON.stringify(r));
  }
}

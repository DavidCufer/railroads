/** Phase 90 step 1 probe: what the strong bot sees at the start of a game. `npx tsx tools/bench/freight90.ts <startYear> [seed]`
 * Prints the ranked candidate projects (label, payback years, total cost) and the industries' monthly output. */
import "./p79Env";
import "./p90Env";
import { PAX } from "../../src/data/passengerModels";
import { createStrongBot } from "./strongBot";
import { createGameState } from "../../src/sim/state";
import { INDUSTRIES } from "../../src/data/industries";

PAX.model = (process.env["PAX_MODEL"] ?? "today") as typeof PAX.model;
const startYear = Number(process.argv[2] ?? 1870);
const seed = Number(process.argv[3] ?? 1);
const state = createGameState({ seed, region: "central-eu", startYear, difficulty: "normal" });
const bot = createStrongBot(state);
const months = Number(process.argv[4] ?? 1);
for (let m = 0; m < months; m++) {
  bot.monthA();
  bot.monthB(m % 12);
}
const labels = bot.candidateLabels();
console.log(`# ${startYear} seed ${seed}: ${labels.length} candidates`);
for (const l of labels.slice(0, 40)) console.log(l);
const kinds = new Map<string, number>();
for (const i of state.industries) kinds.set(i.type, (kinds.get(i.type) ?? 0) + 1);
console.log(
  "industries: " +
    [...kinds]
      .map(([k, n]) => `${k}x${n}(${JSON.stringify(INDUSTRIES[k as "coalMine"].produces)})`)
      .join(" "),
);
const big = [...state.cities].sort((a, b) => b.population - a.population).slice(0, 8);
console.log("cities: " + big.map((c) => `${c.name} ${c.population}`).join(", "));

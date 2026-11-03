/**
 * Phase 82 item 7: the Strategist plays a scenario through its real goal.
 * `npx tsx tools/bench/strategist/scenario.ts <scenarioId> [--v2] [--startCash N]`
 * Prints `SCENARIO <id>: <status> stars <n> finish <year> ...`; `--v2` plays the plain V2 policy (no lookahead) for comparison.
 */
import { createGameState } from "../../../src/sim/state";
import { scenarioById, scenarioNewGameOptions } from "../../../src/data/scenarios";
import { netWorth } from "../../../src/sim/finance/ledger";
import { ledgerOperatingProfit } from "../../../src/data/finance";
import { createStrongBot } from "../strongBot";
import { attachStrategist } from "./strategist";

const id = process.argv[2] ?? "silverRush";
const plain = process.argv.includes("--v2");
const def = scenarioById(id);
if (!def) throw new Error(`no scenario ${id}`);
const cashArg = process.argv.indexOf("--startCash");
const state = createGameState(scenarioNewGameOptions(def));
if (cashArg > 0) state.cash = Number(process.argv[cashArg + 1]);
const bot = createStrongBot(state);
const stats = plain ? null : attachStrategist(bot);
const t0 = Date.now();
const lastYear = (def.goal.type === "survive" ? def.goal.untilYear : def.goal.byYear) + 1;
let months = 0;
while (state.scenario?.status === "active" && bot.year() <= lastYear) {
  bot.monthA();
  bot.monthB(Math.floor(state.ticks / 720) % 12);
  months++;
  if (state.finance.bankrupt) break;
}
const run = state.scenario!;
const profit = Math.round(ledgerOperatingProfit(state.finance.lastYear) / 1000);
console.log(
  `SCENARIO ${id}${plain ? " (V2)" : ""}: ${run.status} stars ${run.stars} ${run.reason ?? ""} finish year ${bot.year()} month ${months % 12} profit ${profit}k NW ${(netWorth(state) / 1e6).toFixed(2)}M progress ${Math.round(run.progress)} cash ${Math.round(state.cash / 1000)}k loans ${Math.round(state.finance.loans / 1000)}k time ${Math.round((Date.now() - t0) / 1000)}s${stats ? ` decisions ${stats.decisions} picks ${JSON.stringify(stats.picks)}` : ""}`,
);

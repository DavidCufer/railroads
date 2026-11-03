import { createGameState } from "../../../src/sim/state";
import { scenarioById, scenarioNewGameOptions } from "../../../src/data/scenarios";
import { netWorth } from "../../../src/sim/finance/ledger";
import { createStrongBot } from "../strongBot";
const move = process.argv[2] ?? "pax Washington-Richmond";
const state = createGameState(scenarioNewGameOptions(scenarioById("panic1873")!));
const bot = createStrongBot(state);
bot.setRepayKeep(300_000);
let first = true;
bot.setChooser((o) => {
  if (bot.lines.length >= 2) return null;
  if (first) {
    first = false;
    return o.some((x) => x.label === move) ? move : null;
  }
  return o[0]?.label ?? null;
});
for (let m = 0; m < 20; m++) {
  bot.monthA();
  bot.monthB(Math.floor(state.ticks / 720) % 12);
  const f = state.finance;
  console.log(
    m,
    `cash ${Math.round(state.cash / 1000)}k loans ${Math.round(f.loans / 1000)}k NW ${(netWorth(state) / 1e6).toFixed(2)}M negMonths ${f.negativeCashMonths} bankrupt ${f.bankrupt} lines ${bot.lines.length} trains ${state.trains.length}`,
  );
  if (f.bankrupt) break;
}

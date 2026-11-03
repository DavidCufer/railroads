import { createGameState } from "../../../src/sim/state";
import { scenarioById, scenarioNewGameOptions } from "../../../src/data/scenarios";
import { createStrongBot } from "../strongBot";
const state = createGameState(scenarioNewGameOptions(scenarioById("silverRush")!));
const bot = createStrongBot(state);
bot.setGoalLabels(["chain"]);
for (let m = 0; m < 4; m++) {
  bot.monthA();
  bot.monthB(Math.floor(state.ticks / 720) % 12);
  console.log("month", m, "lines", bot.lines.length, "hasGoalMove", bot.hasGoalMove());
}

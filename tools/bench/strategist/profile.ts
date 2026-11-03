import { createGameState } from "../../../src/sim/state";
import { createStrongBot } from "../strongBot";
import { forkBot } from "./fork";
const state = createGameState({
  seed: 1,
  region: "central-eu",
  startYear: 1870,
  difficulty: "normal",
});
const bot = createStrongBot(state);
const mo = (b: ReturnType<typeof createStrongBot>): number => Math.floor(b.state.ticks / 720) % 12;
for (let i = 0; i < 48; i++) {
  bot.monthA();
  bot.monthB(mo(bot));
}
console.log("trains", bot.state.trains.length, "stations", bot.state.stations.length);
for (const months of [1, 6, 18]) {
  const t = Date.now();
  const f = forkBot(bot);
  f.setCandidateBudget(1);
  for (let i = 0; i < months; i++) {
    f.monthA();
    f.monthB(mo(f));
  }
  console.log(months, "months, budget 1: ms", Date.now() - t);
}

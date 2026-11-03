import { createGameState } from "../../../src/sim/state";
import { createStrongBot } from "../strongBot";
import { forkState } from "./fork";
import { advanceOneHour } from "../../../src/sim/tick";
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
const time = (label: string, s: typeof state): void => {
  const t = Date.now();
  for (let i = 0; i < 720; i++) advanceOneHour(s);
  console.log(label, "720 hours ms", Date.now() - t);
};
const f = forkState(state);
const f2 = forkState(state);
time("original", state);
time("fork a", f);
time("fork a again", f);
time("fork b", f2);

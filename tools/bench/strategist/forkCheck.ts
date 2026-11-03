import { createGameState } from "../../../src/sim/state";
import { createStrongBot } from "../strongBot";
import { forkBot } from "./fork";
import { netWorth } from "../../../src/sim/finance/ledger";

const start = Number(process.argv[2] ?? 1870);
const state = createGameState({
  seed: 1,
  region: "central-eu",
  startYear: start,
  difficulty: "normal",
});
const bot = createStrongBot(state);
const play = (b: ReturnType<typeof createStrongBot>, months: number, m0: number): void => {
  for (let m = 0; m < months; m++) {
    b.monthA();
    b.monthB((m0 + m) % 12);
  }
};
play(bot, 24, 0);
const t = Date.now();
const f = forkBot(bot);
console.log("fork ms", Date.now() - t);
const sig = (b: ReturnType<typeof createStrongBot>): string =>
  `${b.state.ticks} cash ${Math.round(b.state.cash)} NW ${Math.round(netWorth(b.state))} trains ${b.state.trains.length} stations ${b.state.stations.length} edges ${b.state.trackGraph.allEdges().length} loans ${b.state.finance.loans} lines ${b.lines.length}`;
console.log("at fork   ", sig(bot), "|", sig(f));
play(bot, 12, 0);
play(f, 12, 0);
console.log("orig +1y  ", sig(bot));
console.log("fork +1y  ", sig(f));
console.log(sig(bot) === sig(f) ? "FORK IDENTICAL" : "FORK DIVERGED");

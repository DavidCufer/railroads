import { createGameState } from "../../../src/sim/state";
import { scenarioById, scenarioNewGameOptions } from "../../../src/data/scenarios";
const s = createGameState(scenarioNewGameOptions(scenarioById("silverRush")!));
const W = s.map.width;
const xy = (t: number): string => `(${t % W},${Math.floor(t / W)})`;
console.log(
  "W",
  W,
  "smelter",
  xy(79647),
  "station4",
  xy(79081),
  "mine",
  xy(72168),
  "station6",
  xy(72738),
  "mint",
  xy(46502),
  "station5",
  xy(47070),
);
for (const i of s.industries)
  if (["smelter", "silverMine", "mint"].includes(i.type))
    console.log(i.type, i.x, i.y, JSON.stringify(Object.keys(i)));

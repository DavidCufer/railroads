/**
 * Benchmark: farm -> Food Plant -> town chain (PLAYTEST-3 BAL1). Run with `npx tsx tools/bench/chain.ts [growthMult] [years] [foodTrains]`;
 * prints the revenue of both legs per year. The farm's growth multiplier is fixed (default 3 = fully grown).
 */
import { buildStation, buildTrack, buyTrain, setOrders } from "../../src/sim/commands";
import { INDUSTRIES } from "../../src/data/industries";
import { advanceOneHour } from "../../src/sim/tick";
import { makeTestMap, makeTestState, tileAt } from "../../tests/sim/track/helpers";
import type { City, Industry } from "../../src/sim/economy/types";

const mult = Number(process.argv[2] ?? 3);
const years = Number(process.argv[3] ?? 4);
const foodTrains = Number(process.argv[4] ?? 1);
const leg = 24;
const width = leg * 2 + 3;
const rows = Array.from({ length: 3 }, () => "p".repeat(width));
const map = makeTestMap(rows);
const state = makeTestState(map, { startYear: 1848, cash: 5e7 });

map.industryId[tileAt(map, 0, 0)] = 0;
map.industryId[tileAt(map, leg, 0)] = 1;
state.industries.push(
  { id: 0, type: "farm", x: 0, y: 0 } as Industry,
  {
    id: 1,
    type: "foodPlant",
    x: leg,
    y: 0,
  } as Industry,
);
state.industryEconomy.set(0, {
  inputStock: {},
  monthlyOutput: { grain: 60 * mult },
  growthMult: mult,
});
state.industryEconomy.set(1, { inputStock: {}, monthlyOutput: {} });
const cx = leg * 2 + 1;
const city: City = {
  id: 0,
  name: "Marketville",
  tier: "city",
  population: 40_000,
  anchorX: cx,
  anchorY: 0,
  tiles: [tileAt(map, cx, 0), tileAt(map, cx + 1, 0), tileAt(map, cx, 1), tileAt(map, cx + 1, 1)],
  coastal: false,
};
for (const t of city.tiles) map.cityId[t] = 0;
state.cities.push(city);

const path = Array.from({ length: width }, (_, x) => tileAt(map, x, 1));
if (!buildTrack(state, path).ok) throw new Error("track");
buildStation(state, tileAt(map, 0, 1), "depot");
buildStation(state, tileAt(map, leg, 1), "depot");
buildStation(state, tileAt(map, leg * 2, 1), "station");
const [a, b, c] = state.stations as unknown as Array<{ id: number; hasEngineShed: boolean }>;
b!.hasEngineShed = true;
const LOCO = "american-4-4-0";
const order = (x: number, y: number) => [
  { stationId: x, rule: "auto" as const },
  { stationId: y, rule: "auto" as const },
];
for (let i = 0; i < 2; i++) {
  if (!buyTrain(state, a!.id, LOCO, ["grain", "grain", "grain", "grain"]).ok)
    throw new Error("grain");
  setOrders(state, state.trains[state.trains.length - 1]!.id, order(a!.id, b!.id));
}
for (let i = 0; i < foodTrains; i++) {
  if (!buyTrain(state, b!.id, LOCO, ["food", "food", "food", "food"]).ok) throw new Error("food");
  setOrders(state, state.trains[state.trains.length - 1]!.id, order(b!.id, c!.id));
}

const def = INDUSTRIES.foodPlant;
console.log(`growthMult ${mult}, plant base ${JSON.stringify(def.produces)}`);
for (let y = 1; y <= years; y++) {
  for (let h = 0; h < 360 * 24; h++) advanceOneHour(state);
  const rev = (cargo: "grain" | "food"): number => {
    let sum = 0;
    for (const f of state.stationFlow.values()) sum += f.lastYear[cargo]?.revenue ?? 0;
    return sum;
  };
  const econ = state.industryEconomy.get(1)!;
  console.log(
    `year ${y}: grain $${Math.round(rev("grain"))}  food $${Math.round(rev("food"))}  plant stock ${JSON.stringify(econ.inputStock)} out/mo ${JSON.stringify(econ.monthlyOutput)}`,
  );
}

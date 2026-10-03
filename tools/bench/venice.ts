/** PLAN Phase 35 item 6: "$0 fares earned" at Venice. Venice–Milan from 1840 with 4 passenger trains; prints Venice's
 * monthly results as the panel reads them. `npx tsx tools/bench/venice.ts [startYear] [trains] [months] [cityB]` */
import * as commands from "../../src/sim/commands";
import { createGameState } from "../../src/sim/state";
import { advanceOneHour } from "../../src/sim/tick";
import { findBuildPath } from "../../src/sim/track/pathfind";
import { getStationFlow } from "../../src/sim/stations/flow";

const [, , y0 = "1840", nArg = "4", monthsArg = "26", nameB = "Milan"] = process.argv;
const startYear = Number(y0);
const state = createGameState({ seed: 1, region: "central-eu", startYear, difficulty: "normal" });
state.cash = 50_000_000;
const city = (nm: string) => state.cities.find((c) => c.name === nm)!;
const A = city("Venice");
const B = city(nameB);
const ctr = (c: typeof A) => c.anchorY * state.map.width + c.anchorX;
const path = findBuildPath(state.map, ctr(A), ctr(B), startYear, {})!;
const ok = (r: unknown) => (r as { ok: boolean }).ok;
if (!ok(commands.buildTrack(state, path))) throw new Error("track");
if (!ok(commands.buildStation(state, ctr(A), "station"))) throw new Error("station A");
if (!ok(commands.buildStation(state, ctr(B), "station"))) throw new Error("station B");
const [sa, sb] = [state.stations[0]!, state.stations[1]!];
for (let i = 0; i < Number(nArg); i++) {
  const r = commands.buyTrain(state, sa.id, "norris-4-2-0", [
    "passengers",
    "passengers",
    "passengers",
  ]);
  if (!ok(r)) throw new Error(JSON.stringify(r));
  const t = state.trains[state.trains.length - 1]!;
  const o = i % 2 === 0 ? [sa, sb] : [sb, sa];
  commands.setOrders(
    state,
    t.id,
    o.map((s) => ({ stationId: s.id, rule: "auto" as const })),
  );
}
for (let m = 1; m <= Number(monthsArg); m++) {
  for (let i = 0; i < 30 * 24; i++) advanceOneHour(state);
  const f = getStationFlow(state, sa.id);
  const pile = state.stationCargo.get(sa.id)?.passengers;
  const eco = state.stationEconomy.get(sa.id);
  const cur = (p: typeof f.month) => p.passengers;
  const lm = cur(f.lastMonth);
  console.log(
    `m${String(m).padStart(2)} y${state.ticks} supply ${Math.round(eco?.supply.passengers ?? 0)}/mo waiting ${Math.round(pile?.amount ?? 0)} | last month: sent ${Math.round(lm?.sent ?? 0)} fares $${Math.round(lm?.revenue ?? 0)} lost ${Math.round(lm?.lostUnits ?? 0)} | this month: sent ${Math.round(cur(f.month)?.sent ?? 0)} fares $${Math.round(cur(f.month)?.revenue ?? 0)}`,
  );
}

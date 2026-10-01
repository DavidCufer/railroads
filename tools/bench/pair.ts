/** Controlled pair test: `npx tsx tools/bench/pair.ts <startYear> <difficulty> <cityA> <cityB> <locoId> <nTrains> <years> [double]` — one pair of cities,
 * Stations, n trains of one engine, single track unless `double`; prints cash growth per year (PLAYTEST-2 "Hard vs Normal"). */
import * as commands from "../../src/sim/commands";
import { createGameState } from "../../src/sim/state";
import { advanceOneHour } from "../../src/sim/tick";
import { findBuildPath } from "../../src/sim/track/pathfind";
import { locomotiveById } from "../../src/data/trains";
import { netWorth } from "../../src/sim/finance/ledger";

const [, , y0, diff, nameA, nameB, loco, n, yrs, dbl] = process.argv;
const startYear = Number(y0);
const state = createGameState({
  seed: 1,
  region: "central-eu",
  startYear,
  difficulty: diff as "normal",
});
state.cash = 50_000_000; // unlimited cash, as in the PLAYTEST-2 pair tests
const city = (nm: string) => state.cities.find((c) => c.name === nm)!;
const A = city(nameA!),
  B = city(nameB!);
const ctr = (c: typeof A) => c.anchorY * state.map.width + c.anchorX;
const path = findBuildPath(state.map, ctr(A), ctr(B), startYear, {})!;
const ok = (r: unknown) => (r as { ok: boolean }).ok;
if (!ok(commands.buildTrack(state, path))) throw new Error("track");
if (dbl) commands.upgradeTrack(state, path);
if (
  !ok(commands.buildStation(state, ctr(A), "station")) ||
  !ok(commands.buildStation(state, ctr(B), "station"))
)
  throw new Error("station");
const sa = state.stations[0]!,
  sb = state.stations[1]!;
// WAREHOUSE=1: a Warehouse at both ends (PLAYTEST-2 exploit 1)
if (process.env.WAREHOUSE)
  for (const st of [sa, sb]) commands.buildImprovement(state, st.id, "warehouse");
const L = locomotiveById(loco!)!;
// RULE=fullLoad|auto, MAIL=<number of mail cars> (default 0)
const rule = (process.env.RULE ?? "auto") as "auto" | "fullLoad";
const mailCars = Number(process.env.MAIL ?? 0);
const nCars = Math.min(L.maxCars, 6);
const cars = Array.from({ length: nCars }, (_, i) =>
  i >= nCars - mailCars ? ("mail" as const) : ("passengers" as const),
);
const start = state.cash;
for (let i = 0; i < Number(n); i++) {
  const r = commands.buyTrain(state, sa.id, loco!, cars);
  if (!ok(r)) throw new Error("train " + JSON.stringify(r));
  const t = state.trains[state.trains.length - 1]!;
  const o = i % 2 === 0 ? [sa, sb] : [sb, sa];
  commands.setOrders(
    state,
    t.id,
    o.map((s) => ({ stationId: s.id, rule })),
  );
}
const invested = start - state.cash;
const out: string[] = [];
let prev = state.cash;
for (let y = 1; y <= Number(yrs); y++) {
  for (let i = 0; i < 360 * 24; i++) advanceOneHour(state);
  out.push(`y${y} ${Math.round((state.cash - prev) / 1000)}k`);
  prev = state.cash;
}
console.log(
  `${startYear} ${diff} ${nameA}-${nameB} ${n}x${loco} path ${path.length} invested ${Math.round(invested / 1000)}k | ${out.join(" ")} | NW ${Math.round(netWorth(state) / 1000)}k`,
);
const ly = state.finance.lastYear;
console.log(
  `last year: passengers ${Math.round(ly.passengers / 1000)}k, mail ${Math.round(ly.mail / 1000)}k (${Math.round((100 * ly.mail) / (ly.passengers + ly.mail))} % mail), rule ${rule}`,
);

/** PLAN Phase 43 item 2: the owner's scenario. central-eu, 1842 start, Venice–Milan with N Norris × 5 passenger cars
 * (default 18) plus one Venice–Trieste train. After 2 years prints each train's profit per year (lifetime books),
 * its load, and the Venice–Milan line total. `npx tsx tools/bench/owner.ts [trains=18] [years=2] [start=1842]` */
import * as commands from "../../src/sim/commands";
import { createGameState } from "../../src/sim/state";
import { advanceOneHour } from "../../src/sim/tick";
import { findBuildPath } from "../../src/sim/track/pathfind";
import { booksProfit } from "../../src/sim/trains/profit";
import { HOURS_PER_DAY, DAYS_PER_YEAR } from "../../src/sim/time";

const [, , nArg = "18", yrsArg = "2", y0 = "1842"] = process.argv;
const n = Number(nArg);
const years = Number(yrsArg);
const startYear = Number(y0);
const state = createGameState({ seed: 1, region: "central-eu", startYear, difficulty: "normal" });
state.cash = 50_000_000;
const city = (nm: string) => state.cities.find((c) => c.name === nm)!;
const ctr = (c: { anchorX: number; anchorY: number }) => c.anchorY * state.map.width + c.anchorX;
const ok = (r: unknown) => (r as { ok: boolean }).ok;
const [V, M, T] = [city("Venice"), city("Milan"), city("Trieste")];
const pathVM = findBuildPath(state.map, ctr(V), ctr(M), startYear, {})!;
if (!ok(commands.buildTrack(state, pathVM))) throw new Error("track Milan");
// Trieste branches off the Milan line a few tiles out of Venice (a junction, not a sharp turn at the platform).
let branched = false;
for (let k = 3; k < pathVM.length - 1 && !branched; k++) {
  const p2 = findBuildPath(state.map, ctr(T), pathVM[k]!, startYear, {});
  if (p2 && ok(commands.buildTrack(state, p2))) branched = true;
}
if (!branched) throw new Error("track Trieste");
for (const c of [V, M, T])
  if (!ok(commands.buildStation(state, ctr(c), "station"))) throw new Error("station " + c.name);
const st = (c: typeof V) => state.stations.find((s) => s.tile === ctr(c))!;
const [sv, sm, stt] = [st(V), st(M), st(T)];
const cars = Array.from({ length: 5 }, () => "passengers" as const);
const buy = (from: typeof sv, to: typeof sv, flip: boolean) => {
  const r = commands.buyTrain(state, from.id, "norris-4-2-0", cars);
  if (!ok(r)) throw new Error("train " + JSON.stringify(r));
  const t = state.trains[state.trains.length - 1]!;
  const o = flip ? [to, from] : [from, to];
  commands.setOrders(
    state,
    t.id,
    o.map((s) => ({ stationId: s.id, rule: "auto" as const })),
  );
  return t;
};
const line: number[] = [];
for (let i = 0; i < n; i++) line.push(buy(sv, sm, i % 2 === 1).id);
const trieste = buy(sv, stt, false);
const loadSum = new Map<number, [number, number]>();
for (let i = 0; i < years * DAYS_PER_YEAR * HOURS_PER_DAY; i++) {
  advanceOneHour(state);
  // Load factor over the hours a train is between stations (what a passenger sees on board).
  for (const t of state.trains) {
    if (t.status !== "moving") continue;
    const cap = t.cars.length * 40;
    const used = t.cars.reduce((u, c) => u + c.loadedUnits, 0);
    const e = loadSum.get(t.id) ?? [0, 0];
    e[0] += used / cap;
    e[1] += 1;
    loadSum.set(t.id, e);
  }
}
const perYear = (t: (typeof state.trains)[0]) =>
  booksProfit(t.profit.lifetime) /
  Math.max(0.25, (state.ticks - t.purchaseTick) / HOURS_PER_DAY / DAYS_PER_YEAR);
const rows = line.map((id) => state.trains.find((t) => t.id === id)!);
let total = 0;
const prof: number[] = [];
for (const t of rows) {
  const p = perYear(t);
  total += p;
  prof.push(p);
}
const movingHours =
  rows.reduce((a, t) => a + (loadSum.get(t.id)?.[1] ?? 0), 0) / rows.length / years;
console.log(
  `hours moving per train per year: ${Math.round(movingHours)} of ${DAYS_PER_YEAR * HOURS_PER_DAY}`,
);
console.log(
  `distance per train per year (odometer units): ${Math.round(rows.reduce((a, t) => a + t.distanceTraveled, 0) / rows.length / years)}`,
);
const loadOf = (id: number) => {
  const e = loadSum.get(id);
  return e && e[1] ? e[0] / e[1] : 0;
};
const avgLoad = rows.reduce((s, t) => s + loadOf(t.id), 0) / rows.length;
// Profit against load, train by train: the load at which a train covers its own costs (least-squares zero crossing).
{
  const xs = rows.map((t) => loadOf(t.id) * 100);
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = prof.reduce((a, b) => a + b, 0) / prof.length;
  let sxy = 0;
  let sxx = 0;
  xs.forEach((x, k) => {
    sxy += (x - mx) * (prof[k]! - my);
    sxx += (x - mx) ** 2;
  });
  const slope = sxx > 0 ? sxy / sxx : 0;
  const be = slope > 0 ? mx - my / slope : NaN;
  console.log(
    `break-even load (profit vs load fit over ${rows.length} trains): ${Number.isFinite(be) ? Math.round(be) + " %" : "n/a"} (loads ${Math.round(Math.min(...xs))}-${Math.round(Math.max(...xs))} %)`,
  );
}
const sorted = [...prof].sort((a, b) => b - a);
console.log(`${startYear} Venice–Milan ${n} Norris x5 + 1 Venice–Trieste, after ${years} years`);
console.log(
  "train profit/yr ($k), best first: " + sorted.map((p) => Math.round(p / 1000)).join(" "),
);
const rev = rows.reduce((s, t) => s + t.profit.lifetime.revenue, 0) / years;
const cost = rev - total;
console.log(
  `line: revenue/yr ${Math.round(rev / 1000)}k, costs/yr ${Math.round(cost / 1000)}k, profit/yr ${Math.round(total / 1000)}k; profitable trains ${prof.filter((p) => p > 0).length}/${n}, losing ${prof.filter((p) => p < 0).length}`,
);
const sum = (k: "revenue" | "running" | "wages" | "wear" | "repairs") =>
  Math.round(rows.reduce((a, t) => a + (t.profit.lifetime[k] ?? 0), 0) / years / rows.length);
console.log(
  `per train per year ($): revenue ${sum("revenue")}, running ${sum("running")} (fuel, servicing, cars), wages ${sum("wages")}, wear ${sum("wear")}, repairs ${sum("repairs")}`,
);
console.log(
  `average load of the Venice–Milan trains while running: ${Math.round(avgLoad * 100)} %`,
);
console.log(
  `Venice–Trieste train: profit/yr ${Math.round(perYear(trieste) / 1000)}k; Venice waiting ${Math.round(state.stationCargo.get(sv.id)?.passengers?.amount ?? 0)}`,
);

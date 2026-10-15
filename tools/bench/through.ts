/** PLAN Phase 48 item 4(b): Trieste–Venice–Milan, 1842. One through line (Trieste, Venice, Milan, Venice) with N trains
 * against two shuttles (Trieste–Venice and Venice–Milan) sharing the same N trains and cars. Prints the total profit a
 * year of each. `npx tsx tools/bench/through.ts [trains=4] [years=2] [start=1842]`; `LOCO`, `CARS` as in owner.ts. */
import * as commands from "../../src/sim/commands";
import { createGameState } from "../../src/sim/state";
import { advanceOneHour } from "../../src/sim/tick";
import { findBuildPath } from "../../src/sim/track/pathfind";
import { booksProfit } from "../../src/sim/trains/profit";
import { HOURS_PER_DAY, DAYS_PER_YEAR } from "../../src/sim/time";

const [, , nArg = "4", yrsArg = "2", y0 = "1842"] = process.argv;
const n = Number(nArg);
const years = Number(yrsArg);
const startYear = Number(y0);
/** The line END - MID - FAR; the engine shed is at MID. */
const MID = process.env["MID"] ?? "Venice";
const FAR = process.env["FAR"] ?? "Milan";
const END = process.env["END"] ?? "Trieste";
const LOCO = process.env["LOCO"] ?? "norris-4-2-0";
const NCARS = Number(process.env["CARS"] ?? 5);

function run(
  mode: "through" | "shuttles",
  seed: number,
): { profit: number; revenue: number; onTV: number } {
  const state = createGameState({ seed, region: "central-eu", startYear, difficulty: "normal" });
  state.cash = 50_000_000;
  const city = (nm: string) => state.cities.find((c) => c.name === nm)!;
  const ctr = (c: { anchorX: number; anchorY: number }) => c.anchorY * state.map.width + c.anchorX;
  const ok = (r: unknown) => (r as { ok: boolean }).ok;
  const [V, M, T] = [city(MID), city(FAR), city(END)];
  // One direct line END - FAR (no detour, no junction) with MID's station on the tile of it nearest that town.
  // Double track by default: the bench compares service patterns, not how a single line copes with meeting trains
  // (DOUBLE=0 for a single line).
  const line = findBuildPath(state.map, ctr(T), ctr(M), startYear, {})!;
  if (!ok(commands.buildTrack(state, line))) throw new Error("track");
  if (process.env["DOUBLE"] !== "0" && !ok(commands.upgradeTrack(state, line)))
    throw new Error("double track");
  const w = state.map.width;
  const off = (t: number) => Math.hypot((t % w) - V.anchorX, Math.floor(t / w) - V.anchorY);
  const midTile = line.reduce((best, t) => (off(t) < off(best) ? t : best));
  const tileOf = new Map([
    [V.name, midTile],
    [M.name, ctr(M)],
    [T.name, ctr(T)],
  ]);
  for (const c of [V, M, T])
    if (!ok(commands.buildStation(state, tileOf.get(c.name)!, "station")))
      throw new Error("station " + c.name);
  const st = (c: typeof V) => state.stations.find((s) => s.tile === tileOf.get(c.name))!;
  const [sv, sm, stt] = [st(V), st(M), st(T)];
  // Track length of each leg: the shuttles share the N trains in that proportion (the through trains spend their time
  // in the same proportion), so the comparison is the service pattern, not an arbitrary 50/50 split.
  const legTV = line.indexOf(midTile);
  const legVM = line.length - legTV;
  const cars = Array.from({ length: NCARS }, () => "passengers" as const);
  const ids: number[] = [];
  const buy = (at: typeof sv, stops: Array<typeof sv>) => {
    const r = commands.buyTrain(state, at.id, LOCO, cars);
    if (!ok(r)) throw new Error("train " + JSON.stringify(r));
    const t = state.trains[state.trains.length - 1]!;
    commands.setOrders(
      state,
      t.id,
      stops.map((s) => ({ stationId: s.id, rule: "auto" as const })),
    );
    ids.push(t.id);
  };
  const onTV = Math.min(n - 1, Math.max(1, Math.round((n * legTV) / (legTV + legVM))));
  for (let i = 0; i < n; i++) {
    if (mode === "through") buy(sv, i % 2 ? [sm, sv, stt, sv] : [stt, sv, sm, sv]);
    else if (i < onTV) buy(sv, [stt, sv]);
    else buy(sv, [sv, sm]);
  }
  for (let i = 0; i < years * DAYS_PER_YEAR * HOURS_PER_DAY; i++) advanceOneHour(state);
  let profit = 0;
  let revenue = 0;
  for (const id of ids) {
    const t = state.trains.find((x) => x.id === id)!;
    const yrs = Math.max(0.25, (state.ticks - t.purchaseTick) / HOURS_PER_DAY / DAYS_PER_YEAR);
    profit += booksProfit(t.profit.lifetime) / yrs;
    revenue += t.profit.lifetime.revenue / yrs;
  }
  return { profit, revenue, onTV };
}

/** Mean over a few seeds (breakdowns and the like make one run noisy by about +-20 %). */
const SEEDS = Array.from({ length: Number(process.env["SEEDS"] ?? 3) }, (_, i) => i + 1);
const mean = (mode: "through" | "shuttles") => {
  const runs = SEEDS.map((seed) => run(mode, seed));
  const avg = (f: (r: (typeof runs)[number]) => number) =>
    runs.reduce((a, r) => a + f(r), 0) / runs.length;
  return { profit: avg((r) => r.profit), revenue: avg((r) => r.revenue), onTV: runs[0]!.onTV };
};
const through = mean("through");
const shuttles = mean("shuttles");
const k = (x: number) => `${Math.round(x / 1000)}k`;
console.log(
  `${startYear} ${END}–${MID}–${FAR}, ${n} ${LOCO} x${NCARS}, ${years} years, ${SEEDS.length} seeds: through line profit/yr ${k(through.profit)} (revenue ${k(through.revenue)}); two shuttles (${shuttles.onTV} + ${n - shuttles.onTV} trains) profit/yr ${k(shuttles.profit)} (revenue ${k(shuttles.revenue)})`,
);

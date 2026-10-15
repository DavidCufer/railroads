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

function run(mode: "through" | "shuttles"): { profit: number; revenue: number } {
  const state = createGameState({ seed: 1, region: "central-eu", startYear, difficulty: "normal" });
  state.cash = 50_000_000;
  const city = (nm: string) => state.cities.find((c) => c.name === nm)!;
  const ctr = (c: { anchorX: number; anchorY: number }) => c.anchorY * state.map.width + c.anchorX;
  const ok = (r: unknown) => (r as { ok: boolean }).ok;
  const [V, M, T] = [city(MID), city(FAR), city(END)];
  // Milan line from Venice's platform; Trieste joins it by the shortest branch that builds (a few tiles out of
  // Venice, as a junction rather than a sharp turn at the platform).
  const pathVM = findBuildPath(state.map, ctr(V), ctr(M), startYear, {})!;
  if (!ok(commands.buildTrack(state, pathVM))) throw new Error("track Milan");
  const branches: number[][] = [];
  for (let k = 3; k < pathVM.length - 1; k++) {
    const p2 = findBuildPath(state.map, ctr(T), pathVM[k]!, startYear, {});
    if (p2) branches.push(p2);
  }
  branches.sort((x, y) => x.length - y.length);
  if (!branches.some((p2) => ok(commands.buildTrack(state, p2)))) throw new Error("track Trieste");
  for (const c of [V, M, T])
    if (!ok(commands.buildStation(state, ctr(c), "station"))) throw new Error("station " + c.name);
  const st = (c: typeof V) => state.stations.find((s) => s.tile === ctr(c))!;
  const [sv, sm, stt] = [st(V), st(M), st(T)];
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
  for (let i = 0; i < n; i++) {
    if (mode === "through") buy(sv, i % 2 ? [sm, sv, stt, sv] : [stt, sv, sm, sv]);
    else if (i % 2 === 0) buy(sv, [stt, sv]);
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
  return { profit, revenue };
}

const through = run("through");
const shuttles = run("shuttles");
const k = (x: number) => `${Math.round(x / 1000)}k`;
console.log(
  `${startYear} ${END}–${MID}–${FAR}, ${n} ${LOCO} x${NCARS}, ${years} years: through line profit/yr ${k(through.profit)} (revenue ${k(through.revenue)}); two shuttles profit/yr ${k(shuttles.profit)} (revenue ${k(shuttles.revenue)})`,
);

/** Phase 55 item 4 (report only, nothing here changes a price or a cost): for each start year and every engine the
 * player can buy, its price, price as a share of the Normal start cash, maintenance and fuel a year, crew wages, and the
 * profit a train of it earns on the owner's line (Venice-Milan, central-eu: 2 trains x 5 cars, 2 years, lifetime books).
 * Then one candidate mechanism, measured without shipping it: fuel burnt scales with the power used, so an engine
 * burns a fixed share of its full-train rate even when it hauls little (`IDLE_FUEL_SHARE`, an assumption for the
 * measurement, not a sourced figure); the table shows what that does to the profit ranking.
 * `npx tsx tools/bench/engineCosts.ts [years=2] [trains=2] [cars=5]`, env `STARTS=1840,1870,...`. */
import { startingCashFor } from "../../src/data/finance";
import { buyableLocomotivesIn } from "../../src/data/trains";
import * as commands from "../../src/sim/commands";
import { priceIndex } from "../../src/data/economy";
import {
  fuelCostPerYearEstimate,
  locoRunningCostPerYear,
  trainWagesPerYear,
} from "../../src/sim/finance/costs";
import { carCapacity } from "../../src/sim/trains/capacity";
import { createGameState } from "../../src/sim/state";
import { advanceOneHour } from "../../src/sim/tick";
import { findBuildPath } from "../../src/sim/track/pathfind";
import { booksProfit } from "../../src/sim/trains/profit";
import { DAYS_PER_YEAR, HOURS_PER_DAY } from "../../src/sim/time";

const [, , yearsArg = "2", trainsArg = "2", carsArg = "5"] = process.argv;
const years = Number(yearsArg);
const N = Number(trainsArg);
const CARS = Number(carsArg);
const starts = (process.env["STARTS"] ?? "1840,1870,1900,1930,1950").split(",").map(Number);
/** Share of its full-train fuel rate an engine burns however little it hauls (assumed, see the header). */
const IDLE_FUEL_SHARE = 0.4;
const ok = (r: unknown): boolean => (r as { ok: boolean }).ok;

interface Row {
  id: string;
  price: number;
  train: number;
  pct: number;
  maint: number;
  fuel: number;
  wages: number;
  profit: number;
  load: number;
  profitIdleFuel: number;
}

function runOne(startYear: number, locoId: string, cars: number): Row | null {
  const state = createGameState({ seed: 1, region: "central-eu", startYear, difficulty: "normal" });
  const startCash = startingCashFor("normal", startYear);
  state.cash = 50_000_000;
  const city = (nm: string) => state.cities.find((c) => c.name === nm)!;
  const ctr = (c: { anchorX: number; anchorY: number }) => c.anchorY * state.map.width + c.anchorX;
  const [V, M] = [city("Venice"), city("Milan")];
  const path = findBuildPath(state.map, ctr(V), ctr(M), startYear, {});
  if (!path || !ok(commands.buildTrack(state, path))) return null;
  for (const c of [V, M]) if (!ok(commands.buildStation(state, ctr(c), "station"))) return null;
  const loco = buyableLocomotivesIn(startYear).find((l) => l.id === locoId)!;
  if (loco.type === "electric" && !ok(commands.electrifyTrack(state, path))) return null;
  const n = Math.min(cars, loco.maxCars);
  const sv = state.stations.find((s) => s.tile === ctr(V))!;
  const sm = state.stations.find((s) => s.tile === ctr(M))!;
  for (const s of [sv, sm]) commands.buildEngineShed(state, s.id);
  const plan = commands.computeBuyTrainPlan(state, locoId, []);
  const ids: number[] = [];
  for (let i = 0; i < N; i++) {
    const r = commands.buyTrain(
      state,
      sv.id,
      locoId,
      Array.from({ length: n }, () => "passengers" as const),
    );
    if (!ok(r)) return null;
    const t = state.trains[state.trains.length - 1]!;
    const o = i % 2 === 0 ? [sv, sm] : [sm, sv];
    commands.setOrders(
      state,
      t.id,
      o.map((s) => ({ stationId: s.id, rule: "auto" as const })),
    );
    ids.push(t.id);
  }
  let loadSum = 0;
  let loadN = 0;
  for (let i = 0; i < years * DAYS_PER_YEAR * HOURS_PER_DAY; i++) {
    advanceOneHour(state);
    for (const t of state.trains) {
      if (t.status !== "moving") continue;
      const cap = t.cars.reduce((u, c) => u + carCapacity(c), 0);
      const used = t.cars.reduce((u, c) => u + c.loadedUnits, 0);
      if (cap > 0) {
        loadSum += used / cap;
        loadN++;
      }
    }
  }
  const trains = ids.map((id) => state.trains.find((t) => t.id === id)!);
  const perYear = (t: (typeof trains)[0], v: number) =>
    v / Math.max(0.25, (state.ticks - t.purchaseTick) / HOURS_PER_DAY / DAYS_PER_YEAR);
  const profit = trains.reduce((s, t) => s + perYear(t, booksProfit(t.profit.lifetime)), 0) / N;
  // Fuel actually burnt: what the books call running, less the non-fuel running cost and the cars' upkeep.
  const running = trains.reduce((s, t) => s + perYear(t, t.profit.lifetime.running), 0) / N;
  const fixed = locoRunningCostPerYear(loco, 0, startYear) + 0; // cars' upkeep is small next to it
  const fuelActual = Math.max(0, running - fixed);
  // Candidate: the engine burns IDLE share of the rate it would burn at its reference length, whatever it hauls.
  const refShare = Math.min(1, n / loco.maxCars);
  const factor = (IDLE_FUEL_SHARE + (1 - IDLE_FUEL_SHARE) * refShare) / Math.max(0.05, refShare);
  return {
    id: locoId,
    price: plan.cost,
    train: commands.computeBuyTrainPlan(
      state,
      locoId,
      Array.from({ length: n }, () => "passengers" as const),
    ).cost,
    pct: (plan.cost / startCash) * 100,
    maint: loco.maintenancePerYear * priceIndex(startYear),
    fuel: fuelCostPerYearEstimate(loco, n, startYear),
    wages: trainWagesPerYear(loco, trains[0]!.cars, startYear),
    profit,
    load: loadN > 0 ? loadSum / loadN : 0,
    profitIdleFuel: profit - fuelActual * (factor - 1),
  };
}

const k = (v: number): string => `${Math.round(v / 1000)}k`;
for (const start of starts) {
  console.log(
    `\n### ${start}, Normal, start cash $${Math.round(startingCashFor("normal", start) / 1000)}k; Venice-Milan, ${N} trains x ${CARS} cars, ${years} years`,
  );
  console.log(
    "| engine | engine price | train price (engine + cars) | % of start cash (engine) | maintenance/yr | fuel/yr (typical) | wages/yr | profit/yr per train | load | profit/train price | profit/yr if fuel scales with power |",
  );
  console.log("|---|---|---|---|---|---|---|---|---|---|---|");
  for (const loco of buyableLocomotivesIn(start)) {
    const r = runOne(start, loco.id, CARS);
    if (!r) {
      console.log(`| ${loco.id} | (could not run) | | | | | | | | | |`);
      continue;
    }
    console.log(
      `| ${r.id} | ${k(r.price)} | ${k(r.train)} | ${r.pct.toFixed(0)} % | ${k(r.maint)} | ${k(r.fuel)} | ${k(r.wages)} | ${k(r.profit)} | ${(r.load * 100).toFixed(0)} % | ${(r.profit / r.train).toFixed(2)} | ${k(r.profitIdleFuel)} |`,
    );
  }
}

/**
 * Phase 89 passenger exploration bench, one run. `npx tsx tools/bench/pax89.ts <startYear> <seed> <years> [model=today] [bot=strong]`
 * (central-eu, Normal). The model comes from env PAX_MODEL or argv[5]; prints `ROW <json>` per completed year and a final
 * `RUN <json>` line with the means over years 3..N. Metrics (all from the real sim state):
 *   revenue split (stationFlow deliveredRevenue by cargo), money per passenger / freight train, trains per busy pair, the
 *   platform (pile against the arrival rate and against one train), the share of people turned away.
 */
import "./p79Env";
import "./pairEnv";
import { createStrongBot } from "./strongBot";
import { attachStrategist } from "./strategist/strategist";
import { createGameState } from "../../src/sim/state";
import { PAX } from "../../src/data/passengerModels";
import { booksProfit } from "../../src/sim/trains/profit";
import { carCapacity } from "../../src/sim/trains/capacity";
import { ledgerOperatingProfit, ledgerRevenue } from "../../src/data/finance";
import { netWorth } from "../../src/sim/finance/ledger";
import type { GameState } from "../../src/sim/state";
import type { Train } from "../../src/sim/trains/types";

const startYear = Number(process.argv[2] ?? 1870);
const seed = Number(process.argv[3] ?? 1);
const years = Number(process.argv[4] ?? 12);
const model = (process.argv[5] ?? process.env["PAX_MODEL"] ?? "today") as typeof PAX.model;
const botName = process.argv[6] ?? process.env["BOT"] ?? "strong";
PAX.model = model;

const state: GameState = createGameState({
  seed,
  region: "central-eu",
  startYear,
  difficulty: "normal",
});
const bot = createStrongBot(state);
if (botName === "strategist") attachStrategist(bot);

const isPax = (t: Train): boolean => t.cars.some((c) => c.cargoType === "passengers");
const isMail = (t: Train): boolean => !isPax(t) && t.cars.some((c) => c.cargoType === "mail");
const seatsOf = (t: Train): number =>
  t.cars.filter((c) => c.cargoType === "passengers").reduce((s, c) => s + carCapacity(c), 0);

interface Sample {
  stationMonths: number;
  /** pile / (30 days of arrivals): 1 = at the old ceiling */
  fullOfMonth: number;
  /** pile in whole trains: pile / seats of the biggest passenger train calling there */
  pileTrains: number;
  /** station-months with at least one full train waiting */
  overOneTrain: number;
  /** station-months with the pile above 3/4 of a month of arrivals */
  nearCeiling: number;
}
const sample: Sample = {
  stationMonths: 0,
  fullOfMonth: 0,
  pileTrains: 0,
  overOneTrain: 0,
  nearCeiling: 0,
};

function samplePlatforms(): void {
  const seats = new Map<number, number>();
  for (const t of state.trains) {
    if (t.laidUp || !isPax(t)) continue;
    const s = seatsOf(t);
    for (const o of t.orders) seats.set(o.stationId, Math.max(seats.get(o.stationId) ?? 0, s));
  }
  for (const [id, cap] of seats) {
    const eco = state.stationEconomy.get(id);
    const pool = eco?.passengerPool ?? 0;
    if (pool <= 0 || cap <= 0) continue;
    const pile = state.stationCargo.get(id)?.passengers?.amount ?? 0;
    sample.stationMonths++;
    sample.fullOfMonth += Math.min(2, pile / pool);
    sample.pileTrains += pile / cap;
    if (pile >= cap) sample.overOneTrain++;
    if (pile >= 0.75 * pool) sample.nearCeiling++;
  }
}

function round(x: number, d = 2): number {
  const k = 10 ** d;
  return Math.round(x * k) / k;
}

const rows: Array<Record<string, unknown>> = [];
const T0 = Date.now();
for (let y = 1; y <= years; y++) {
  for (let m = 0; m < 12; m++) {
    bot.monthA();
    bot.monthB(m);
    samplePlatforms();
    if (state.finance.bankrupt) break;
  }
  const last = state.finance.lastYear;
  // revenue by cargo from the stations' delivered fares
  const byCargo: Record<string, number> = {};
  let sentPax = 0;
  let lostPax = 0;
  for (const flow of state.stationFlow.values()) {
    for (const [cargo, f] of Object.entries(flow.lastYear)) {
      byCargo[cargo] = (byCargo[cargo] ?? 0) + (f?.deliveredRevenue ?? 0);
      if (cargo === "passengers") {
        sentPax += f?.sent ?? 0;
        lostPax += f?.lostUnits ?? 0;
      }
    }
  }
  const paxRev = byCargo["passengers"] ?? 0;
  const mailRev = byCargo["mail"] ?? 0;
  const delivered = Object.values(byCargo).reduce((s, v) => s + v, 0);
  const freightRev = delivered - paxRev - mailRev;
  // trains
  const paxT = state.trains.filter((t) => isPax(t) && !t.laidUp);
  const frT = state.trains.filter((t) => !isPax(t) && !isMail(t) && !t.laidUp);
  const avg = (ts: Train[], f: (t: Train) => number): number =>
    ts.length ? ts.reduce((s, t) => s + f(t), 0) / ts.length : 0;
  // pairs: for each unordered station pair that one passenger train calls at both, the trains that do
  const pairTrains = new Map<string, Set<number>>();
  const pairRev = new Map<string, number>();
  for (const t of paxT) {
    const ids = [...new Set(t.orders.map((o) => o.stationId))].sort((a, b) => a - b);
    for (let i = 0; i < ids.length; i++)
      for (let j = i + 1; j < ids.length; j++) {
        const k = `${ids[i]}-${ids[j]}`;
        if (!pairTrains.has(k)) pairTrains.set(k, new Set());
        pairTrains.get(k)!.add(t.id);
        pairRev.set(k, (pairRev.get(k) ?? 0) + t.profit.lastYear.revenue / (ids.length - 1));
      }
  }
  const busy = [...pairRev.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  const busyTrains = busy.map(([k]) => pairTrains.get(k)!.size);
  const row = {
    year: startYear + y,
    nw: round(netWorth(state) / 1e6),
    rev: round(ledgerRevenue(last) / 1e6),
    profit: round(ledgerOperatingProfit(last) / 1e6),
    paxRev: round(paxRev / 1e6),
    mailRev: round(mailRev / 1e6),
    freightRev: round(freightRev / 1e6),
    paxShare: delivered > 0 ? round(paxRev / delivered) : 0,
    paxTrains: paxT.length,
    freightTrains: frT.length,
    paxRevPerTrain: round(avg(paxT, (t) => t.profit.lastYear.revenue) / 1e3, 0),
    freightRevPerTrain: round(avg(frT, (t) => t.profit.lastYear.revenue) / 1e3, 0),
    paxProfitPerTrain: round(avg(paxT, (t) => booksProfit(t.profit.lastYear)) / 1e3, 0),
    freightProfitPerTrain: round(avg(frT, (t) => booksProfit(t.profit.lastYear)) / 1e3, 0),
    busyPairTrains: busyTrains,
    maxPairTrains: Math.max(0, ...[...pairTrains.values()].map((s) => s.size)),
    stationMonths: sample.stationMonths,
    platformFull: round(sample.stationMonths ? sample.fullOfMonth / sample.stationMonths : 0),
    pileTrains: round(sample.stationMonths ? sample.pileTrains / sample.stationMonths : 0),
    overOneTrain: round(sample.stationMonths ? sample.overOneTrain / sample.stationMonths : 0),
    nearCeiling: round(sample.stationMonths ? sample.nearCeiling / sample.stationMonths : 0),
    turnedAwayShare: sentPax + lostPax > 0 ? round(lostPax / (sentPax + lostPax)) : 0,
    bankrupt: state.finance.bankrupt,
  };
  rows.push(row);
  console.log("ROW " + JSON.stringify(row));
  Object.assign(sample, {
    stationMonths: 0,
    fullOfMonth: 0,
    pileTrains: 0,
    overOneTrain: 0,
    nearCeiling: 0,
  });
  if (state.finance.bankrupt) break;
}
const tail = rows.filter((r) => (r["year"] as number) - startYear >= 3);
const mean = (k: string): number =>
  tail.length ? tail.reduce((s, r) => s + (r[k] as number), 0) / tail.length : 0;
console.log(
  "RUN " +
    JSON.stringify({
      id: `${botName}/${model}/${startYear}/${seed}`,
      model,
      bot: botName,
      startYear,
      seed,
      years: rows.length,
      secs: Math.round((Date.now() - T0) / 1000),
      bankrupt: state.finance.bankrupt,
      final: rows.at(-1),
      mean: Object.fromEntries(
        [
          "paxShare",
          "paxRevPerTrain",
          "freightRevPerTrain",
          "paxProfitPerTrain",
          "freightProfitPerTrain",
          "maxPairTrains",
          "platformFull",
          "pileTrains",
          "overOneTrain",
          "nearCeiling",
          "turnedAwayShare",
          "paxTrains",
          "freightTrains",
        ].map((k) => [k, round(mean(k))]),
      ),
    }),
);

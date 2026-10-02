/** PLAN Phase 34 item 10: how revenue per train and ROI fall off as trains are added to ONE pair of cities.
 * `npx tsx tools/bench/pairScaling.ts [startYear] [cityA] [cityB] [locoId] [cars] [maxTrains] [years] [stationType]`
 * Prints, per train count: steady-state (last year) passenger revenue, people carried, load factor, revenue per
 * train, marginal revenue of the last train added, and its return on cost (marginal profit ÷ train price). */
import * as commands from "../../src/sim/commands";
import { PAIR_DEMAND } from "../../src/data/economy";

// PAIR="refTiles,distanceExponent,sizeExponent,sizeRatioLimit" overrides the pair-demand table for tuning runs.
if (process.env["PAIR"]) {
  const [ref, dist, size, limit] = process.env["PAIR"].split(",").map(Number);
  Object.assign(PAIR_DEMAND, {
    refDistanceTiles: ref ?? PAIR_DEMAND.refDistanceTiles,
    distanceExponent: dist ?? PAIR_DEMAND.distanceExponent,
    sizeExponent: size ?? PAIR_DEMAND.sizeExponent,
    sizeRatioLimit: limit ?? PAIR_DEMAND.sizeRatioLimit,
  });
}
import { createGameState } from "../../src/sim/state";
import { advanceOneHour } from "../../src/sim/tick";
import { findBuildPath } from "../../src/sim/track/pathfind";
import { locomotiveById } from "../../src/data/trains";
import { CARGO } from "../../src/data/cargo";
import { getStationFlow } from "../../src/sim/stations/flow";

const [
  ,
  ,
  y0 = "1847",
  nameA = "Venice",
  nameB = "Milan",
  loco = "norris-4-2-0",
  carsArg = "5",
  maxArg = "8",
  yrsArg = "3",
  stype = "station",
] = process.argv;
const startYear = Number(y0);
const years = Number(yrsArg);
const L = locomotiveById(loco)!;
const nCars = Math.min(Number(carsArg), L.maxCars);

interface Row {
  n: number;
  revenue: number;
  carried: number;
  load: number;
  profit: number;
  price: number;
  supply: number;
}

function run(n: number): Row {
  const state = createGameState({ seed: 1, region: "central-eu", startYear, difficulty: "normal" });
  state.cash = 50_000_000;
  const city = (nm: string) => state.cities.find((c) => c.name === nm)!;
  const A = city(nameA);
  const B = city(nameB);
  const ctr = (c: typeof A) => c.anchorY * state.map.width + c.anchorX;
  const path = findBuildPath(state.map, ctr(A), ctr(B), startYear, {})!;
  const ok = (r: unknown) => (r as { ok: boolean }).ok;
  if (!ok(commands.buildTrack(state, path))) throw new Error("track");
  if (process.env["DOUBLE"]) commands.upgradeTrack(state, path);
  if (
    !ok(commands.buildStation(state, ctr(A), stype)) ||
    !ok(commands.buildStation(state, ctr(B), stype))
  )
    throw new Error("station");
  const sa = state.stations[0]!;
  const sb = state.stations[1]!;
  const cars = Array.from({ length: nCars }, () => "passengers" as const);
  const start = state.cash;
  let price = 0;
  for (let i = 0; i < n; i++) {
    const before = state.cash;
    const r = commands.buyTrain(state, sa.id, loco, cars);
    if (!ok(r)) throw new Error("train " + JSON.stringify(r));
    price = before - state.cash;
    const t = state.trains[state.trains.length - 1]!;
    const o = i % 2 === 0 ? [sa, sb] : [sb, sa];
    commands.setOrders(
      state,
      t.id,
      o.map((s) => ({ stationId: s.id, rule: "auto" as const })),
    );
  }
  let prevCash = state.cash;
  let profit = 0;
  for (let y = 0; y < years; y++) {
    for (let i = 0; i < 360 * 24; i++) advanceOneHour(state);
    profit = state.cash - prevCash;
    prevCash = state.cash;
  }
  void start;
  const ly = state.finance.lastYear;
  const carried = [sa, sb].reduce(
    (sum, s) => sum + (getStationFlow(state, s.id).lastYear.passengers?.sent ?? 0),
    0,
  );
  const supply = [sa, sb].reduce(
    (s, st) => s + (state.stationEconomy.get(st.id)?.supply.passengers ?? 0),
    0,
  );
  const capacity = n * nCars * CARGO.passengers.capacity;
  void capacity;
  return { n, revenue: ly.passengers, carried, load: 0, profit, price, supply };
}

console.log(
  `${startYear} ${nameA}-${nameB} ${loco} x${nCars} passenger cars, ${stype}s, year ${years} figures`,
);
console.log(
  "trains | revenue | carried | supply/mo (both) | rev/train | marginal rev | marginal profit ÷ train price | cash growth",
);
let prev: Row | undefined;
for (const n of [1, 2, 3, 4, 5, 6, 8, 10, 12].filter((x) => x <= Number(maxArg))) {
  const r = run(n);
  const marg = prev ? (r.revenue - prev.revenue) / (r.n - prev.n) : r.revenue;
  const margProfit = prev ? (r.profit - prev.profit) / (r.n - prev.n) : r.profit;
  console.log(
    `${String(r.n).padStart(2)} | ${Math.round(r.revenue / 1000)}k | ${Math.round(r.carried)} | ${Math.round(r.supply)} | ${Math.round(r.revenue / r.n / 1000)}k | ${Math.round(marg / 1000)}k | ${Math.round((100 * margProfit) / r.price)}% | ${Math.round(r.profit / 1000)}k`,
  );
  prev = r;
}

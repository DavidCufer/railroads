/**
 * Benchmark: a scripted "good player" on a real-world region (docs/PLAYTEST-2.md "Benchmarks"). Not part of the test suite —
 * run it with `npx tsx tools/bench/goodPlayer.ts [region] [startYear] [difficulty] [endYear] [seed]`.
 *
 * Policy (the same for every build of the game, so before/after numbers are comparable; commands that only exist in newer
 * builds are used when present): connect the best unconnected city to the nearest connected one with a dedicated pair of
 * stations (Terminals in cities >= 40k from 1870, Stations otherwise) and double track from 1870, 2 trains of the fastest
 * engine per pair, add trains up to 4 per pair when cash allows, Post Office and Hotel in cities >= 40k, borrow when a good
 * project is short of cash and repay when cash piles up, relay worn track, rebuild washed-out bridges.
 */
import * as commands from "../../src/sim/commands";
import { PAIR_DEMAND, TRAVEL_RANGE_ANCHORS, TRIPS_PER_HEAD_ANCHORS } from "../../src/data/economy";

// PAIR="distanceExponent,sizeExponent,minDistanceTiles,maxShare" overrides the passenger-destination table for tuning
// runs; TRIPS=<factor> scales the trips-per-head table; RANGE=<factor> scales the travel range.
if (process.env["PAIR"]) {
  const [dist, size, minDist, maxShare] = process.env["PAIR"]
    .split(",")
    .map((v) => (v.trim() === "" ? undefined : Number(v)));
  Object.assign(PAIR_DEMAND, {
    distanceExponent: dist ?? PAIR_DEMAND.distanceExponent,
    sizeExponent: size ?? PAIR_DEMAND.sizeExponent,
    minDistanceTiles: minDist ?? PAIR_DEMAND.minDistanceTiles,
    maxShare: maxShare ?? PAIR_DEMAND.maxShare,
  });
}
if (process.env["TRIPS"]) {
  const f = Number(process.env["TRIPS"]);
  for (const anchor of TRIPS_PER_HEAD_ANCHORS as unknown as Array<[number, number]>) anchor[1] *= f;
}
if (process.env["RANGE"]) {
  const f = Number(process.env["RANGE"]);
  for (const anchor of TRAVEL_RANGE_ANCHORS as unknown as Array<[number, number]>) anchor[1] *= f;
}
import { ERA_START_CASH_MULT } from "../../src/data/finance";
// ERAMULT=off: every era starts with the plain difficulty cash (the numbers before Phase 41).
if (process.env["ERAMULT"] === "off") (ERA_START_CASH_MULT as unknown as unknown[][]).length = 0;
import { fixWeightBridges } from "./fixBridges";
import { createGameState } from "../../src/sim/state";
import { advanceOneHour } from "../../src/sim/tick";
import { findBuildPath } from "../../src/sim/track/pathfind";
import { buyableLocomotivesIn, locomotiveById } from "../../src/data/trains";
import { STATION_TYPE_DEFS } from "../../src/data/stations";
import { netWorth } from "../../src/sim/finance/ledger";
import { activePanic, fuelPriceMult } from "../../src/sim/finance/panics";
import { creditLimitFor } from "../../src/sim/finance/credit";
import { ledgerRevenue } from "../../src/data/finance";
import type { GameState } from "../../src/sim/state";
import type { City } from "../../src/sim/economy/types";
import type { Station } from "../../src/sim/stations/types";
import type { CargoType } from "../../src/data/cargo";

// tolerate older builds: look commands up dynamically
type AnyFn = (...args: never[]) => unknown;
const optional = (name: string): AnyFn | undefined =>
  (commands as unknown as Record<string, AnyFn>)[name];

const region = (process.argv[2] ?? "central-eu") as "central-eu";
const startYear = Number(process.argv[3] ?? 1900);
const difficulty = (process.argv[4] ?? "normal") as "easy" | "normal" | "hard";
const endYear = Number(process.argv[5] ?? startYear + 16);
const seed = Number(process.argv[6] ?? 1);

// land prices exist from Phase 30A on; older builds have no such module
const landPricesFn: ((s: GameState) => unknown) | undefined =
  await import("../../src/sim/economy/land").then(
    (m) => m.landPrices as (s: GameState) => unknown,
    () => undefined,
  );

const state = createGameState({ seed, region, startYear, difficulty });

const DAY = 24;
const year = (): number => startYear + Math.floor(state.ticks / (DAY * 360));
const tileXY = (t: number): [number, number] => [
  t % state.map.width,
  Math.floor(t / state.map.width),
];
const dist = (a: number, b: number): number => {
  const [ax, ay] = tileXY(a);
  const [bx, by] = tileXY(b);
  return Math.hypot(ax - bx, ay - by);
};
const cityCentre = (c: City): number => c.anchorY * state.map.width + c.anchorX;

interface Pair {
  a: Station;
  b: Station;
  cityA: City;
  cityB: City;
  trains: number[];
  path: number[];
}
const pairs: Pair[] = [];
const connected = new Set<number>();
const failedCities = new Set<number>();

const ok = (r: unknown): boolean => !!r && (r as { ok: boolean }).ok;

function day(n: number): void {
  for (let i = 0; i < n * DAY; i++) advanceOneHour(state);
}

function ensureCash(needed: number): boolean {
  if (state.cash >= needed) return true;
  const limitFn = optional("creditLimit") as ((s: GameState) => number) | undefined;
  // do not borrow for a project the credit limit cannot cover anyway
  if (limitFn && state.cash + Math.max(0, limitFn(state) - state.finance.loans) < needed)
    return false;
  const take = optional("takeLoan") as ((s: GameState, n: number) => unknown) | undefined;
  if (!take) return false;
  let guard = 0;
  while (state.cash < needed && guard++ < 60) {
    if (!ok(take(state, 100_000))) break;
  }
  return state.cash >= needed;
}

function repayIfRich(): void {
  const repay = optional("repayLoan") as ((s: GameState, n: number) => unknown) | undefined;
  if (!repay) return;
  while (state.finance.loans >= 100_000 && state.cash > state.finance.loans + 1_500_000) {
    if (!ok(repay(state, 100_000))) break;
  }
}

function bestLoco(): string {
  const y = year();
  // electric engines need catenary the bench never lays: a train of one sits on the platform (PLAYTEST-4)
  const all = buyableLocomotivesIn(y).filter((l) => l.type !== "electric");
  // engines of 6+ cars when the era has them, else the best that exists (1830s-40s engines pull 3-5)
  const strong = all.filter((l) => l.maxCars >= 6);
  const cands = strong.length > 0 ? strong : all;
  cands.sort((p, q) => q.maxSpeedKmh - p.maxSpeedKmh || p.cost - q.cost);
  return (cands[0] ?? buyableLocomotivesIn(y)[0]!).id;
}

function consist(loco: string): CargoType[] {
  const n = Math.min(locomotiveById(loco)!.maxCars, 6);
  // mail is ~15 % of a passenger line's fares (PLAYTEST-2 Top 10 #9): one mail car on a train of 4+, otherwise passengers only
  const mail = process.env.MAILCARS ? Number(process.env.MAILCARS) : n >= 4 ? 1 : 0;
  return Array.from({ length: n }, (_, i) => (i < n - mail ? "passengers" : "mail"));
}

/** Tiles of a city ordered by closeness to `toward` (the stations stand on the side facing the partner). */
function cityTilesToward(city: City, toward: number): number[] {
  // a station draws its passengers from the city tiles in its catchment, so a good player builds in the middle of town
  // (the land there is dear, but a station on the outskirts covers a fraction of the people): the 12 tiles nearest the
  // centre, those facing the partner first
  const centre = cityCentre(city);
  const near = [...city.tiles].sort((p, q) => dist(p, centre) - dist(q, centre)).slice(0, 12);
  return near.sort((p, q) => dist(p, toward) - dist(q, toward));
}

function stationTypeFor(city: City): "depot" | "station" | "terminal" {
  // Terminals are dear (land): only when the company can comfortably afford them
  if (year() >= 1870 && city.population >= 40_000 && state.cash > 2_500_000) return "terminal";
  return "station";
}

/** "built", "nocash" (try again later) or "failed" (no route; do not retry). */
function tryConnect(newCity: City, hub: City): "built" | "nocash" | "failed" {
  const sa = cityTilesToward(newCity, cityCentre(hub));
  const sb = cityTilesToward(hub, cityCentre(newCity));
  const stationTiles = new Set(state.stations.map((s) => s.tile));
  const taken = new Set(state.trackGraph.allNodes());
  for (const ta of sa.filter((t) => !taken.has(t)).slice(0, 4)) {
    for (const tb of sb.filter((t) => !taken.has(t)).slice(0, 4)) {
      const path =
        findBuildPath(state.map, ta, tb, year(), {
          respectTurns: { graph: state.trackGraph, stationTiles },
          ...(landPricesFn ? { land: landPricesFn(state) } : {}),
        }) ?? null;
      if (!path || path.length < 4) continue;
      const plan = commands.computeBuildPlan(state, path);
      if (!plan.valid) continue;
      const typeA = stationTypeFor(newCity);
      const typeB = stationTypeFor(hub);
      const stationBudget =
        commands.computeStationBuildPlan(state, ta, typeA).cost +
        commands.computeStationBuildPlan(state, tb, typeB).cost;
      const loco = locomotiveById(bestLoco())!;
      const trainCost =
        commands.computeBuyTrainPlan(state, loco.id, consist(loco.id)).cost *
        (pairs.length === 0 ? 1 : 2);
      // double track only when the company is comfortably rich; a cash-short player lays single track first
      const wantDouble = year() >= 1870 && state.cash > 2_500_000;
      const dbl = wantDouble ? plan.cost * 0.7 : 0;
      const total = plan.cost + stationBudget + trainCost + dbl + 60_000;
      if (!ensureCash(total + 50_000)) {
        if (process.env.V)
          console.log(
            "nocash",
            year(),
            newCity.name,
            hub.name,
            Math.round(total),
            Math.round(state.cash),
            Math.round(plan.cost),
            Math.round(stationBudget),
            Math.round(trainCost),
          );
        return "nocash";
      }
      if (!ok(commands.buildTrack(state, path))) continue;
      if (
        !ok(commands.buildStation(state, ta, typeA)) ||
        !ok(commands.buildStation(state, tb, typeB))
      ) {
        continue;
      }
      const a = state.stations.find((s) => s.tile === ta)!;
      const b = state.stations.find((s) => s.tile === tb)!;
      if (wantDouble) commands.upgradeTrack(state, path);
      commands.buildEngineShed(state, a.id);
      const pair: Pair = { a, b, cityA: newCity, cityB: hub, trains: [], path };
      if (process.env.V)
        console.log(
          "built",
          year(),
          newCity.name,
          hub.name,
          "track",
          Math.round(plan.cost),
          "stations",
          Math.round(stationBudget),
          "cash",
          Math.round(state.cash),
        );
      pairs.push(pair);
      connected.add(newCity.id);
      connected.add(hub.id);
      addTrain(pair);
      addTrain(pair);
      return "built";
    }
  }
  return "failed";
}

function addTrain(pair: Pair): boolean {
  const loco = bestLoco();
  const cars = consist(loco);
  if (!ensureCash(commands.computeBuyTrainPlan(state, loco, cars).cost + 100_000)) return false;
  const r = commands.buyTrain(state, pair.a.id, loco, cars);
  if (!ok(r)) return false;
  const train = state.trains[state.trains.length - 1]!;
  const forward = pair.trains.length % 2 === 0;
  commands.setOrders(
    state,
    train.id,
    (forward ? [pair.a, pair.b] : [pair.b, pair.a]).map((s) => ({
      stationId: s.id,
      rule: "auto" as const,
    })),
  );
  pair.trains.push(train.id);
  return true;
}

function yearlyPlanning(): void {
  const y = year();
  // 1. housekeeping with newer commands
  const relay = optional("relayTrack") as ((s: GameState) => unknown) | undefined;
  const wornEdges = (state.trackGraph.allEdges() as Array<{ wear?: number }>).length;
  if (relay && wornEdges > 0) relay(state);
  const rebuild = optional("rebuildBridge") as
    ((s: GameState, id: number, t?: string) => unknown) | undefined;
  const washouts = (state as unknown as { washouts?: Array<{ id: number }> }).washouts ?? [];
  if (rebuild) for (const w of [...washouts]) rebuild(state, w.id, y >= 1840 ? "stone" : undefined);

  // 2. new connections: best city by population / distance to the nearest connected city
  const candidates = state.cities
    .filter(
      (c) =>
        c.tiles.length > 0 &&
        c.population >= 8_000 &&
        !connected.has(c.id) &&
        !failedCities.has(c.id),
    )
    .map((c) => {
      const hubs = state.cities.filter((h) => connected.has(h.id) && h.tiles.length > 0);
      if (hubs.length === 0) return null;
      const hub = hubs.reduce((best, h) =>
        dist(cityCentre(h), cityCentre(c)) < dist(cityCentre(best), cityCentre(c)) ? h : best,
      );
      const d = dist(cityCentre(hub), cityCentre(c));
      return { c, hub, d, score: (c.population + 0.5 * hub.population) / (d + 6) };
    })
    .filter((x): x is { c: City; hub: City; d: number; score: number } => x !== null && x.d <= 70)
    .sort((p, q) => q.score - p.score);
  let built = 0;
  for (const cand of candidates) {
    if (built >= 2) break;
    const r = tryConnect(cand.c, cand.hub);
    if (r === "built") built++;
    else if (r === "failed") failedCities.add(cand.c.id);
    // too dear for now: try the next-best city, a cash-short player builds the cheaper line first
  }

  // 3. more trains on pairs, improvements in big cities
  for (const pair of pairs) {
    while (pair.trains.length < 4 && state.cash > 1_500_000 + state.finance.loans) {
      if (!addTrain(pair)) break;
    }
    for (const [st, city] of [
      [pair.a, pair.cityA],
      [pair.b, pair.cityB],
    ] as const) {
      if (city.population < 40_000 || state.cash < 1_000_000) continue;
      commands.buildImprovement(state, st.id, "postOffice");
      commands.buildImprovement(state, st.id, "hotel");
    }
  }
}

/** Phase 45 (CONTRACTS=1): the "accept if feasible" policy. The bot only runs passenger lines between cities, so it takes a
 * service offer when it already serves both towns, a connection offer for a town it can afford to link (and then builds
 * to it with its usual line-building), and turns freight offers (delivery, rescue) down. */
function contractPolicy(): void {
  const cs = (state as unknown as { contracts?: GameState["contracts"] }).contracts;
  if (!cs) return;
  for (const offer of [...cs.offers]) {
    let accept = false;
    if (offer.kind === "service")
      accept = connected.has(offer.cityId ?? -1) && connected.has(offer.city2Id ?? -1);
    else if (offer.kind === "connection")
      accept = state.cash > 500_000 && !failedCities.has(offer.cityId ?? -1);
    if (accept && cs.active.length < 2) commands.acceptContract(state, offer.id);
    else if (!accept) commands.declineContract(state, offer.id);
  }
  for (const c of cs.active) {
    if (c.kind !== "connection" || c.cityId === undefined) continue;
    const city = state.cities[c.cityId]!;
    const hubs = state.cities.filter((h) => connected.has(h.id) && h.tiles.length > 0);
    if (hubs.length === 0 || connected.has(city.id)) continue;
    const hub = hubs.reduce((best, h) =>
      dist(cityCentre(h), cityCentre(city)) < dist(cityCentre(best), cityCentre(city)) ? h : best,
    );
    const r = tryConnect(city, hub);
    if (r === "failed") failedCities.add(city.id);
  }
}

function bootstrap(): void {
  // First line: a good player picks a short line between two big cities (slow early engines make long lines poor
  // earners): best population product per tile of line among the 10 biggest cities, 8 to 70 tiles apart.
  const cities = state.cities
    .filter((c) => c.tiles.length > 0)
    .sort((p, q) => q.population - p.population)
    .slice(0, 10);
  const options: Array<{ a: City; b: City; score: number }> = [];
  for (const a of cities)
    for (const b of cities) {
      const d = dist(cityCentre(a), cityCentre(b));
      if (a.id >= b.id || d > 70 || d < 8) continue;
      options.push({ a, b, score: Math.sqrt(a.population * b.population) / (d + 10) });
    }
  options.sort((p, q) => q.score - p.score);
  for (const o of options) if (tryConnect(o.a, o.b) === "built") return;
  throw new Error("could not build a first line");
}

let minCash = Infinity;
/** Peak debt ÷ net worth at a month end after the 24-month start-up credit (Phase 44: the lenders' risk threshold is chosen against this). */
let maxDebtRatio = 0;
const report: string[] = [];
function snapshot(label: string): void {
  const last = state.finance.lastYear;
  report.push(
    [
      label,
      `cash ${(state.cash / 1e6).toFixed(2)}M`,
      `NW ${(netWorth(state) / 1e6).toFixed(2)}M`,
      `rev ${(ledgerRevenue(last) / 1e6).toFixed(2)}M`,
      `loans ${(state.finance.loans / 1e6).toFixed(1)}M`,
      `trains ${state.trains.length}`,
      `stations ${state.stations.length}`,
    ].join(" · "),
  );
}

let totalRevenue = 0;
bootstrap();
const wanted = new Set([1, 2, 3, 4, 5, 8, 10, 13, 16, 20, 25, 30]);
for (let y = 1; startYear + y <= endYear; y++) {
  // plan in January, then run the year in months with a monthly check for spare cash
  totalRevenue += ledgerRevenue(state.finance.lastYear);
  yearlyPlanning();
  for (let m = 0; m < 12; m++) {
    day(30);
    fixWeightBridges(state);
    minCash = Math.min(minCash, state.cash);
    if (state.ticks >= 24 * 30 * 24)
      maxDebtRatio = Math.max(maxDebtRatio, state.finance.loans / Math.max(1, netWorth(state)));
    if (process.env["TRACE"])
      console.log(
        year(),
        "m" + m,
        `cash ${Math.round(state.cash / 1e3)}k`,
        `loans ${Math.round(state.finance.loans / 1e3)}k`,
        `NW ${Math.round(netWorth(state) / 1e3)}k`,
        `lastYearRev ${Math.round(ledgerRevenue(state.finance.lastYear) / 1e3)}k`,
        `thisMonthRev ${Math.round(ledgerRevenue(state.finance.thisMonth) / 1e3)}k`,
        `trains ${state.trains.length}`,
        `neg ${state.finance.negativeCashMonths}`,
        `limit ${Math.round(creditLimitFor(state, netWorth(state)) / 1e3)}k`,
        `panic ${activePanic(state)?.panic.name ?? "-"}`,
        `diesel x${fuelPriceMult(state, "diesel").toFixed(2)}`,
      );
    repayIfRich();
    if (process.env["CONTRACTS"]) contractPolicy();
    if (m === 5) yearlyPlanning();
    if (state.finance.bankrupt) {
      report.push(`BANKRUPT in ${year()}`);
      break;
    }
  }
  if (wanted.has(y)) snapshot(`Jan ${startYear + y}`);
  if (state.finance.bankrupt) break;
}
totalRevenue += ledgerRevenue(state.finance.lastYear);
const cstats = (state as unknown as { contracts?: GameState["contracts"] }).contracts?.stats;
if (cstats && process.env["CONTRACTS"]) {
  const share = cstats.income / Math.max(1, totalRevenue + cstats.income);
  console.log(
    `CONTRACTS offered ${cstats.offered} completed ${cstats.completed} failed ${cstats.failed} income ${(cstats.income / 1e6).toFixed(2)}M penalties ${(cstats.penalties / 1e6).toFixed(2)}M revenue ${(totalRevenue / 1e6).toFixed(1)}M share ${(share * 100).toFixed(1)} %`,
  );
}
if (process.env["CONTRACTS"] && process.env["TRACE"]) {
  for (const n of state.news as unknown as Array<{
    kind: string;
    event?: string;
    money?: number;
    tick: number;
    contract?: { kind: string; target: number; reward: number };
  }>)
    if (n.kind === "contract")
      console.log(
        "C",
        startYear + Math.floor(n.tick / (DAY * 360)),
        n.event,
        n.contract?.kind,
        "target",
        n.contract?.target,
        "reward",
        n.contract?.reward,
        "money",
        n.money,
      );
}
void STATION_TYPE_DEFS;
console.log(`# ${region} ${startYear} ${difficulty} seed ${seed}`);
console.log(report.join("\n"));
if (process.env.V) console.log(state.trains.map((t) => `${t.locoModelId}:${t.status}`).join(" "));
console.log(`MINCASH ${(minCash / 1e6).toFixed(2)}`);
console.log(`MAXDEBT ${maxDebtRatio.toFixed(2)}`);
const ly = state.finance.lastYear as unknown as Record<string, number>;
console.log(
  "last year ledger:",
  Object.entries(ly)
    .filter(([, v]) => typeof v === "number" && Math.abs(v) > 1000)
    .map(([k, v]) => `${k} ${(v / 1e3).toFixed(0)}k`)
    .join(", "),
);
console.log(
  `land spent ${(((state.finance as { landSpent?: number }).landSpent ?? 0) / 1e6).toFixed(2)}M, capital ${(state.finance.capitalInvested / 1e6).toFixed(2)}M`,
);
if (process.env["FUELSTAT"]) {
  const yrs = state.ticks / (DAY * 360) || 1;
  const rows = state.trains.map((t) => {
    const loco = locomotiveById(t.locoModelId)!;
    return `${loco.id}:${(t.distanceTraveled / yrs).toFixed(0)}t/y cars${t.cars.length}`;
  });
  console.log("FUEL", rows.slice(0, 8).join(" | "));
}

/**
 * Benchmark: scripted BAD players (Phase 39). Not part of the test suite. Run with
 * `npx tsx tools/bench/badPlayers.ts <overbuilder|trainSpammer|leveraged> [startYear] [difficulty] [endYear] [seed]`;
 * it prints one JSON line (bankrupt year or null, minimum cash, final net worth). `tools/bench/survival.ts` runs the table.
 *
 * overbuilder: long lines to small towns, 2 trains each, as many as cash and credit allow.
 * trainSpammer: one good line, then trains on it until the credit runs out.
 * leveraged: borrows to the limit all the time, builds good lines fast with 4 trains each, never repays.
 */
import * as commands from "../../src/sim/commands";

import { createGameState } from "../../src/sim/state";
import { advanceOneHour } from "../../src/sim/tick";
import { findBuildPath } from "../../src/sim/track/pathfind";
import { buyableLocomotivesIn, locomotiveById } from "../../src/data/trains";
import { STATION_TYPE_DEFS } from "../../src/data/stations";
import { netWorth } from "../../src/sim/finance/ledger";
import { ledgerRevenue } from "../../src/data/finance";
import type { GameState } from "../../src/sim/state";
import type { City } from "../../src/sim/economy/types";
import type { Station } from "../../src/sim/stations/types";
import type { CargoType } from "../../src/data/cargo";

// tolerate older builds: look commands up dynamically
type AnyFn = (...args: never[]) => unknown;
const optional = (name: string): AnyFn | undefined =>
  (commands as unknown as Record<string, AnyFn>)[name];

const bot = (process.argv[2] ?? "overbuilder") as "overbuilder" | "trainSpammer" | "leveraged";
const region = "central-eu" as const;
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
  const all = buyableLocomotivesIn(y);
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

let bankruptYear: number | null = null;

function takeAllCredit(): void {
  const limitFn = optional("creditLimit") as ((s: GameState) => number) | undefined;
  const take = optional("takeLoan") as ((s: GameState, n: number) => unknown) | undefined;
  if (!limitFn || !take) return;
  let guard = 0;
  while (state.finance.loans + 100_000 <= limitFn(state) && guard++ < 200) {
    if (!ok(take(state, 100_000))) break;
  }
}

function expand(maxNew: number): void {
  const smallTowns = bot === "overbuilder";
  const candidates = state.cities
    .filter(
      (c) =>
        c.tiles.length > 0 &&
        !connected.has(c.id) &&
        !failedCities.has(c.id) &&
        (smallTowns ? c.population < 30_000 : c.population >= 8_000),
    )
    .map((c) => {
      const hubs = state.cities.filter((h) => connected.has(h.id) && h.tiles.length > 0);
      if (hubs.length === 0) return null;
      // overbuilder: the farthest hub-town pair within reach; leveraged: the good player's score
      const hub = hubs.reduce((best, h) =>
        dist(cityCentre(h), cityCentre(c)) < dist(cityCentre(best), cityCentre(c)) ? h : best,
      );
      const d = dist(cityCentre(hub), cityCentre(c));
      return { c, hub, d, score: smallTowns ? d : (c.population + 0.5 * hub.population) / (d + 6) };
    })
    .filter(
      (x): x is { c: City; hub: City; d: number; score: number } =>
        x !== null && x.d <= (smallTowns ? 110 : 70),
    )
    .sort((p, q) => q.score - p.score);
  let built = 0;
  for (const cand of candidates) {
    if (built >= maxNew) break;
    if (smallTowns || bot === "leveraged") takeAllCredit();
    const r = tryConnect(cand.c, cand.hub);
    if (r === "built") built++;
    else if (r === "failed") failedCities.add(cand.c.id);
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

function bootstrapBad(): void {
  if (bot === "overbuilder") {
    // first line: the biggest city to a small town as far away as possible
    const big = [...state.cities]
      .filter((c) => c.tiles.length > 0)
      .sort((p, q) => q.population - p.population)[0]!;
    const small = state.cities
      .filter(
        (c) =>
          c.tiles.length > 0 && c.id !== big.id && c.population < 30_000,
      )
      .map((c) => ({ c, d: dist(cityCentre(c), cityCentre(big)) }))
      .filter((x) => x.d <= 110)
      .sort((p, q) => q.d - p.d);
    for (const s of small) {
      takeAllCredit();
      if (tryConnect(s.c, big) === "built") return;
    }
  }
  bootstrap();
}

bootstrapBad();
for (let y = 1; startYear + y <= endYear && bankruptYear === null; y++) {
  for (let m = 0; m < 12; m++) {
    if (m === 0 || m === 6) {
      if (bot === "overbuilder") expand(3);
      else if (bot === "leveraged") expand(3);
    }
    if (bot === "trainSpammer" && pairs[0]) {
      takeAllCredit();
      let guard = 0;
      while (pairs[0].trains.length < 30 && guard++ < 10 && addTrain(pairs[0]));
    }
    if (bot === "leveraged") {
      takeAllCredit();
      for (const pair of pairs) while (pair.trains.length < 4 && addTrain(pair));
    }
    day(30);
    minCash = Math.min(minCash, state.cash);
    if (state.finance.bankrupt) {
      bankruptYear = year();
      break;
    }
  }
}
void STATION_TYPE_DEFS;
console.log(
  JSON.stringify({
    bot,
    startYear,
    difficulty,
    seed,
    bankruptYear,
    minCashM: Math.round(minCash / 1e4) / 100,
    netWorthM: Math.round(netWorth(state) / 1e4) / 100,
    trains: state.trains.length,
    loansM: state.finance.loans / 1e6,
  }),
);

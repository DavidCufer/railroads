/** Hand-built single routes for the balance report (docs/BALANCE.md) — one straight line on a
 * synthetic plain map, a cargo, a loco, a distance in km. Used by tests/sim/balanceReport.test.ts. */
import { buildStation, buildTrack, buyTrain, setOrders } from "../../src/sim/commands";
import { KM_PER_TILE } from "../../src/data/scale";
import { CARGO, type CargoType } from "../../src/data/cargo";
import { INDUSTRIES, type IndustryType } from "../../src/data/industries";
import { locomotiveById } from "../../src/data/trains";
import {
  emptyLedgerPeriod,
  ledgerNetProfit,
  ledgerRevenue,
  type LedgerPeriod,
} from "../../src/data/finance";
import { createRng } from "../../src/sim/rng";
import { advanceOneHour } from "../../src/sim/tick";
import { makeTestMap, makeTestState, tileAt } from "./track/helpers";
import type { City, Industry } from "../../src/sim/economy/types";
import type { CityTier } from "../../src/data/cities";
import type { GameState } from "../../src/sim/state";

export interface RouteSpec {
  cargo: CargoType;
  km: number;
  loco: string;
  year: number;
  /** Freight: producer/acceptor industries. */
  producer?: IndustryType;
  acceptor?: IndustryType;
  /** Passengers/mail: population of both end cities. */
  population?: number;
  tier?: CityTier;
  cars?: number;
  /** RNG seed (breakdowns); the balance tests average a few. */
  seed?: number;
  difficulty?: GameState["difficulty"];
  /** Station type at both ends (default: a Station for cities, a Depot for freight). */
  stationType?: "depot" | "station" | "terminal";
  /** Build a second Engine Shed at the far station (repair crews start from the nearest shed). */
  shedAtBothEnds?: boolean;
}

export interface RouteResult {
  revenue: number;
  profit: number;
  cars: number;
  /** Full-consist revenue of one one-way trip at time factor 1 (ideal, no era/difficulty). */
  fullTripRevenue: number;
  /** What the train cost (locomotive + cars). */
  price: number;
  /** The last completed year's ledger. */
  ledger: LedgerPeriod;
}

export function tickDays(state: GameState, days: number): void {
  for (let i = 0; i < days * 24; i++) advanceOneHour(state);
}

export function buildRoute(spec: RouteSpec): { state: GameState; cars: number } {
  const tiles = Math.round(spec.km / KM_PER_TILE);
  const loco = locomotiveById(spec.loco);
  if (!loco) throw new Error(`no loco ${spec.loco}`);
  const cars = spec.cars ?? Math.min(loco.maxCars, 8);
  const isCity = spec.cargo === "passengers" || spec.cargo === "mail";
  const width = tiles + 3;
  const rows = Array.from({ length: 4 }, () => Array.from({ length: width }, () => "p").join(""));
  const map = makeTestMap(rows);
  const state = makeTestState(map, {
    startYear: spec.year,
    seed: spec.seed ?? 1,
    rng: createRng(spec.seed ?? 1),
    ...(spec.difficulty ? { difficulty: spec.difficulty } : {}),
  });
  const trackY = 2;
  const ax = 1;
  const bx = width - 2;
  if (isCity) {
    const mk = (id: number, ox: number): City => {
      const ts = [
        tileAt(map, ox, 0),
        tileAt(map, ox + 1, 0),
        tileAt(map, ox, 1),
        tileAt(map, ox + 1, 1),
      ];
      for (const t of ts) map.cityId[t] = id;
      return {
        id,
        name: `C${id}`,
        tier: spec.tier ?? "town",
        population: spec.population ?? 12_000,
        anchorX: ox,
        anchorY: 0,
        tiles: ts,
        coastal: false,
      };
    };
    state.cities.push(mk(0, 0), mk(1, width - 2));
  } else {
    const add = (id: number, type: IndustryType, x: number): void => {
      map.industryId[tileAt(map, x, 1)] = id;
      const ind: Industry = { id, type, x, y: 1 };
      state.industries.push(ind);
      state.industryEconomy.set(id, {
        inputStock: {},
        monthlyOutput: id === 0 ? { ...INDUSTRIES[type].produces } : {},
      });
    };
    add(0, spec.producer as IndustryType, ax);
    add(1, spec.acceptor as IndustryType, bx);
  }
  const path = Array.from({ length: bx - ax + 1 }, (_, i) => tileAt(map, ax + i, trackY));
  if (!buildTrack(state, path).ok) throw new Error("track");
  const st = spec.stationType ?? (isCity ? "station" : "depot");
  if (!buildStation(state, tileAt(map, ax, trackY), st).ok) throw new Error("station a");
  if (!buildStation(state, tileAt(map, bx, trackY), st).ok) throw new Error("station b");
  const sa = state.stations[0] as { id: number };
  const sb = state.stations[1] as { id: number; hasEngineShed: boolean };
  if (spec.shedAtBothEnds) sb.hasEngineShed = true;
  state.cash = 1e12;
  const bought = buyTrain(
    state,
    sa.id,
    spec.loco,
    Array.from({ length: cars }, () => spec.cargo),
  );
  if (!bought.ok) throw new Error(`buyTrain ${JSON.stringify(bought)}`);
  const r = setOrders(state, state.trains[0]!.id, [
    { stationId: sa.id, rule: "auto" },
    { stationId: sb.id, rule: "auto" },
  ]);
  if (!r.ok) throw new Error("orders");
  return { state, cars };
}

/** Runs `years` full years and returns the last completed year's ledger figures. */
export function measureRoute(spec: RouteSpec, years = 3): RouteResult {
  const { state, cars } = buildRoute(spec);
  for (let y = 0; y < years; y++) tickDays(state, 360);
  const last = state.finance.lastYear;
  const km = spec.km;
  const def = CARGO[spec.cargo];
  return {
    revenue: ledgerRevenue(last),
    profit: ledgerNetProfit(last),
    cars,
    fullTripRevenue: cars * def.baseRate * (km / 100),
    price: state.trains[0]!.purchasePrice,
    ledger: last,
  };
}

/** Mean of `measureRoute` over a few seeds: the breakdown dice make a single run noisy by ±15%. */
export function measureMean(spec: RouteSpec, seeds: readonly number[] = [1, 2, 3]): RouteResult {
  const runs = seeds.map((seed) => measureRoute({ ...spec, seed }));
  const mean = (f: (r: RouteResult) => number): number =>
    runs.reduce((a, r) => a + f(r), 0) / runs.length;
  const ledger = emptyLedgerPeriod();
  for (const key of Object.keys(ledger) as Array<keyof LedgerPeriod>)
    ledger[key] = mean((r) => r.ledger[key] ?? 0);
  return {
    revenue: mean((r) => r.revenue),
    profit: mean((r) => r.profit),
    cars: runs[0]!.cars,
    fullTripRevenue: runs[0]!.fullTripRevenue,
    price: mean((r) => r.price),
    ledger,
  };
}

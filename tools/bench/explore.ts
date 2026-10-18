/** Exploration E1 and Phase 54 item 2: which service pattern pays on a chain of towns? Synthetic flat map, no random terrain: a chain of towns on a straight double track, plus unserved background towns (a
 * real map has many; they soak up the share of a town's trips that no train of ours reaches).
 *
 * `npx tsx tools/bench/explore.ts <S1|S1s|S2|S3|S4> <year> [seeds=3] [years=2]`
 * env `TURN=0` turns terminus turnaround off, `CONFIGS=a,b` runs only those, `KS=1,2,3` car counts, `JSON=1` one JSON line per config.
 * Prints, per configuration and car count, totals over the line's trains, averaged over the seeds. */
import { PARTY_SIZE } from "../../src/data/economy";
import { TURNAROUND_HOURS } from "../../src/data/trains";
import * as commands from "../../src/sim/commands";
import type { City } from "../../src/sim/economy/types";
import { advanceOneHour } from "../../src/sim/tick";
import { findBuildPath } from "../../src/sim/track/pathfind";
import { carCapacity } from "../../src/sim/trains/capacity";
import { booksProfit } from "../../src/sim/trains/profit";
import { DAYS_PER_YEAR, HOURS_PER_DAY } from "../../src/sim/time";
import type { GameState } from "../../src/sim/state";
import { makeTestMap, makeTestState, tileAt } from "../../tests/sim/track/helpers";

const [, , scen = "S1", yearArg = "1842", seedsArg = "3", yearsArg = "2"] = process.argv;
const startYear = Number(yearArg);
const SEEDS = Array.from({ length: Number(seedsArg) }, (_, i) => i + 1);
const YEARS = Number(yearsArg);
const LOCO = startYear < 1880 ? "norris-4-2-0" : "atlantic-4-4-2";
/** Yearly charge on the money put into trains and cars (3-5 % was a railway bond's yield in the 1840s-1900s). */
const CAPITAL_CHARGE = 0.05;
if (process.env["TURN"] === "0") {
  for (const k of Object.keys(TURNAROUND_HOURS) as Array<keyof typeof TURNAROUND_HOURS>)
    TURNAROUND_HOURS[k] = 0;
}

/** Small deterministic generator for the bench's own map layout (not the sim's). */
function rand(seed: number): () => number {
  let a = seed * 2654435761 + 12345;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return (((t ^ (t >>> 14)) >>> 0) % 100000) / 100000;
  };
}

interface Town {
  x: number;
  y: number;
  pop: number;
}
interface World {
  towns: Town[]; // the chain, in order
  background: Town[];
}

const between = (r: () => number, lo: number, hi: number): number => lo + (hi - lo) * r();

function layout(seed: number): World {
  const r = rand(seed * 7 + scen.charCodeAt(1));
  const towns: Town[] = [];
  const y = 14;
  let x = 14;
  if (scen.startsWith("S1")) {
    // S1: 12-25k towns; S1s: the scarce case, 4-8k towns
    const [lo, hi] = scen === "S1s" ? [4000, 8000] : [12000, 25000];
    for (let i = 0; i < 5; i++) {
      towns.push({ x: Math.round(x), y, pop: Math.round(between(r, lo, hi)) });
      x += between(r, 15, 25);
    }
  } else if (scen === "S2") {
    towns.push({ x, y, pop: 140000 }, { x: x + 58, y, pop: 110000 });
  } else {
    // S3: a big city, three small towns, a second big city (Milan - ... - Venice)
    const pops = [140000, 0, 0, 0, 110000];
    for (let i = 0; i < 5; i++) {
      towns.push({ x: Math.round(x), y, pop: pops[i] || Math.round(between(r, 12000, 25000)) });
      x += between(r, 15, 20);
    }
  }
  const last = (towns[towns.length - 1] as Town).x;
  const background: Town[] = [];
  for (let i = 0; i < 6; i++)
    background.push({
      x: Math.round(between(r, 10, last + 10)),
      y: Math.round(between(r, 50, 85)),
      pop: Math.round(between(r, 8000, 20000)),
    });
  return { towns, background };
}

interface Built {
  state: GameState;
  stations: number[]; // station ids along the chain
}

function build(seed: number): Built {
  const world = layout(seed);
  const width = Math.max(...world.towns.map((t) => t.x)) + 24;
  const height = 100;
  const map = makeTestMap(Array.from({ length: height }, () => "p".repeat(width)));
  const state = makeTestState(map, { startYear, cash: 5e8, seed });
  const mk = (t: Town, id: number, name: string): City => {
    const side = t.pop >= 100000 ? 4 : 3;
    const tiles: number[] = [];
    for (let dy = 0; dy < side; dy++)
      for (let dx = 0; dx < side; dx++) {
        const tile = tileAt(map, t.x - 1 + dx, t.y - 1 + dy);
        map.cityId[tile] = id;
        tiles.push(tile);
      }
    const tier = t.pop >= 100000 ? "city" : t.pop >= 5000 ? "town" : "village";
    return {
      id,
      name,
      tier,
      population: t.pop,
      anchorX: t.x,
      anchorY: t.y,
      coastal: false,
      tiles,
    } as unknown as City;
  };
  [...world.towns, ...world.background].forEach((t, i) =>
    state.cities.push(mk(t, i, i < world.towns.length ? `T${i}` : `B${i}`)),
  );
  const ok = (r: unknown): boolean => (r as { ok: boolean }).ok;
  const a = tileAt(map, (world.towns[0] as Town).x, 14);
  const b = tileAt(map, (world.towns[world.towns.length - 1] as Town).x, 14);
  const path = findBuildPath(map, a, b, startYear, {});
  if (!path || !ok(commands.buildTrack(state, path))) throw new Error("track");
  if (!ok(commands.upgradeTrack(state, path))) throw new Error("double");
  const stations: number[] = [];
  for (const t of world.towns) {
    const tile = tileAt(map, t.x, t.y);
    if (!ok(commands.buildStation(state, tile, "station"))) throw new Error("station");
    const s = state.stations[state.stations.length - 1] as { id: number; tile: number };
    stations.push(s.id);
    commands.buildEngineShed(state, s.id);
  }
  return { state, stations };
}

/** A configuration: train orders (station indices along the chain), `n` copies spread over the cycle. */
interface Config {
  name: string;
  /** One list of orders per train. */
  trains: (nStations: number) => number[][];
}

const chainCycle = (k: number): number[] => [
  ...Array.from({ length: k }, (_, i) => i),
  ...Array.from({ length: Math.max(0, k - 2) }, (_, i) => k - 2 - i),
];
const multi = (n: number): Config => ({
  name: `multi-${n}`,
  trains: (k) => {
    const cyc = chainCycle(k);
    return Array.from({ length: n }, (_, i) => {
      const rot = Math.floor((i * cyc.length) / n);
      return [...cyc.slice(rot), ...cyc.slice(0, rot)];
    });
  },
});
const shuttles = (perLeg: number): Config => ({
  name: `shuttles-${perLeg}x`,
  trains: (k) => {
    const out: number[][] = [];
    for (let leg = 0; leg < k - 1; leg++)
      for (let i = 0; i < perLeg; i++) out.push(i % 2 === 0 ? [leg, leg + 1] : [leg + 1, leg]);
    return out;
  },
});
const direct = (n: number): Config => ({
  name: `direct-${n}`,
  trains: () => Array.from({ length: n }, (_, i) => (i % 2 === 0 ? [0, 1] : [1, 0])),
});
const express = (n: number): Config => ({
  name: `express-${n}+leg-shuttles`,
  trains: (k) => [
    ...Array.from({ length: n }, (_, i) => (i % 2 === 0 ? [0, k - 1] : [k - 1, 0])),
    ...shuttles(1).trains(k),
  ],
});
const CONFIGS: Config[] = scen.startsWith("S1")
  ? [multi(1), multi(2), multi(3), multi(4), multi(6), shuttles(1), shuttles(2), shuttles(3)]
  : scen === "S2"
    ? [direct(1), direct(2), direct(3), direct(4)]
    : [multi(1), multi(2), multi(3), express(1), express(2)];
const KS = (process.env["KS"] ?? (startYear < 1880 ? "1,2,3,4,5,6,8" : "1,2,3,4,5,6"))
  .split(",")
  .map(Number);

interface Metrics {
  profit: number; // per year, the line's trains' books
  revenue: number;
  capex: number;
  trains: number;
  load: number;
  waitPeople: number;
  deliveredPeople: number;
  lostPeople: number;
  fare: number; // revenue per person delivered
}

function run(cfg: Config, k: number, seed: number): Metrics {
  const { state, stations } = build(seed);
  const party = PARTY_SIZE;
  const cash0 = state.cash;
  const ids: number[] = [];
  for (const orders of cfg.trains(stations.length)) {
    const cars = Array.from({ length: k }, () => "passengers" as const);
    const r = commands.buyTrain(state, stations[orders[0] as number] as number, LOCO, cars);
    if (!(r as { ok: boolean }).ok) throw new Error("train " + JSON.stringify(r));
    const t = state.trains[state.trains.length - 1] as { id: number };
    commands.setOrders(
      state,
      t.id,
      orders.map((o) => ({ stationId: stations[o] as number, rule: "auto" as const })),
    );
    ids.push(t.id);
  }
  const capex = cash0 - state.cash;
  const loadSum = new Map<number, [number, number]>();
  let waitSum = 0;
  let days = 0;
  for (let i = 0; i < YEARS * DAYS_PER_YEAR * HOURS_PER_DAY; i++) {
    advanceOneHour(state);
    if (i % HOURS_PER_DAY === 0) {
      days++;
      for (const s of stations) waitSum += state.stationCargo.get(s)?.passengers?.amount ?? 0;
    }
    for (const t of state.trains) {
      if (t.status !== "moving") continue;
      const cap = t.cars.reduce((u, c) => u + carCapacity(c), 0);
      const used = t.cars.reduce((u, c) => u + c.loadedUnits, 0);
      const e = loadSum.get(t.id) ?? [0, 0];
      e[0] += used / cap;
      e[1] += 1;
      loadSum.set(t.id, e);
    }
  }
  let profit = 0;
  let trainRevenue = 0;
  let load = 0;
  for (const id of ids) {
    const t = state.trains.find((x) => x.id === id) as (typeof state.trains)[number];
    const yrs = Math.max(0.25, (state.ticks - t.purchaseTick) / HOURS_PER_DAY / DAYS_PER_YEAR);
    profit += booksProfit(t.profit.lifetime) / yrs;
    trainRevenue += t.profit.lifetime.revenue / yrs;
    const e = loadSum.get(id);
    load += e && e[1] ? e[0] / e[1] : 0;
  }
  // The last full year of the stations' ledgers (people delivered and their fares, people turned away).
  let delivered = 0;
  let revenue = 0;
  let lost = 0;
  for (const s of stations) {
    const p = state.stationFlow.get(s)?.lastYear.passengers;
    delivered += p?.delivered ?? 0;
    revenue += p?.deliveredRevenue ?? 0;
    lost += p?.lostUnits ?? 0;
  }
  return {
    profit,
    revenue: trainRevenue,
    capex,
    trains: ids.length,
    load: load / ids.length,
    waitPeople: (waitSum / Math.max(1, days) / stations.length) * party,
    deliveredPeople: delivered * party,
    lostPeople: lost * party,
    fare: delivered > 0 ? revenue / (delivered * party) : 0,
  };
}

const only = process.env["CONFIGS"]?.split(",");
for (const cfg of CONFIGS) {
  if (only && !only.includes(cfg.name)) continue;
  for (const k of KS) {
    const runs = SEEDS.map((s) => run(cfg, k, s));
    const avg = (f: (m: Metrics) => number): number =>
      runs.reduce((a, m) => a + f(m), 0) / runs.length;
    const row = {
      scen,
      year: startYear,
      turn: process.env["TURN"] === "0" ? "off" : "on",
      config: cfg.name,
      cars: k,
      trains: runs[0]?.trains ?? 0,
      carsInUse: (runs[0]?.trains ?? 0) * k,
      revenueK: Math.round(avg((m) => m.revenue) / 1000),
      profitK: Math.round(avg((m) => m.profit) / 1000),
      netK: Math.round(avg((m) => m.profit - CAPITAL_CHARGE * m.capex) / 1000),
      perTrainK: Math.round(avg((m) => m.profit) / (runs[0]?.trains ?? 1) / 1000),
      loadPct: Math.round(avg((m) => m.load) * 100),
      waitPeople: Math.round(avg((m) => m.waitPeople)),
      deliveredPeople: Math.round(avg((m) => m.deliveredPeople)),
      lostPeople: Math.round(avg((m) => m.lostPeople)),
      fare: Math.round(avg((m) => m.fare) * 10) / 10,
    };
    console.log(process.env["JSON"] ? JSON.stringify(row) : Object.values(row).join("\t"));
  }
}

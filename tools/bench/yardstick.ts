/** Phase 91: the passenger yardstick. Fixed, hand-built test lines (flat map, double track, like `explore.ts`), in 1842, 1870 and
 * 1900 with the engine a player would own then, measured directly against the owner's complaints ("stations always full, lots of
 * trains between few cities, way too much money"). Changes no game rule.
 *
 *   npx tsx tools/bench/yardstick.ts [lines=P20,P60,T,H,B] [years=1842,1870,1900] [seeds=2] [exps=0.5]
 *
 * Lines: P20/P60 two large towns 20/60 tiles apart; T the five-town line (two cities, three small towns, ~70 tiles); H a hub city
 * with three branches of two towns each; B a thin branch of two small towns off a big city.
 * One JSON line per finished run in docs/explore/data/yardstick.jsonl (the key says which); a restart skips finished runs.
 * The distance exponent of `ROUTE_DEMAND` is overridden in this process only (`exps`); nothing in src/data changes.
 * Only stations the trains call at are counted (an express-only run does not report the towns it passes as "lost"). */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { MAX_WAIT_DAYS, PARTY_SIZE, ROUTE_DEMAND } from "../../src/data/economy";
import "./pairEnv";
import * as commands from "../../src/sim/commands";
import type { City } from "../../src/sim/economy/types";
import { advanceOneHour } from "../../src/sim/tick";
import { findBuildPath } from "../../src/sim/track/pathfind";
import { booksProfit } from "../../src/sim/trains/profit";
import { DAYS_PER_MONTH, DAYS_PER_YEAR, HOURS_PER_DAY } from "../../src/sim/time";
import type { GameState } from "../../src/sim/state";
import { makeTestMap, makeTestState, tileAt } from "../../tests/sim/track/helpers";

const [
  ,
  ,
  linesArg = "P20,P60,T,H,B",
  yearsArg = "1842,1870,1900",
  seedsArg = "2",
  expsArg = "0.5",
] = process.argv;
export const OUT = process.env["YS_OUT"] ?? "docs/explore/data/yardstick.jsonl";
const YEARS_SIM = 2;
const MAX_TRAINS = 8;

/** The engine and train length a player would own in the era. */
export const ERA: Record<number, { loco: string; cars: number }> = {
  1842: { loco: "norris-4-2-0", cars: 4 },
  1870: { loco: "american-4-4-0", cars: 6 },
  1900: { loco: "atlantic-4-4-2", cars: 6 },
};

function rand(seed: number, salt: number): () => number {
  let a = seed * 2654435761 + 12345 + salt * 7919;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return (((t ^ (t >>> 14)) >>> 0) % 100000) / 100000;
  };
}
const between = (r: () => number, lo: number, hi: number): number => lo + (hi - lo) * r();

interface Town {
  x: number;
  y: number;
  pop: number;
}
/** A line: its towns (stations are built at all of them), the track pieces to lay (each a pair of town indices or a free
 * tile pair), and which towns each train of each configuration calls at. */
interface Layout {
  towns: Town[];
  background: Town[];
  width: number;
  height: number;
  /** Track to lay, as [fromTown, toTown] town-index pairs; `junction` joins the hub's spur to the arms. */
  track: Array<[number, number]>;
  /** Extra track tiles (a junction) a piece starts from instead of a town: index into `towns` is replaced. */
  junction?: { x: number; y: number };
  /** Cycles the trains run, as town index lists; train i takes `cycles[i % cycles.length]`. */
  cycles: number[][];
  /** For T: the town indices of the two big towns (express ends). */
  ends?: [number, number];
}

function background(r: () => number, last: number): Town[] {
  return Array.from({ length: 6 }, () => ({
    x: Math.round(between(r, 10, last + 10)),
    y: Math.round(between(r, 50, 85)),
    pop: Math.round(between(r, 8000, 20000)),
  }));
}

function layout(line: string, seed: number): Layout {
  const r = rand(seed, line.charCodeAt(0) * 31 + line.length);
  const y = 14;
  if (line === "P20" || line === "P60") {
    const d = line === "P20" ? 20 : 60;
    const towns = [
      { x: 14, y, pop: 140000 },
      { x: 14 + d, y, pop: 110000 },
    ];
    return {
      towns,
      background: background(r, 14 + d),
      width: 14 + d + 24,
      height: 100,
      track: [[0, 1]],
      cycles: [
        [0, 1],
        [1, 0],
      ],
    };
  }
  if (line === "T") {
    const pops = [140000, 0, 0, 0, 110000];
    const towns: Town[] = [];
    let x = 14;
    for (let i = 0; i < 5; i++) {
      towns.push({ x: Math.round(x), y, pop: pops[i] || Math.round(between(r, 10000, 20000)) });
      x += between(r, 15, 20);
    }
    const last = (towns[4] as Town).x;
    return {
      towns,
      background: background(r, last),
      width: last + 24,
      height: 100,
      track: [[0, 4]],
      cycles: [], // set by the configuration
      ends: [0, 4],
    };
  }
  if (line === "B") {
    // a big city and a thin branch of two small towns
    const towns: Town[] = [{ x: 14, y, pop: 140000 }];
    let x = 14;
    for (let i = 0; i < 2; i++) {
      x += between(r, 15, 20);
      towns.push({ x: Math.round(x), y, pop: Math.round(between(r, 4000, 8000)) });
    }
    return {
      towns,
      background: background(r, x),
      width: Math.round(x) + 24,
      height: 100,
      track: [[0, 2]],
      cycles: [[0, 1, 2, 1]],
    };
  }
  // H: a hub city (a spur of its own off a junction) and three arms of two towns each, going east, north-east, south-east
  const hub: Town = { x: 14, y: 40, pop: 140000 };
  const jx = hub.x + 4;
  const towns: Town[] = [hub];
  // east, and the two 45-degree diagonals (steps of 1/sqrt 2 per tile of travel): straight track, a station at each town
  const dirs: Array<[number, number]> = [
    [1, 0],
    [Math.SQRT1_2, -Math.SQRT1_2],
    [Math.SQRT1_2, Math.SQRT1_2],
  ];
  for (const [dx, dy] of dirs) {
    let dist = 0;
    for (let k = 0; k < 2; k++) {
      dist += between(r, 15, 20);
      const steps = Math.round(dist * (dx === 1 ? 1 : Math.SQRT1_2));
      towns.push({
        x: jx + (dx === 1 ? steps : steps),
        y: hub.y + (dx === 1 ? 0 : Math.sign(dy) * steps),
        pop: Math.round(between(r, 12000, 25000)),
      });
    }
  }
  const last = Math.max(...towns.map((t) => t.x));
  return {
    towns,
    background: background(r, last),
    width: last + 24,
    height: 100,
    track: [
      [-1, 2],
      [-1, 4],
      [-1, 6],
    ],
    junction: { x: jx, y: hub.y },
    cycles: [
      [0, 1, 2, 1],
      [0, 3, 4, 3],
      [0, 5, 6, 5],
    ],
  };
}

interface Built {
  state: GameState;
  stations: number[];
}

function build(line: string, year: number, seed: number): Built {
  const lay = layout(line, seed);
  const map = makeTestMap(Array.from({ length: lay.height }, () => "p".repeat(lay.width)));
  const state = makeTestState(map, { startYear: year, cash: 5e8, seed });
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
  [...lay.towns, ...lay.background].forEach((t, i) =>
    state.cities.push(mk(t, i, i < lay.towns.length ? `T${i}` : `B${i}`)),
  );
  const ok = (r: unknown): boolean => (r as { ok: boolean }).ok;
  const lay1 = (from: number, to: number): void => {
    const path = findBuildPath(map, from, to, year, {});
    if (!path || !ok(commands.buildTrack(state, path)))
      throw new Error(`track ${line} ${from}>${to}`);
    if (!ok(commands.upgradeTrack(state, path))) throw new Error(`double ${line}`);
  };
  const tile = (t: Town): number => tileAt(map, t.x, t.y);
  if (lay.junction) {
    const j = tileAt(map, lay.junction.x, lay.junction.y);
    lay1(tile(lay.towns[0] as Town), j);
    for (const [from, to] of lay.track)
      lay1(from < 0 ? j : tile(lay.towns[from] as Town), tile(lay.towns[to] as Town));
  } else
    for (const [from, to] of lay.track)
      lay1(tile(lay.towns[from] as Town), tile(lay.towns[to] as Town));
  const stations: number[] = [];
  for (const t of lay.towns) {
    if (!ok(commands.buildStation(state, tile(t), "station")))
      throw new Error(`station ${line} at ${t.x},${t.y}`);
    const s = state.stations[state.stations.length - 1] as { id: number };
    stations.push(s.id);
    commands.buildEngineShed(state, s.id);
  }
  return { state, stations };
}

/** Cycle `cyc` (indices of towns) rotated so n trains spread evenly around it. */
const spread = (cyc: number[], i: number, n: number): number[] => {
  const rot = Math.floor((i * cyc.length) / n);
  return [...cyc.slice(rot), ...cyc.slice(0, rot)];
};

interface Config {
  /** Name in the output (`locals`, `1x+locals`...). */
  name: string;
  /** Orders of each of n trains, as town indices. */
  trains: (lay: Layout, n: number) => number[][];
  /** Smallest n. */
  minN: number;
}
const chain = (k: number): number[] => [
  ...Array.from({ length: k }, (_, i) => i),
  ...Array.from({ length: Math.max(0, k - 2) }, (_, i) => k - 2 - i),
];
const CONFIGS: Record<string, Config[]> = {
  P20: [
    {
      name: "locals",
      minN: 1,
      trains: (_l, n) => Array.from({ length: n }, (_, i) => (i % 2 ? [1, 0] : [0, 1])),
    },
  ],
  P60: [
    {
      name: "locals",
      minN: 1,
      trains: (_l, n) => Array.from({ length: n }, (_, i) => (i % 2 ? [1, 0] : [0, 1])),
    },
  ],
  T: [0, 1, 2].map((e) => ({
    name: e === 0 ? "locals" : `${e}x+locals`,
    minN: Math.max(1, e),
    trains: (_l: Layout, n: number) => [
      ...Array.from({ length: e }, (_, i) => (i % 2 ? [4, 0] : [0, 4])),
      ...Array.from({ length: n - e }, (_, i) => spread(chain(5), i, n - e)),
    ],
  })),
  H: [
    {
      name: "locals",
      minN: 1,
      trains: (l, n) =>
        Array.from({ length: n }, (_, i) =>
          spread(l.cycles[i % 3] as number[], Math.floor(i / 3), Math.ceil((n - (i % 3)) / 3)),
        ),
    },
  ],
  B: [
    {
      name: "locals",
      minN: 1,
      trains: (l, n) => Array.from({ length: n }, (_, i) => spread(l.cycles[0] as number[], i, n)),
    },
  ],
};

export interface Row {
  key: string;
  line: string;
  year: number;
  config: string;
  n: number;
  exp: number;
  seed: number;
  trainPrice: number;
  /** People a year the called-at stations' routes send (the demand), carried, turned away. */
  demand: number;
  carried: number;
  lost: number;
  /** Share of station-months whose platform was at its 20-day limit on at least half of the month's days. */
  fullMonthsPct: number;
  /** Share of station-days at the limit. */
  fullDaysPct: number;
  /** Net money per train in the second year (after running costs, before any capital charge). */
  netPerTrain: number;
  stations: number;
}

export const layoutOf = layout;

const doneKeys = new Set<string>();
if (existsSync(OUT))
  for (const l of readFileSync(OUT, "utf8").split("\n"))
    if (l.trim()) doneKeys.add((JSON.parse(l) as Row).key);

function run(line: string, year: number, cfg: Config, n: number, seed: number, exp: number): Row {
  ROUTE_DEMAND.distExponent = exp;
  const { loco } = ERA[year] as { loco: string; cars: number };
  const cars = Number(process.env["CARS"] ?? (ERA[year] as { cars: number }).cars);
  const { state, stations } = build(line, year, seed);
  const lay = layout(line, seed);
  const cash0 = state.cash;
  const called = new Set<number>();
  const ids: number[] = [];
  for (const orders of cfg.trains(lay, n)) {
    const r = commands.buyTrain(
      state,
      stations[orders[0] as number] as number,
      loco,
      Array.from({ length: cars }, () => "passengers" as const),
    );
    if (!(r as { ok: boolean }).ok) throw new Error("train " + JSON.stringify(r));
    const t = state.trains[state.trains.length - 1] as { id: number };
    commands.setOrders(
      state,
      t.id,
      orders.map((o) => ({ stationId: stations[o] as number, rule: "auto" as const })),
    );
    for (const o of orders) called.add(stations[o] as number);
    ids.push(t.id);
  }
  const trainPrice = (cash0 - state.cash) / n;
  const served = [...called];
  const cap = (s: number): number =>
    ((state.stationEconomy.get(s)?.passengerRoutes ?? []).reduce((u, x) => u + x.perMonth, 0) /
      DAYS_PER_MONTH) *
    MAX_WAIT_DAYS;
  let monthsFull = 0;
  let months = 0;
  let daysFull = 0;
  let days = 0;
  const fullDaysInMonth = new Map<number, number>();
  let profitAtYearEnd = 0;
  const hours = YEARS_SIM * DAYS_PER_YEAR * HOURS_PER_DAY;
  for (let i = 1; i <= hours; i++) {
    advanceOneHour(state);
    if (i === DAYS_PER_YEAR * HOURS_PER_DAY)
      profitAtYearEnd = ids.reduce(
        (u, id) =>
          u +
          booksProfit(
            (state.trains.find((t) => t.id === id) as { profit: { lifetime: never } }).profit
              .lifetime,
          ),
        0,
      );
    if (i % HOURS_PER_DAY !== 0) continue;
    const day = i / HOURS_PER_DAY;
    if (day <= DAYS_PER_YEAR) continue; // measure the second year only (the first fills the piles)
    for (const s of served) {
      const limit = cap(s);
      const pile = state.stationCargo.get(s)?.passengers?.amount ?? 0;
      const full = limit > 0 && pile >= 0.95 * limit;
      days++;
      if (full) {
        daysFull++;
        fullDaysInMonth.set(s, (fullDaysInMonth.get(s) ?? 0) + 1);
      }
    }
    if (day % DAYS_PER_MONTH === 0) {
      for (const s of served) {
        months++;
        if ((fullDaysInMonth.get(s) ?? 0) >= DAYS_PER_MONTH / 2) monthsFull++;
      }
      fullDaysInMonth.clear();
    }
  }
  let carried = 0;
  let lost = 0;
  let demand = 0;
  for (const s of served) {
    const p = state.stationFlow.get(s)?.lastYear.passengers;
    carried += (p?.delivered ?? 0) * PARTY_SIZE;
    lost += (p?.lostUnits ?? 0) * PARTY_SIZE;
    demand +=
      (state.stationEconomy.get(s)?.passengerRoutes ?? []).reduce((u, x) => u + x.perMonth, 0) *
      12 *
      PARTY_SIZE;
  }
  const profitEnd = ids.reduce(
    (u, id) =>
      u +
      booksProfit(
        (state.trains.find((t) => t.id === id) as { profit: { lifetime: never } }).profit.lifetime,
      ),
    0,
  );
  return {
    key: `${line}|${year}|${cfg.name}|${n}|${exp}|${seed}`,
    line,
    year,
    config: cfg.name,
    n,
    exp,
    seed,
    trainPrice: Math.round(trainPrice),
    demand: Math.round(demand),
    carried: Math.round(carried),
    lost: Math.round(lost),
    fullMonthsPct: months ? Math.round((1000 * monthsFull) / months) / 10 : 0,
    fullDaysPct: days ? Math.round((1000 * daysFull) / days) / 10 : 0,
    netPerTrain: Math.round((profitEnd - profitAtYearEnd) / n),
    stations: served.length,
  };
}

if (process.argv[1]?.endsWith("yardstick.ts")) {
  mkdirSync(dirname(OUT), { recursive: true });
  const seeds = Array.from({ length: Number(seedsArg) }, (_, i) => i + 1);
  const exps = expsArg.split(",").map(Number);
  for (const exp of exps)
    for (const yr of yearsArg.split(",").map(Number))
      for (const line of linesArg.split(","))
        for (const cfg of CONFIGS[line] as Config[])
          for (let n = cfg.minN; n <= MAX_TRAINS; n++)
            for (const seed of seeds) {
              const key = `${line}|${yr}|${cfg.name}|${n}|${exp}|${seed}`;
              if (doneKeys.has(key)) continue;
              const t0 = Date.now();
              const row = run(line, yr, cfg, n, seed, exp);
              appendFileSync(OUT, JSON.stringify(row) + "\n");
              doneKeys.add(key);
              console.error(
                `${key} ${((Date.now() - t0) / 1000).toFixed(1)}s carried ${row.carried}/${row.demand}`,
              );
            }
}

/**
 * A reference operator for calibrating money goals (PLAN Phase 28A "retune goal thresholds from the new numbers").
 * Not a simulation of the whole game: it compounds the *measured* per-train revenue and profit of a good route
 * (City 40k ↔ City 40k, 100 km — the balance report's archetype, includes wages, wear, repairs, taxes and
 * competition) for the locomotive of each era, with a network that can grow by `TRAINS_PER_YEAR` trains a year
 * (the player's attention and the map's routes are the limit, not cash) from `START_FLEET`. "An able player", not
 * an optimiser: every January it spends 90 % of its cash on trains and their share of track and stations.
 */
import { priceIndex } from "../../src/data/economy";
import { DIFFICULTY } from "../../src/data/finance";
import { measureMean } from "./balanceRoutes";

const ERAS = [
  { year: 1830, loco: "grasshopper-0-4-0" },
  { year: 1840, loco: "norris-4-2-0" },
  { year: 1860, loco: "american-4-4-0" },
  { year: 1900, loco: "atlantic-4-4-2" },
  { year: 1920, loco: "pacific-4-6-2" },
  { year: 1950, loco: "road-switcher-diesel" },
  { year: 1980, loco: "heavy-diesel" },
] as const;

export const START_FLEET = 2;
export const TRAINS_PER_YEAR = 0.5;
/** Share of the archetype route's per-train revenue and profit the able player's average train earns: real networks
 * mix smaller towns and freight, and a second train on a pair only splits its supply (PLAYTEST-1: "adding a second
 * train to the same city pair only splits the same supply"). Calibrated so the *old* economy reproduces the
 * play-test's Central Europe game — 16 trains, net worth $4.7M in 1869 from a 1840 start (`OLD_ECONOMY` below). */
export const ROUTE_QUALITY = 0.3;
/** Track, stations and sheds per train at 1830 prices (a 100 km line shared by two trains). */
export const CAPEX_PER_TRAIN_1830 = 110_000;

export interface EraMeasure {
  year: number;
  revenue: number;
  profit: number;
  price: number;
}

/** The pre-28A economy's City 40k ↔ 40k, 100 km numbers (docs/PROGRESS.md "Phase 28A" before table), $. */
export const OLD_ECONOMY: EraMeasure[] = [
  { year: 1830, revenue: 15_000, profit: 10_000, price: 32_000 },
  { year: 1840, revenue: 30_000, profit: 21_000, price: 60_000 },
  { year: 1860, revenue: 207_000, profit: 192_000, price: 94_000 },
  { year: 1900, revenue: 387_000, profit: 361_000, price: 201_000 },
  { year: 1920, revenue: 440_000, profit: 406_000, price: 295_000 },
  { year: 1950, revenue: 520_000, profit: 480_000, price: 468_000 },
  { year: 1980, revenue: 605_000, profit: 537_000, price: 1_070_000 },
];

let cache: EraMeasure[] | undefined;
export function currentEconomy(): EraMeasure[] {
  cache ??= ERAS.map((e) => {
    const r = measureMean({
      cargo: "passengers",
      km: 100,
      year: e.year,
      loco: e.loco,
      population: 40_000,
      tier: "city",
    });
    return { year: e.year, revenue: r.revenue, profit: r.profit, price: r.price };
  });
  return cache;
}

function measureFor(table: readonly EraMeasure[], year: number): EraMeasure {
  let best = table[0] as EraMeasure;
  for (const m of table) if (m.year <= year) best = m;
  return best;
}

export interface OperatorYear {
  year: number;
  fleet: number;
  revenue: number;
  /** Operating profit of the year (the cash it adds), what `annualProfit` goals are checked against. */
  profit: number;
  netWorth: number;
}

/**
 * Phase 77: the strong player V2's median results (`tools/bench/strongPlayer.ts`, `docs/bench/phase77.md`, run on the
 * merged branch with Phases 76 and 78): $M of the completed year 5 / 10 / 16 played, money of the year earned, by the
 * era the company starts in, survivors only. Copied here as plain numbers, not read from `src/data/goals.ts`, so the
 * calibration test compares the goals with an independent record of what the bot earned.
 */
export interface BenchMedians {
  era: number;
  revenue: readonly [number, number, number];
  profit: readonly [number, number, number];
}
export const V2_MEDIANS_NORMAL: readonly BenchMedians[] = [
  { era: 1840, revenue: [0.8, 2.3, 7.89], profit: [0.37, 1.23, 4.88] },
  { era: 1870, revenue: [2.41, 9.29, 11.46], profit: [1.45, 5.64, 6.5] },
  { era: 1900, revenue: [2.42, 4.11, 7.5], profit: [1.35, 1.71, 2.5] },
  { era: 1930, revenue: [0.81, 0.84, 0.85], profit: [0.29, 0.2, 0.18] },
  { era: 1950, revenue: [2.92, 3.34, 3.98], profit: [1.04, 0.94, 1.29] },
];
/** The same on Hard (5 seeds per era). */
export const V2_MEDIANS_HARD: readonly BenchMedians[] = [
  { era: 1840, revenue: [1.0, 2.4, 8.23], profit: [0.61, 1.42, 5.3] },
  { era: 1870, revenue: [2.05, 6.94, 12.1], profit: [1.37, 4.15, 7.57] },
  { era: 1900, revenue: [2.2, 2.94, 4.62], profit: [1.46, 1.23, 1.77] },
  { era: 1930, revenue: [1.43, 1.74, 2.48], profit: [0.92, 0.82, 0.86] },
  { era: 1950, revenue: [0.49, 0.73, 0.71], profit: [0.13, 0.23, 0.1] },
];

/** What V2 earns in its year `k` (1-based): linear from nothing to the year-5, -10 and -16 medians (no earlier data), then
 * flat in real terms after year 16 (the bench ends there; the lines it built saturate: 1900, 1930 and 1950 are flat from
 * year 5 on). Stated in the money of `year`. */
function v2Value(row: BenchMedians, metric: "revenue" | "profit", k: number, year: number): number {
  const m = row[metric];
  const xs = [0, 5, 10, 16];
  const ys = [0, m[0], m[1], m[2]];
  const kk = Math.min(k, 16);
  let i = 1;
  while (i < xs.length - 1 && (xs[i] as number) < kk) i++;
  const t = (kk - (xs[i - 1] as number)) / ((xs[i] as number) - (xs[i - 1] as number));
  const value = ((ys[i - 1] as number) + ((ys[i] as number) - (ys[i - 1] as number)) * t) * 1e6;
  return (value * priceIndex(year)) / priceIndex(row.era + kk - 1);
}

/** The reference operator: plays at the strong player V2's level (PLAN Phase 77, owner OK 2026-11-01). Its books in each
 * year from `startYear` are V2's medians for the era the company starts in (the latest benched era not after the start;
 * Hard's medians when `startCash` is below Normal's), stated in the money of each year. Replaces the compounding model of
 * Phase 28A, which sat 4-30x under what the bot earns (kept below as `compoundingOperator`). */
export function referenceOperator(
  startYear: number,
  endYear: number,
  startCash: number,
  table?: readonly EraMeasure[],
): OperatorYear[] {
  if (table) return compoundingOperator(startYear, endYear, startCash, table);
  const medians = startCash < DIFFICULTY.normal.startingCash ? V2_MEDIANS_HARD : V2_MEDIANS_NORMAL;
  let row = medians[0] as BenchMedians;
  for (const r of medians) if (r.era <= startYear) row = r;
  const out: OperatorYear[] = [];
  for (let year = startYear; year <= endYear; year++) {
    const k = year - startYear + 1;
    out.push({
      year,
      fleet: 0,
      revenue: v2Value(row, "revenue", k, year),
      profit: v2Value(row, "profit", k, year),
      netWorth: 0,
    });
  }
  return out;
}

/** The Phase 28A operator: its books at the end of each year from `startYear` (difficulty start cash given). */
export function compoundingOperator(
  startYear: number,
  endYear: number,
  startCash: number,
  table: readonly EraMeasure[] = currentEconomy(),
): OperatorYear[] {
  let cash = startCash;
  let fleet = 0;
  let capex = 0;
  let trainValue = 0;
  const out: OperatorYear[] = [];
  for (let year = startYear; year <= endYear; year++) {
    const m = measureFor(table, year);
    const scale = priceIndex(year) / priceIndex(m.year);
    // January: buy trains up to the able player's fleet size, with their share of the network.
    const cap = Math.floor(START_FLEET + TRAINS_PER_YEAR * (year - startYear));
    const unit = m.price * scale + CAPEX_PER_TRAIN_1830 * priceIndex(year);
    const affordable = Math.floor((cash * 0.9) / unit);
    const buy = Math.max(0, Math.min(cap - fleet, affordable));
    cash -= buy * unit;
    capex += buy * CAPEX_PER_TRAIN_1830 * priceIndex(year);
    trainValue += buy * m.price * scale;
    fleet += buy;
    const revenue = fleet * m.revenue * scale * ROUTE_QUALITY;
    const profit = fleet * m.profit * scale * ROUTE_QUALITY;
    cash += profit;
    trainValue *= 0.95;
    out.push({ year, fleet, revenue, profit, netWorth: cash + 0.5 * capex + trainValue });
  }
  return out;
}

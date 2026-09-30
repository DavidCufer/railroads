/**
 * A reference operator for calibrating money goals (PLAN Phase 28A "retune goal thresholds from the new numbers").
 * Not a simulation of the whole game: it compounds the *measured* per-train revenue and profit of a good route
 * (City 40k ↔ City 40k, 100 km — the balance report's archetype, includes wages, wear, repairs, taxes and
 * competition) for the locomotive of each era, with a network that can grow by `TRAINS_PER_YEAR` trains a year
 * (the player's attention and the map's routes are the limit, not cash) from `START_FLEET`. "An able player", not
 * an optimiser: every January it spends 90 % of its cash on trains and their share of track and stations.
 */
import { priceIndex } from "../../src/data/economy";
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
  netWorth: number;
}

/** The operator's books at the end of each year from `startYear` (difficulty start cash given). */
export function referenceOperator(
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
    cash += fleet * m.profit * scale * ROUTE_QUALITY;
    trainValue *= 0.95;
    out.push({ year, fleet, revenue, netWorth: cash + 0.5 * capex + trainValue });
  }
  return out;
}

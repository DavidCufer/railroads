/**
 * Per-line books (PLAN Phase 30B): a *line* is the set of trains that share the same set of stops.
 * Pure aggregation over the per-train books; nothing here is saved or feeds back into the sim.
 */
import { fuelEraScale, priceIndex } from "../../data/economy";
import { locomotiveById } from "../../data/trains";
import type { GameState } from "../state";
import { calendarFromTicks, DAYS_PER_MONTH, DAYS_PER_YEAR, HOURS_PER_DAY } from "../time";
import { mechanicalAgeYears } from "../trains/ageing";
import { booksProfit } from "../trains/profit";
import type { Train, TrainBooks } from "../trains/types";
import { fuelPriceMult } from "./panics";
import { carsUpkeepPerYear, locoRunningCostPerYear, trainWagesPerYear } from "./costs";

export interface LineSummary {
  /** Sorted station ids joined with "-" (stable key). */
  key: string;
  /** Stops in the order of the first train's orders (de-duplicated). */
  stationIds: number[];
  trainIds: number[];
  /** This calendar year to date. */
  thisYear: TrainBooks;
  lastYear: TrainBooks;
  /** This year to date: fares earned, and the trains' running costs, wages, track wear and repairs — including the
   * share of the current month not yet booked (costs are booked monthly in arrears, fares as they are delivered). */
  revenueThisYear: number;
  costsThisYear: number;
  /** Profit per year over a rolling 12 months (this year to date + last year, over the time each train was owned);
   * trains owned less than `LINE_RATE_MIN_DAYS` are left out. Undefined while no train of the line is old enough. */
  ratePerYear?: number;
}

/** A train needs this many days of history before it counts towards a line's per-year rate. */
export const LINE_RATE_MIN_DAYS = 90;

function addBooks(a: TrainBooks, b: TrainBooks): TrainBooks {
  return {
    revenue: a.revenue + b.revenue,
    running: a.running + b.running,
    wages: (a.wages ?? 0) + (b.wages ?? 0),
    wear: (a.wear ?? 0) + (b.wear ?? 0),
    repairs: a.repairs + b.repairs,
  };
}

const zero = (): TrainBooks => ({ revenue: 0, running: 0, wages: 0, wear: 0, repairs: 0 });

export function lineKey(stationIds: readonly number[]): string {
  return [...new Set(stationIds)].sort((a, b) => a - b).join("-");
}

/** Running costs and wages of the part of the current month that the monthly step has not booked yet. */
function accruedCosts(state: GameState, train: Train): number {
  const loco = locomotiveById(train.locoModelId);
  if (!loco) return 0;
  const year = calendarFromTicks(state.startYear, state.ticks).year;
  const monthTicks = HOURS_PER_DAY * DAYS_PER_MONTH;
  const sinceMonthStart = state.ticks % monthTicks;
  const owned = Math.min(sinceMonthStart, state.ticks - train.purchaseTick);
  const monthly =
    (locoRunningCostPerYear(loco, mechanicalAgeYears(state, train), year) +
      carsUpkeepPerYear(train.cars, year) +
      trainWagesPerYear(loco, train.cars, year)) /
    12;
  const fuel =
    (train.fuelUnits ?? 0) *
    fuelEraScale(year) *
    priceIndex(year) *
    fuelPriceMult(state, loco.type);
  return (monthly * Math.max(0, owned)) / monthTicks + fuel;
}

/** Lines sorted by profit rate, best first (lines too new for a rate last). Trains with fewer than two distinct
 * stops are skipped. Fares, costs and the rate all come from the same trains' books over stated periods. */
export function lineSummaries(state: GameState): LineSummary[] {
  const lines = new Map<string, LineSummary>();
  const yearTicks = HOURS_PER_DAY * DAYS_PER_YEAR;
  const sinceYearStart = state.ticks % yearTicks;
  for (const t of state.trains) {
    const ids = [...new Set(t.orders.map((o) => o.stationId))];
    if (ids.length < 2) continue;
    const key = lineKey(ids);
    let line = lines.get(key);
    if (!line) {
      line = {
        key,
        stationIds: ids,
        trainIds: [],
        thisYear: zero(),
        lastYear: zero(),
        revenueThisYear: 0,
        costsThisYear: 0,
      };
      lines.set(key, line);
    }
    line.trainIds.push(t.id);
    line.thisYear = addBooks(line.thisYear, t.profit.thisYear);
    line.lastYear = addBooks(line.lastYear, t.profit.lastYear);
    const accrued = accruedCosts(state, t);
    const thisCosts = t.profit.thisYear.revenue - booksProfit(t.profit.thisYear) + accrued;
    line.revenueThisYear += t.profit.thisYear.revenue;
    line.costsThisYear += thisCosts;

    const age = state.ticks - t.purchaseTick;
    if (age >= LINE_RATE_MIN_DAYS * HOURS_PER_DAY) {
      // Rolling 12 months: this year to date plus last year, over the time the train was owned in that window.
      const span = Math.min(age, sinceYearStart + yearTicks);
      const books =
        age > sinceYearStart ? addBooks(t.profit.thisYear, t.profit.lastYear) : t.profit.thisYear;
      const profit = booksProfit(books) - accrued;
      line.ratePerYear = (line.ratePerYear ?? 0) + (profit / span) * yearTicks;
    }
  }
  return [...lines.values()].sort(
    (a, b) => (b.ratePerYear ?? -Infinity) - (a.ratePerYear ?? -Infinity),
  );
}

/** Phase 43: a line is judged to carry its demand comfortably at this average load; fuller trains leave people behind. */
export const LINE_TARGET_LOAD = 0.6;

/** How many of the line's trains would carry the demand it now sees at `LINE_TARGET_LOAD`, from the trains' average
 * load (`Train.loadShare`). Undefined while fewer than two trains have a load yet. Fewer than `trainIds.length` means
 * the line is over-served: the extra trains run near-empty and lose money. */
export function trainsNeeded(state: GameState, trainIds: readonly number[]): number | undefined {
  const loads: number[] = [];
  for (const t of state.trains)
    if (trainIds.includes(t.id) && t.loadShare !== undefined && t.cars.length > 0)
      loads.push(t.loadShare);
  if (loads.length < 2) return undefined;
  const avg = loads.reduce((a, b) => a + b, 0) / loads.length;
  return Math.max(1, Math.ceil((trainIds.length * avg) / LINE_TARGET_LOAD));
}

/** Per-train books (PLAN Phase 24A): what each train earned and what it cost to run, this year, last
 * year and over its lifetime. Costs are the locomotive's own upkeep plus breakdown repairs — track
 * and station upkeep are shared and not attributed to trains. Pure, deterministic, saved. */
import { DAYS_PER_YEAR, HOURS_PER_DAY } from "../time";
import type { Train, TrainBooks, TrainCar, TrainProfit } from "./types";

export function emptyBooks(): TrainBooks {
  return { revenue: 0, running: 0, wages: 0, wear: 0, repairs: 0 };
}

export function emptyTrainProfit(lifetimeRevenue = 0): TrainProfit {
  return {
    thisYear: emptyBooks(),
    lastYear: emptyBooks(),
    lifetime: { ...emptyBooks(), revenue: lifetimeRevenue },
  };
}

/** The tick the train's books began: its purchase, even if the locomotive was replaced since. */
export function booksStartTick(train: Pick<Train, "purchaseTick" | "booksStartTick">): number {
  return train.booksStartTick ?? train.purchaseTick;
}

export function booksProfit(b: TrainBooks): number {
  return b.revenue - b.running - (b.wages ?? 0) - (b.wear ?? 0) - b.repairs;
}

export function recordTrainRevenue(train: Train, amount: number): void {
  train.lifetimeRevenue += amount;
  train.profit.thisYear.revenue += amount;
  train.profit.lifetime.revenue += amount;
}

export function recordTrainRunning(train: Train, amount: number): void {
  train.profit.thisYear.running += amount;
  train.profit.lifetime.running += amount;
}

export function recordTrainWages(train: Train, amount: number): void {
  train.profit.thisYear.wages = (train.profit.thisYear.wages ?? 0) + amount;
  train.profit.lifetime.wages = (train.profit.lifetime.wages ?? 0) + amount;
}

export function recordTrainWear(train: Train, amount: number): void {
  train.profit.thisYear.wear = (train.profit.thisYear.wear ?? 0) + amount;
  train.profit.lifetime.wear = (train.profit.lifetime.wear ?? 0) + amount;
}

export function recordTrainRepair(train: Train, amount: number): void {
  train.profit.thisYear.repairs += amount;
  train.profit.lifetime.repairs += amount;
}

export function rollTrainYear(train: Train): void {
  train.profit.lastYear = train.profit.thisYear;
  train.profit.thisYear = emptyBooks();
}

/** Profit thresholds shared by the panel, the list and the map overlay. */
export type ProfitStatus = "good" | "ok" | "bad" | "new";

/** A train younger than this many days has no verdict yet. */
export const TRAIN_PROFIT_MIN_AGE_DAYS = 60;

/** Lifetime profit per year of ownership (the list's "profit/yr" column and the status verdict). */
export function trainProfitPerYear(train: Train, nowTicks: number): number {
  const ageDays = (nowTicks - booksStartTick(train)) / HOURS_PER_DAY;
  return booksProfit(train.profit.lifetime) / Math.max(0.25, ageDays / DAYS_PER_YEAR);
}

/** Judged on lifetime profit per year once past the first two months: losing money is "bad", a
 * profit under a fifth of the purchase price a year is "ok", better is "good". */
export function trainProfitStatus(train: Train, nowTicks: number): ProfitStatus {
  const ageDays = (nowTicks - booksStartTick(train)) / HOURS_PER_DAY;
  if (ageDays < TRAIN_PROFIT_MIN_AGE_DAYS) return "new";
  const perYear = trainProfitPerYear(train, nowTicks);
  if (perYear < 0) return "bad";
  return perYear >= train.purchasePrice * 0.2 ? "good" : "ok";
}

/** The window (tiles run) over which a train's average load is judged (Phase 43). */
export const LOAD_SHARE_WINDOW_TILES = 150;

/** Total seats/space of a train in units of cargo, and how much of it is taken. */
export function trainLoad(train: Pick<Train, "cars">, capacityOf: (c: TrainCar) => number): number {
  let cap = 0;
  let used = 0;
  for (const c of train.cars) {
    cap += capacityOf(c);
    used += c.loadedUnits;
  }
  return cap > 0 ? used / cap : 0;
}

/** Folds `tiles` run at load `load` (0..1) into the train's average load. */
export function recordTrainLoad(train: Train, load: number, tiles: number): void {
  const previous = train.loadShare ?? load;
  train.loadShare = previous + (load - previous) * Math.min(1, tiles / LOAD_SHARE_WINDOW_TILES);
}

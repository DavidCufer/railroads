/**
 * Per-line books (PLAN Phase 30B): a *line* is the set of trains that share the same set of stops.
 * Pure aggregation over the per-train books; nothing here is saved or feeds back into the sim.
 */
import type { GameState } from "../state";
import { booksProfit, trainProfitPerYear } from "../trains/profit";
import type { TrainBooks } from "../trains/types";

export interface LineSummary {
  /** Sorted station ids joined with "-" (stable key). */
  key: string;
  /** Stops in the order of the first train's orders (de-duplicated). */
  stationIds: number[];
  trainIds: number[];
  /** This calendar year to date. */
  thisYear: TrainBooks;
  lastYear: TrainBooks;
  /** Lifetime profit per year of ownership, summed over the trains. */
  profitPerYear: number;
}

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

/** Lines sorted by profit per year, best first. Trains with fewer than two distinct stops are skipped. */
export function lineSummaries(state: GameState): LineSummary[] {
  const lines = new Map<string, LineSummary>();
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
        profitPerYear: 0,
      };
      lines.set(key, line);
    }
    line.trainIds.push(t.id);
    line.thisYear = addBooks(line.thisYear, t.profit.thisYear);
    line.lastYear = addBooks(line.lastYear, t.profit.lastYear);
    line.profitPerYear += trainProfitPerYear(t, state.ticks);
  }
  return [...lines.values()].sort((a, b) => b.profitPerYear - a.profitPerYear);
}

/**
 * Phase 66 bot policy: lay trains up on losing lines during a panic and bring them back when the panic ends or the
 * line's waiting traffic needs them. Shared by strongPlayer.ts and goodPlayer.ts. All actions are player commands.
 * `LAYUP=0` switches it off (for a baseline run).
 */
import { layUpTrain, returnTrainToService } from "../../src/sim/commands";
import { activePanic } from "../../src/sim/finance/panics";
import { lineKey } from "../../src/sim/finance/lines";
import { booksProfit } from "../../src/sim/trains/profit";
import { carCapacity } from "../../src/sim/trains/capacity";
import type { GameState } from "../../src/sim/state";
import type { Train } from "../../src/sim/trains/types";

/** Months of a line's books the bot judges it by. */
const WINDOW_MONTHS = 3;
/** Days after bringing a line's train back before the bot lays one of that line up again. */
const COOLDOWN_DAYS = 90;
/** A line "needs" a laid-up train back when this many train-loads wait at its stops. */
const NEED_LOADS = 1.5;

export interface LayUpOptions {
  /** Strong bot: also brings trains back while a panic lasts when the line's waiting traffic fills them. */
  returnOnTraffic: boolean;
}

export interface LayUpStats {
  laidUp: number;
  returned: number;
}

export function createLayUpPolicy(opts: LayUpOptions) {
  const enabled = process.env["LAYUP"] !== "0";
  const snapshots: Array<Map<number, number>> = [];
  const lastReturn = new Map<string, number>();
  const stats: LayUpStats = { laidUp: 0, returned: 0 };

  const lineOf = (t: Train): string | undefined => {
    const ids = [...new Set(t.orders.map((o) => o.stationId))];
    return ids.length < 2 ? undefined : lineKey(ids);
  };

  /** Call once a month, right after the monthly books closed. */
  function sample(state: GameState): void {
    const snap = new Map<number, number>();
    for (const t of state.trains) snap.set(t.id, booksProfit(t.profit.lifetime));
    snapshots.push(snap);
    if (snapshots.length > WINDOW_MONTHS + 1) snapshots.shift();
  }

  function lineProfit(state: GameState, ids: readonly number[]): number | undefined {
    if (snapshots.length < WINDOW_MONTHS + 1) return undefined;
    const old = snapshots[0]!;
    let total = 0;
    let counted = 0;
    for (const id of ids) {
      const t = state.trains.find((x) => x.id === id);
      const before = old.get(id);
      if (!t || before === undefined) continue;
      total += booksProfit(t.profit.lifetime) - before;
      counted++;
    }
    return counted > 0 ? total : undefined;
  }

  function waitingLoads(state: GameState, t: Train): number {
    const carried = new Set(t.cars.map((c) => c.cargoType));
    const capacity = t.cars.reduce((s, c) => s + carCapacity(c), 0);
    if (capacity <= 0) return 0;
    let waiting = 0;
    for (const id of new Set(t.orders.map((o) => o.stationId)))
      for (const [cargo, pile] of Object.entries(state.stationCargo.get(id) ?? {}))
        if (carried.has(cargo as Train["cars"][number]["cargoType"])) waiting += pile?.amount ?? 0;
    return waiting / capacity;
  }

  /** Call every few days. */
  function manage(state: GameState): void {
    if (!enabled) return;
    const panic = activePanic(state);
    const byLine = new Map<string, Train[]>();
    for (const t of state.trains) {
      const key = lineOf(t);
      if (key === undefined) continue;
      const list = byLine.get(key);
      if (list) list.push(t);
      else byLine.set(key, [t]);
    }
    for (const [key, trains] of byLine) {
      const laid = trains.filter((t) => t.laidUp && t.returnTicksLeft === undefined);
      for (const t of laid) {
        const needed = opts.returnOnTraffic && waitingLoads(state, t) >= NEED_LOADS;
        if (!panic || needed) {
          if (returnTrainToService(state, t.id).ok) {
            stats.returned++;
            lastReturn.set(key, state.ticks);
          }
          if (needed) break; // one at a time: it takes days to show
        }
      }
      if (!panic) continue;
      const inService = trains.filter((t) => !t.laidUp);
      if (inService.length < 2) continue; // keep at least one train per line
      if (state.ticks - (lastReturn.get(key) ?? -Infinity) < COOLDOWN_DAYS * 24) continue;
      const profit = lineProfit(
        state,
        trains.map((t) => t.id),
      );
      if (profit === undefined || profit >= 0) continue;
      // The emptiest train standing at a station goes first (one per line per call).
      const candidates = inService
        .filter((t) => t.status === "loading" && (t.loadShare ?? 1) < 0.9)
        .sort((a, b) => (a.loadShare ?? 1) - (b.loadShare ?? 1));
      for (const t of candidates) {
        if (layUpTrain(state, t.id).ok) {
          stats.laidUp++;
          break;
        }
      }
    }
  }

  /** True when `trainId` is laid up (the bots' own line bookkeeping must not add trains to such a line). */
  const lineHasLaidUp = (state: GameState, trainIds: readonly number[]): boolean =>
    state.trains.some((t) => t.laidUp && trainIds.includes(t.id));

  return { sample, manage, lineHasLaidUp, stats };
}

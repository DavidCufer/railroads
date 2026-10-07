/**
 * Daily waiting-cargo accrual and decay at stations (SPEC §6.3): "every day, each producer inside
 * the catchment adds its daily output to the station's waiting pile"; freight past its decay
 * threshold loses `WAITING_DECAY_RATE_PER_DAY`/day; passengers and mail fill linearly to one month (Phase 35D). Called once per in-game day
 * (src/sim/tick.ts). Loading/unloading (src/sim/trains/loading.ts) is what drains a pile and resets
 * its age.
 */
import {
  CARGO_TYPES,
  givesUpWaiting,
  WAITING_DECAY_RATE_PER_DAY,
  waitingDecayThresholdDays,
} from "../../data/cargo";
import { cargoDecayExempt, stationStorageCap } from "../stations/improvements";
import { recordPileFull, recordTurnedAway } from "../stations/flow";
import { panicDemandMult } from "../finance/panics";
import { DAYS_PER_MONTH } from "../time";
import type { GameState, StationCargoPile } from "../state";

const DECAY_FLOOR = 0.05;

/** Phase 35D: a passenger/mail pile fills at `monthly / 30` a day and holds at most one month of that bucket's rate. */
function accrueLinear(
  entry: StationCargoPile,
  monthly: number,
  daily: number,
  shares: ReadonlyArray<{ stationId: number; share: number }> | undefined,
): number {
  let overflow = 0;
  if (!shares || shares.length === 0) {
    // One generic pile (mail, or a station no passenger train calls at): people of old buckets are unassigned now.
    delete entry.bound;
    const total = Math.min(entry.amount, monthly);
    const room = monthly - total;
    const add = Math.min(daily, room);
    overflow = daily - add;
    entry.amount = total + add;
    return overflow;
  }
  const bound: Record<number, number> = {};
  const oldBound = entry.bound ?? {};
  let boundTotal = 0;
  let oldBoundTotal = 0;
  for (const v of Object.values(oldBound)) oldBoundTotal += v;
  const unbound = Math.max(0, entry.amount - oldBoundTotal);
  for (const { stationId, share } of shares) {
    const cap = monthly * share;
    const have = Math.min(oldBound[stationId] ?? 0, cap);
    const add = Math.min(daily * share, cap - have);
    overflow += daily * share - add;
    bound[stationId] = have + add;
    boundTotal += have + add;
  }
  // People of a destination that is no longer reachable (or whose bucket shrank) board any train: unassigned, but
  // the whole pile still holds at most one month of the station's passengers.
  entry.bound = bound;
  entry.amount = boundTotal + Math.min(unbound, Math.max(0, monthly - boundTotal));
  return overflow;
}

export function accrueDailyCargo(state: GameState): void {
  const demand = panicDemandMult(state);
  for (const station of state.stations) {
    const economy = state.stationEconomy.get(station.id);
    if (!economy) continue;

    let pile = state.stationCargo.get(station.id);
    if (!pile) {
      pile = {};
      state.stationCargo.set(station.id, pile);
    }

    for (const cargo of CARGO_TYPES) {
      const cap = stationStorageCap(station, cargo);
      const monthly = (economy.supply[cargo] ?? 0) * demand;
      const daily = monthly / DAYS_PER_MONTH;
      const entry: StationCargoPile = pile[cargo] ?? { amount: 0, waitingDays: 0 };
      if (givesUpWaiting(cargo)) {
        // People and post (Phase 30A, 35D): no storage cap; linear fill to one month per bucket, overflow is the
        // "unserved demand" the station panel shows. Passengers are stored by first leg (Phase 35).
        const shares = cargo === "passengers" ? economy.passengerBound : undefined;
        const overflow = accrueLinear(entry, monthly, daily, shares);
        if (overflow > 0) recordTurnedAway(state, station.id, cargo, overflow);
        if (entry.amount > DECAY_FLOOR) entry.waitingDays++;
        else {
          entry.amount = 0;
          entry.waitingDays = 0;
          delete entry.bound;
        }
        pile[cargo] = entry;
        continue;
      }
      if (daily > 0) {
        const lost = entry.amount + daily - cap;
        if (lost > 0) recordPileFull(state, station.id, cargo, lost);
        entry.amount = Math.min(cap, entry.amount + daily);
      }

      if (entry.amount > DECAY_FLOOR) {
        entry.waitingDays++;
        if (
          !cargoDecayExempt(station, cargo) &&
          entry.waitingDays > waitingDecayThresholdDays(cargo)
        ) {
          entry.amount *= 1 - WAITING_DECAY_RATE_PER_DAY;
          if (entry.amount <= DECAY_FLOOR) entry.amount = 0;
        }
      } else {
        entry.amount = 0;
        entry.waitingDays = 0;
      }
      pile[cargo] = entry;
    }
  }
}

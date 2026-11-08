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
import type { PassengerRoute } from "../stations/passengerFlows";
import { waitedDays } from "../stations/waiting";
import { MAX_WAIT_DAYS } from "../../data/economy";

const DECAY_FLOOR = 0.05;

/** Phase 35D: a mail pile (or a station no passenger train calls at) fills at `monthly / 30` a day and holds at most one
 * month of the station's rate. Returns the part turned away. */
function accrueLinear(entry: StationCargoPile, monthly: number, daily: number): number {
  const total = Math.min(entry.amount, monthly);
  const add = Math.min(daily, monthly - total);
  entry.amount = total + add;
  return daily - add;
}

/** Phase 54: the passengers of a station wait in one pile, and the pile is what is waiting for the towns its trains reach.
 * Each town's people arrive at their share of the station's rate (`passengerRoutes`, a month) and pile up from the moment a
 * train last took them (`waitingSince`), at most `MAX_WAIT_DAYS` of them; what a train cannot take stays, and only the
 * part above the ceiling is turned away. Returns that part. */
function accruePool(
  state: GameState,
  entry: StationCargoPile,
  stationId: number,
  routes: readonly PassengerRoute[],
  demand: number,
): number {
  let overflow = 0;
  let ceiling = 0;
  for (const route of routes) {
    const rate = route.perMonth / DAYS_PER_MONTH;
    ceiling += rate * MAX_WAIT_DAYS;
    const room =
      Math.max(0, MAX_WAIT_DAYS - waitedDays(state, stationId, route.destination)) * rate;
    const add = Math.min(rate * demand, room);
    entry.amount += add;
    overflow += rate * demand - add;
  }
  // A pile cannot hold more than a full wait of every town (an old save's pile, or a town that lost its service).
  if (entry.amount > ceiling) {
    overflow += entry.amount - ceiling;
    entry.amount = ceiling;
  }
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
        // People and post (Phase 30A, 35D, 54): no storage cap; linear fill, overflow is the "unserved demand" the
        // station panel shows. Passengers wait in one pile per station.
        const overflow =
          cargo === "passengers" && economy.passengerRoutes && economy.passengerRoutes.length > 0
            ? accruePool(state, entry, station.id, economy.passengerRoutes, demand)
            : accrueLinear(entry, monthly, daily);
        if (overflow > 0) recordTurnedAway(state, station.id, cargo, overflow);
        if (entry.amount > DECAY_FLOOR) entry.waitingDays++;
        else {
          entry.amount = 0;
          entry.waitingDays = 0;
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

/**
 * Daily waiting-cargo accrual and decay at stations (SPEC §6.3): "every day, each producer inside
 * the catchment adds its daily output to the station's waiting pile"; cargo past its decay
 * threshold loses `WAITING_DECAY_RATE_PER_DAY`/day. Called once per in-game day
 * (src/sim/tick.ts). Loading/unloading (src/sim/trains/loading.ts) is what drains a pile and resets
 * its age.
 */
import {
  CARGO_TYPES,
  WAITING_DECAY_RATE_PER_DAY,
  waitingDecayThresholdDays,
} from "../../data/cargo";
import { STATION_TYPE_DEFS } from "../../data/stations";
import { DAYS_PER_MONTH } from "../time";
import type { GameState, StationCargoPile } from "../state";

const DECAY_FLOOR = 0.05;

export function accrueDailyCargo(state: GameState): void {
  for (const station of state.stations) {
    const economy = state.stationEconomy.get(station.id);
    if (!economy) continue;

    let pile = state.stationCargo.get(station.id);
    if (!pile) {
      pile = {};
      state.stationCargo.set(station.id, pile);
    }
    const cap = STATION_TYPE_DEFS[station.type].storagePerCargo;

    for (const cargo of CARGO_TYPES) {
      const monthly = economy.supply[cargo] ?? 0;
      const daily = monthly / DAYS_PER_MONTH;
      const entry: StationCargoPile = pile[cargo] ?? { amount: 0, waitingDays: 0 };
      if (daily > 0) entry.amount = Math.min(cap, entry.amount + daily);

      if (entry.amount > DECAY_FLOOR) {
        entry.waitingDays++;
        if (entry.waitingDays > waitingDecayThresholdDays(cargo)) {
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

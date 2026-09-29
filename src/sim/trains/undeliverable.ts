/** Cargo aboard a train that nothing on its route accepts any more (demand changed, orders edited —
 * PLAN Phase 24A). Cars loaded by the normal rules always have a destination, so this only
 * happens after the fact. Pure. */
import type { CargoType } from "../../data/cargo";
import { pushNews } from "../news";
import type { GameState } from "../state";
import { acceptedAtAnyStop } from "./loading";
import type { Train } from "./types";

/** Loaded cars per cargo that no stop of the train's orders accepts. */
export function undeliverableCars(state: GameState, train: Train): Map<CargoType, number> {
  const out = new Map<CargoType, number>();
  if (train.orders.length === 0) return out;
  for (const car of train.cars) {
    if (car.loadedUnits <= 0) continue;
    if (acceptedAtAnyStop(state, train, car.cargoType)) continue;
    out.set(car.cargoType, (out.get(car.cargoType) ?? 0) + 1);
  }
  return out;
}

/** Daily: one news item per train each time it starts carrying undeliverable cargo. */
export function dailyUndeliverableStep(state: GameState): void {
  for (const train of state.trains) {
    const stuck = undeliverableCars(state, train);
    if (stuck.size === 0) {
      delete train.undeliverableReported;
      continue;
    }
    const signature = [...stuck.keys()].sort().join(",");
    if (train.undeliverableReported === signature) continue;
    train.undeliverableReported = signature;
    const [cargo, cars] = [...stuck.entries()][0] as [CargoType, number];
    pushNews(state, { kind: "undeliverable", trainId: train.id, cargo, cars });
  }
}

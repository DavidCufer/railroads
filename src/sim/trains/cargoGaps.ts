/** Cars whose cargo no stop of an order list accepts (PLAN Phase 33): such a car never loads ("Auto" only loads
 * what some later stop takes), so the player must hear about it when planning the route, not after wondering why
 * it runs empty. Pure. */
import type { CargoType } from "../../data/cargo";
import { placesAccepting, type AcceptingPlace } from "../stations/acceptors";
import type { GameState } from "../state";
import { acceptedByOrders } from "./loading";
import type { TrainOrder } from "./types";

export interface CargoGap {
  cargo: CargoType;
  cars: number;
  /** Nearest places that do accept it, measured from the route's last stop. */
  nearest: AcceptingPlace[];
}

export function cargoGaps(
  state: GameState,
  cars: readonly CargoType[],
  orders: readonly TrainOrder[],
): CargoGap[] {
  if (orders.length === 0) return [];
  const counts = new Map<CargoType, number>();
  for (const c of cars) counts.set(c, (counts.get(c) ?? 0) + 1);
  const last = state.stations.find((s) => s.id === orders[orders.length - 1]?.stationId);
  const gaps: CargoGap[] = [];
  for (const [cargo, n] of counts) {
    if (acceptedByOrders(state, orders, cargo)) continue;
    gaps.push({ cargo, cars: n, nearest: last ? placesAccepting(state, cargo, last.tile) : [] });
  }
  return gaps;
}

/** Destination bonus (Phase 26A): how many distinct other stations a station's passenger/mail
 * trains reach. Pure; recomputed with the station economy. */
import { DESTINATION_BONUS_MAX, DESTINATION_BONUS_PER_STOP } from "../../data/cities";
import type { GameState } from "../state";
import type { Train } from "../trains/types";

function carriesPeople(train: Train): boolean {
  return train.cars.some((c) => c.cargoType === "passengers" || c.cargoType === "mail");
}

/** station id -> the distinct other stations reachable on one passenger/mail train's orders. */
export function destinationSets(trains: readonly Train[]): Map<number, Set<number>> {
  const sets = new Map<number, Set<number>>();
  for (const train of trains) {
    if (!carriesPeople(train)) continue;
    for (const from of train.orders) {
      let set = sets.get(from.stationId);
      if (!set) {
        set = new Set();
        sets.set(from.stationId, set);
      }
      for (const to of train.orders) if (to.stationId !== from.stationId) set.add(to.stationId);
    }
  }
  return sets;
}

/** station id -> number of distinct other stations reachable on one passenger/mail train's orders. */
export function destinationCounts(trains: readonly Train[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const [id, set] of destinationSets(trains)) counts.set(id, set.size);
  return counts;
}

/** station id -> the stations it reaches *directly* on one passenger train (Phase 54): a train takes you to any stop it
 * makes, so every pair of its stops is one link. No change of train is counted, a town reached only by changing
 * does not draw trips. A stop marked "pass through" is not a stop. */
export type PassengerNetwork = Map<number, Set<number>>;

export function passengerStops(train: Train): number[] {
  return train.orders.filter((o) => o.rule !== "passThrough").map((o) => o.stationId);
}

export function passengerLinks(trains: readonly Train[]): PassengerNetwork {
  const links: PassengerNetwork = new Map();
  for (const train of trains) {
    if (!train.cars.some((c) => c.cargoType === "passengers")) continue;
    const stops = passengerStops(train);
    for (const a of stops) {
      let set = links.get(a);
      if (!set) links.set(a, (set = new Set()));
      for (const b of stops) if (b !== a) set.add(b);
    }
  }
  return links;
}

/** The passenger network of a game. */
export function passengerNetwork(state: GameState): PassengerNetwork {
  return passengerLinks(state.trains);
}

/** Supply multiplier for a station with `destinations` distinct destinations: 1 for none or one. */
export function destinationSupplyMult(destinations: number): number {
  return (
    1 + Math.min(DESTINATION_BONUS_MAX, DESTINATION_BONUS_PER_STOP * Math.max(0, destinations - 1))
  );
}

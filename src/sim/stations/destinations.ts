/** Destination bonus (Phase 26A): how many distinct other stations a station's passenger/mail
 * trains reach. Pure; recomputed with the station economy. */
import { DESTINATION_BONUS_MAX, DESTINATION_BONUS_PER_STOP } from "../../data/cities";
import { PAIR_DEMAND } from "../../data/economy";
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

/** One destination's weight for a station: the gravity ratio of PAIR_DEMAND (1 = the station's own supply goes there). */
export function pairAffinity(supplyFrom: number, supplyTo: number, distanceTiles: number): number {
  if (supplyFrom <= 0 || supplyTo <= 0) return 0;
  const limit = PAIR_DEMAND.sizeRatioLimit;
  const ratio = Math.min(limit, Math.max(1 / limit, supplyTo / supplyFrom));
  const distance = Math.max(PAIR_DEMAND.refDistanceTiles / 4, distanceTiles);
  const gravity =
    Math.pow(ratio, PAIR_DEMAND.sizeExponent) *
    Math.pow(PAIR_DEMAND.refDistanceTiles / distance, PAIR_DEMAND.distanceExponent);
  return Math.min(1, gravity);
}

/** Total demand multiplier from a station's destination weights: the weights themselves while their sum is at most
 * one, then saturating towards 1 + `extraDestinationMax` (a hub draws more, but never without limit). */
export function pairDemandMultiplier(totalAffinity: number): number {
  if (totalAffinity <= 1) return totalAffinity;
  return 1 + PAIR_DEMAND.extraDestinationMax * (1 - 1 / totalAffinity);
}

/** Supply multiplier for a station with `destinations` distinct destinations: 1 for none or one. */
export function destinationSupplyMult(destinations: number): number {
  return (
    1 + Math.min(DESTINATION_BONUS_MAX, DESTINATION_BONUS_PER_STOP * Math.max(0, destinations - 1))
  );
}

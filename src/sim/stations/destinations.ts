/** Destination bonus (Phase 26A): how many distinct other stations a station's passenger/mail
 * trains reach. Pure; recomputed with the station economy. */
import { DESTINATION_BONUS_MAX, DESTINATION_BONUS_PER_STOP } from "../../data/cities";
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

/** The stations' links (a plain map: station -> linked stations) that also remembers which train *lines* serve each
 * link, so the route search can count changes of train (Phase 48). A line is one distinct list of stops. */
export class PassengerNetwork extends Map<number, Set<number>> {
  /** "a>b" -> the lines running a to b (links are symmetric, so "b>a" holds the same). */
  readonly edgeLines = new Map<string, Set<number>>();
  /** A line's stops joined by commas -> its id. */
  readonly lineIds = new Map<string, number>();

  link(a: number, b: number, line: number): void {
    if (a === b) return;
    for (const [x, y] of [
      [a, b],
      [b, a],
    ] as const) {
      let set = this.get(x);
      if (!set) this.set(x, (set = new Set()));
      set.add(y);
      const key = `${x}>${y}`;
      let lines = this.edgeLines.get(key);
      if (!lines) this.edgeLines.set(key, (lines = new Set()));
      lines.add(line);
    }
  }
}

/** station id -> the stations it is linked to by a passenger/mail train: consecutive stops of the orders' cycle, in
 * both directions (Phase 35 item 2). The graph that decides which destinations are reachable. */
export function passengerLinks(trains: readonly Train[]): PassengerNetwork {
  const links = new PassengerNetwork();
  const lineIds = links.lineIds;
  for (const train of trains) {
    if (!train.cars.some((c) => c.cargoType === "passengers")) continue;
    // Trains with the same stops in the same order run one line: no change between them (Phase 48).
    const key = train.orders.map((o) => o.stationId).join(",");
    let line = lineIds.get(key);
    if (line === undefined) lineIds.set(key, (line = lineIds.size));
    const n = train.orders.length;
    for (let i = 0; i < n; i++)
      links.link(
        (train.orders[i] as { stationId: number }).stationId,
        (train.orders[(i + 1) % n] as { stationId: number }).stationId,
        line,
      );
  }
  return links;
}

/** Supply multiplier for a station with `destinations` distinct destinations: 1 for none or one. */
export function destinationSupplyMult(destinations: number): number {
  return (
    1 + Math.min(DESTINATION_BONUS_MAX, DESTINATION_BONUS_PER_STOP * Math.max(0, destinations - 1))
  );
}

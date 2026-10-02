/**
 * Stops a train's route runs through without stopping (Phase 32): a station that is in the orders, but is neither end
 * of the leg being driven, is passed non-stop — a train stops only at its current target. The Route tab points this
 * out so the player can add the stop where they want it (e.g. Trieste → Venice → Ljubljana → Trieste passes Venice on
 * the way home).
 */
import { locomotiveById } from "../../data/trains";
import type { GameState } from "../state";
import { findTrainRoute } from "./route";
import type { Train } from "./types";

export interface PassedStop {
  /** Index of the (first) order for the station that is passed. */
  orderIndex: number;
  /** Index of the order the leg starts from; the extra stop belongs right after it. */
  fromIndex: number;
}

export function passedOrderStops(state: GameState, train: Train): PassedStop[] {
  const loco = locomotiveById(train.locoModelId);
  const n = train.orders.length;
  if (!loco || n < 2) return [];
  const tileOf = new Map(state.stations.map((s) => [s.id, s.tile]));
  const stationAtTile = new Map(state.stations.map((s) => [s.tile, s.id]));
  const stationTiles = new Set(stationAtTile.keys());
  const found: PassedStop[] = [];
  for (let i = 0; i < n; i++) {
    const from = train.orders[i]!;
    const to = train.orders[(i + 1) % n]!;
    const a = tileOf.get(from.stationId);
    const b = tileOf.get(to.stationId);
    if (a === undefined || b === undefined || a === b) continue;
    const route = findTrainRoute(state.map.width, state.trackGraph, a, b, {
      weightClass: loco.weightClass,
      electric: loco.type === "electric",
      incomingDirection: -1,
      stationTiles,
    });
    if (!route) continue;
    for (const tile of route.slice(1, -1)) {
      const sid = stationAtTile.get(tile);
      if (sid === undefined || sid === from.stationId || sid === to.stationId) continue;
      const j = train.orders.findIndex((o) => o.stationId === sid && o.rule !== "passThrough");
      if (j < 0 || found.some((f) => f.orderIndex === j && f.fromIndex === i)) continue;
      found.push({ orderIndex: j, fromIndex: i });
    }
  }
  return found;
}

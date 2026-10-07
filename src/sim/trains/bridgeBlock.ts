/**
 * Why a route fails on a wooden bridge (Phase 41, PLAYTEST-4 B1): a heavy engine finds no way through, but a route exists
 * once the weight limit is ignored. Pure diagnosis for the train panel, the news and the buy wizard.
 */
import type { WeightClass } from "../../data/trains";
import type { GameState } from "../state";
import type { TrackEdge } from "../track/types";
import { getTrainRuntime } from "./index";
import { findTrainRoute } from "./route";
import type { Train } from "./types";

/** The first wooden bridge on the way from `start` to `goal` that `weightClass` can't cross, or null when the route is
 * fine, doesn't exist for another reason, or needs no wooden bridge. */
export function weightBridgeBlock(
  state: GameState,
  weightClass: WeightClass,
  electric: boolean,
  start: number,
  goal: number,
  incomingDirection = -1,
): TrackEdge | null {
  const options = {
    weightClass,
    electric,
    incomingDirection,
    stationTiles: getTrainRuntime(state).stationTiles,
  };
  const { width } = state.map;
  if (findTrainRoute(width, state.trackGraph, start, goal, options)) return null;
  const path = findTrainRoute(width, state.trackGraph, start, goal, {
    ...options,
    ignoreBridgeWeight: true,
  });
  if (!path) return null;
  for (let i = 0; i + 1 < path.length; i++) {
    const edge = state.trackGraph.getEdge(path[i] as number, path[i + 1] as number);
    if (edge?.bridge === "wood") return edge;
  }
  return null;
}

/** The wooden bridge a `noRoute` train's current order is stuck behind, if that is the reason. */
export function trainWeightBridgeBlock(
  state: GameState,
  train: Train,
  weightClass: WeightClass,
  electric: boolean,
): TrackEdge | null {
  if (train.status !== "noRoute") return null;
  const order = train.orders[train.currentOrderIndex];
  const target = order && state.stations.find((s) => s.id === order.stationId);
  const start = train.route[train.routeIndex];
  if (!target || start === undefined) return null;
  return weightBridgeBlock(state, weightClass, electric, start, target.tile, train.direction);
}

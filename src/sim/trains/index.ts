/** Public surface of the trains sim module (SPEC §7) — see types.ts/route.ts/blocks.ts/movement.ts
 * for the pieces. `stepTrains` is the tick entrypoint main.ts's game loop calls. */
import { computeBlocks, type BlockPartition } from "./blocks";
import { stepTrain, type TrainRuntime } from "./movement";
import type { GameState } from "../state";

export * from "./types";
export * from "./blocks";
export * from "./route";
export * from "./geometry";
export * from "./movement";

interface CacheEntry {
  trackVersion: number;
  partition: BlockPartition;
  stationTiles: Set<number>;
  stationsById: Map<number, GameState["stations"][number]>;
}

const runtimeCache = new WeakMap<GameState, CacheEntry>();

/** The current block partition for `state`, recomputed only when `trackVersion` has changed since
 * the last call (SPEC §7.5: "recompute blocks when track changes"). Exposed for the UI/debug hooks
 * that want to inspect blocks without duplicating this caching.
 *
 * Also builds an id -> Station index alongside the block partition: every command that adds a
 * station (`buildStation`) already bumps `trackVersion` too (a station is a block boundary), so
 * this index is exactly as fresh as `partition` with no extra invalidation to track. Renaming/
 * upgrading a station mutates the existing `Station` object in place, so the index's references
 * stay valid without a rebuild. This turns `stepTrain`'s per-train per-tick "find my order's
 * target station" from an O(stations) scan into an O(1) lookup (Phase 12 perf pass). */
export function getTrainRuntime(state: GameState): TrainRuntime {
  const cached = runtimeCache.get(state);
  if (cached && cached.trackVersion === state.trackVersion) return cached;
  const stationTiles = new Set(state.stations.map((s) => s.tile));
  const partition = computeBlocks(state.trackGraph, stationTiles);
  const stationsById = new Map(state.stations.map((s) => [s.id, s]));
  const entry: CacheEntry = {
    trackVersion: state.trackVersion,
    partition,
    stationTiles,
    stationsById,
  };
  runtimeCache.set(state, entry);
  return entry;
}

/** Advances every train by one tick (SPEC §7.3–§7.5). Call once per sim tick, after track/station
 * commands for the tick have already applied (so a just-bumped `trackVersion` is picked up). */
export function stepTrains(state: GameState): void {
  if (state.trains.length === 0) return;
  const runtime = getTrainRuntime(state);
  for (const train of state.trains) stepTrain(state, train, runtime);
}

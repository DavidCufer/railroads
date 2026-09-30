/** Public surface of the trains sim module (SPEC §7) — see types.ts/route.ts/blocks.ts/movement.ts
 * for the pieces. `stepTrains` is the tick entrypoint main.ts's game loop calls. */
import { computeBlocks, type BlockPartition } from "./blocks";
import { remapReservations, stepTrain, type TrainRuntime } from "./movement";
import { releaseClaims } from "./crossing";
import { edgeKey } from "../track/graph";
import type { GameState } from "../state";

export * from "./types";
export * from "./blocks";
export * from "./route";
export * from "./geometry";
export * from "./movement";
export * from "./stuck";
export { setCrossingForcedReporter } from "./crossing";

interface CacheEntry {
  trackVersion: number;
  partition: BlockPartition;
  stationTiles: Set<number>;
  stationsById: Map<number, GameState["stations"][number]>;
  stationsByTile: Map<number, GameState["stations"][number]>;
  /** True once every train's `heldBlocks` has been re-derived against this partition. */
  reservationsMapped: boolean;
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
 * target station" from an O(stations) scan into an O(1) lookup (Phase 12 perf pass); `stationsByTile`
 * gives the same for movement.ts's "what station is at the far end of this section" lookup (SPEC
 * §7.5's rewritten station-to-station reservation). */
export function getTrainRuntime(state: GameState): TrainRuntime {
  const cached = runtimeCache.get(state);
  if (cached && cached.trackVersion === state.trackVersion) return cached;
  const stationTiles = new Set(state.stations.map((s) => s.tile));
  const partition = computeBlocks(state.trackGraph, stationTiles);
  const stationsById = new Map(state.stations.map((s) => [s.id, s]));
  const stationsByTile = new Map(state.stations.map((s) => [s.tile, s]));
  const entry: CacheEntry = {
    trackVersion: state.trackVersion,
    partition,
    stationTiles,
    stationsById,
    stationsByTile,
    // A brand-new state (nothing cached yet) or a just-loaded save already carries ids that match
    // its own partition; only a *change* of an existing runtime needs the remap.
    reservationsMapped: cached === undefined,
  };
  runtimeCache.set(state, entry);
  return entry;
}

/** Diagnostics hook (`?debug=1` in main.ts logs to the console; tests count calls). Never used by
 * game logic. */
let staleReservationReporter: ((message: string) => void) | undefined;
export function setStaleReservationReporter(fn: ((message: string) => void) | undefined): void {
  staleReservationReporter = fn;
}

/** SPEC §7.5 self-check (PLAN Phase 18 B), run once per game day: a reservation or station slot that
 * belongs to a train which will not actually use it is a leak that would jam the line with no
 * visible blocker. Should never fire — it is a net under the invariants the stress test asserts
 * (tests/sim/trains/phantomJam.test.ts). Clears the stale state and makes the train re-plan. */
export function clearStaleReservations(state: GameState): number {
  const runtime = getTrainRuntime(state);
  let cleared = 0;
  for (const train of state.trains) {
    const problems: string[] = [];
    const routeBlocks = new Set<number>();
    for (let i = 0; i + 1 < train.route.length; i++) {
      const id = runtime.partition.edgeToBlock.get(
        edgeKey(train.route[i] as number, train.route[i + 1] as number),
      );
      if (id !== undefined) routeBlocks.add(id);
    }
    if (train.heldBlocks.some((hb) => !routeBlocks.has(hb.blockId))) {
      problems.push("holds blocks that are not on its route");
    }
    if (train.sectionTargetStationId !== undefined) {
      const target = runtime.stationsById.get(train.sectionTargetStationId);
      if (!target || !train.route.slice(train.routeIndex).includes(target.tile)) {
        problems.push(
          `reserved a slot at station ${train.sectionTargetStationId} it is not heading to`,
        );
      }
    }
    if (
      (train.status === "waitingForBlock" || train.status === "waitingForStation") &&
      train.waitingOn &&
      train.waitingOn.trainIds.length === 0
    ) {
      problems.push("waits with no live blocker");
    }
    if (problems.length === 0) continue;
    cleared++;
    staleReservationReporter?.(`${train.name}: ${problems.join("; ")} — cleared, re-planning`);
    train.heldBlocks = [];
    delete train.sectionTargetStationId;
    delete train.waitingOn;
    train.routeTrackVersion = -1; // re-plan from the current node
  }
  return cleared;
}

/** Advances every train by one tick (SPEC §7.3–§7.5). Call once per sim tick, after track/station
 * commands for the tick have already applied (so a just-bumped `trackVersion` is picked up). */
export function stepTrains(state: GameState): void {
  if (state.trains.length === 0) return;
  const runtime = getTrainRuntime(state);
  const entry = runtimeCache.get(state);
  if (entry && !entry.reservationsMapped) {
    entry.reservationsMapped = true;
    for (const train of state.trains) remapReservations(state, train, runtime);
  }
  if (state.ticks % 24 === 0) clearStaleReservations(state);
  // Claims are released for everyone first: a waiting train with a lower id than the holder would otherwise
  // never see the junction free (the holder releases later in the same tick, and trains stepped after it
  // take it again) and starve behind a steady stream of traffic (PLAN 28A, Bug 4).
  for (const train of state.trains) releaseClaims(train);
  for (const train of state.trains) stepTrain(state, train, runtime);
}

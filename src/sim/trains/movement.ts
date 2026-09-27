/**
 * Per-tick train simulation (SPEC §7.3–§7.5): routing/rerouting, the speed model, and the SPEC
 * §7.5 signaling rewrite (station-to-station section reservation, rewritten after play-testing —
 * "trains wait only at stations, never out on the line"), station capacity, and deadlock recovery.
 * `stepTrain` is called once per train per tick (1 tick = 1 in-game hour) by
 * src/sim/trains/index.ts's `stepTrains`.
 *
 * Signaling model: a **section** is the track between one station and the next station occurring
 * along a train's route (any station counts, whether or not the train stops there — junctions in
 * between are not waiting points, SPEC §7.5). Before leaving a station (a real stop, or pausing
 * mid-route at a through-station), a train atomically reserves *every* block of its path up to the
 * next station (`tryEnterSection`) — it only departs if none of those blocks is held by opposing
 * traffic and the target station has a free slot. Once committed, the whole batch is held in
 * `train.heldBlocks` at once (not one block at a time), and blocks are released from the *front* as
 * the train's tail (not just its head) clears them (`releaseTrailingBlocks`), so a same-direction
 * follower or opposing train further back can reuse the parts of a long section this train has
 * already passed, without waiting for the whole thing to clear.
 */
import {
  CAR_LENGTH_TILES,
  CAR_WEIGHT_EMPTY,
  CAR_WEIGHT_LOADED,
  CURVE_SPEED_FACTOR,
  DEADLOCK_BLOCK_PENALTY,
  DEADLOCK_REROUTE_DAYS,
  DEADLOCK_STUCK_DAYS,
  DEAD_END_REVERSE_HOURS,
  GRADE_EFFORT_FACTOR,
  LOCO_LENGTH_TILES,
  LOCO_WEIGHT_UNITS,
  MAX_SPEED_FACTOR,
  MIN_SPACING_TILES,
  MIN_SPEED_FACTOR,
  TICKS_PER_TILE_DIVISOR,
  WATER_TOWER_RANGE_TILES,
  WATER_TOWER_SPEED_PENALTY,
  locomotiveById,
  type LocomotiveDef,
} from "../../data/trains";
import { STATION_TYPE_DEFS } from "../../data/stations";
import { CARGO } from "../../data/cargo";
import { pushNews } from "../news";
import type { GameState } from "../state";
import type { Station } from "../stations/types";
import { directionSteps } from "../track/graph";
import { directionBetween, edgeDirectionFrom, edgeLengthTiles, tileXY } from "./geometry";
import { blockIdForEdge, type Block, type BlockPartition } from "./blocks";
import { applyPendingConsist, stepLoading } from "./loading";
import { findTrainRoute } from "./route";
import type { HeldBlock, Train, TrainStatus } from "./types";

export interface TrainRuntime {
  trackVersion: number;
  partition: BlockPartition;
  stationTiles: ReadonlySet<number>;
  /** id -> Station, built alongside `partition` (see index.ts's `getTrainRuntime`) — O(1) lookup
   * for the "find my order's target station" check every train does every tick. */
  stationsById: ReadonlyMap<number, Station>;
  /** tile -> Station, same caching as `stationsById` — O(1) lookup for "what station sits at the
   * far end of this section" (SPEC §7.5). */
  stationsByTile: ReadonlyMap<number, Station>;
}

const MAX_EDGE_STEPS_PER_TICK = 8;

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

function setStatus(train: Train, status: TrainStatus): void {
  if (train.status !== status) {
    train.status = status;
    train.waitTicks = 0;
  }
}

/** Like `setStatus`, but for the two "stalled at a boundary" statuses specifically: a train
 * denied for a *different* reason tick to tick (line clear one tick, platform free the next) is
 * still continuously waiting at the same station, so the SPEC §7.5 safety-net clock
 * (`DEADLOCK_REROUTE_DAYS`/`DEADLOCK_STUCK_DAYS`) must keep counting across that flip rather than
 * restarting from 0 every time the specific reason changes — only reset when it was genuinely
 * doing something else (moving, loading) before. */
function setWaitingStatus(train: Train, status: "waitingForBlock" | "waitingForStation"): void {
  const wasWaiting = train.status === "waitingForBlock" || train.status === "waitingForStation";
  train.status = status;
  if (!wasWaiting) train.waitTicks = 0;
}

function currentFractionalPosition(mapWidth: number, train: Train): { x: number; y: number } {
  const a = train.route[train.routeIndex] as number;
  const bTile = train.route[train.routeIndex + 1];
  const [ax, ay] = tileXY(a, mapWidth);
  if (bTile === undefined) return { x: ax + 0.5, y: ay + 0.5 };
  const [bx, by] = tileXY(bTile, mapWidth);
  return {
    x: ax + 0.5 + (bx - ax) * train.edgeProgress,
    y: ay + 0.5 + (by - ay) * train.edgeProgress,
  };
}

/** Physical length of `train`'s consist in tiles (SPEC §7.5's "tail-based release" — how far the
 * tail trails behind the head), from the same STYLE §7 sizing constants the renderer uses. */
function trainLengthTiles(train: Train): number {
  return LOCO_LENGTH_TILES + train.cars.length * CAR_LENGTH_TILES;
}

/** Drops any `heldBlocks` entries whose far end the train's *tail* has now cleared — the entries
 * are always oldest-entered-first, so once the front one survives the check, so does everything
 * behind it. */
function releaseTrailingBlocks(train: Train): void {
  const tailDistance = train.distanceTraveled - trainLengthTiles(train);
  while (train.heldBlocks.length > 0) {
    const front = train.heldBlocks[0] as HeldBlock;
    if (tailDistance < front.enteredAtDistance + front.lengthTiles) break;
    train.heldBlocks.shift();
  }
}

function advanceDistance(train: Train, tiles: number): void {
  train.distanceTraveled += tiles;
  releaseTrailingBlocks(train);
}

function holdsBlockFor(train: Train, runtime: TrainRuntime, a: number, b: number): boolean {
  const blockId = blockIdForEdge(runtime.partition, a, b);
  return blockId !== undefined && train.heldBlocks.some((hb) => hb.blockId === blockId);
}

/** Other trains' live "distance into `blockId`" (0 at the near end, `lengthTiles` at the far end),
 * derived from their own `heldBlocks` entry rather than a per-tick-updated counter. */
function occupantsOfBlock(
  trains: readonly Train[],
  excludeId: number,
  blockId: number,
): Array<{ direction: number; distanceInto: number }> {
  const result: Array<{ direction: number; distanceInto: number }> = [];
  for (const t of trains) {
    if (t.id === excludeId) continue;
    for (const hb of t.heldBlocks) {
      if (hb.blockId === blockId) {
        result.push({
          direction: hb.direction,
          distanceInto: clamp(t.distanceTraveled - hb.enteredAtDistance, 0, hb.lengthTiles),
        });
      }
    }
  }
  return result;
}

/** SPEC §7.5: "any number of trains may be in a section heading the same way. Followers keep a
 * 2-tile spacing and brake behind the leader (on single and double track)" — checked every tick
 * while moving through `blockId` (not just at entry), so a follower keeps braking for as long as a
 * slower/stopped leader stays close ahead, rather than only at the moment it entered the block. */
function leaderAheadTooClose(train: Train, trains: readonly Train[], blockId: number): boolean {
  const mine = train.heldBlocks.find((hb) => hb.blockId === blockId);
  if (!mine) return false;
  const myDistanceInto = clamp(
    train.distanceTraveled - mine.enteredAtDistance,
    0,
    mine.lengthTiles,
  );
  return occupantsOfBlock(trains, train.id, blockId).some(
    (o) =>
      o.direction === mine.direction &&
      o.distanceInto > myDistanceInto &&
      o.distanceInto - myDistanceInto < MIN_SPACING_TILES,
  );
}

/** Trains counting against `station`'s slot capacity (SPEC §7.5): physically parked there (loading
 * at their actual stop, or paused mid-route at a through-station whose onward section reservation
 * failed) plus trains that have already reserved a section ending there ("inbound"). A train that
 * has itself reserved a section departing *from* `station` no longer counts (its
 * `sectionTargetStationId` now points elsewhere). */
function stationOccupancy(state: GameState, station: Station, excludeId: number): number {
  let count = 0;
  for (const t of state.trains) {
    if (t.id === excludeId) continue;
    if (t.sectionTargetStationId === station.id) {
      count++;
      continue;
    }
    if (
      t.sectionTargetStationId === undefined &&
      t.edgeProgress === 0 &&
      t.route[t.routeIndex] === station.tile
    ) {
      count++;
    }
  }
  return count;
}

interface SectionAttemptResult {
  ok: boolean;
  /** The block that denied departure (opposing traffic, or the last block leading into a full
   * station) — what the SPEC §7.5 deadlock-reroute penalty targets. Present only on failure. */
  blockingBlockId?: number;
}

/** Scans `train.route` forward from its current node for the next station tile, gathers every
 * distinct block along the way with its would-be `enteredAtDistance`/`lengthTiles`, and — if no
 * block is held by opposing traffic and the target station has a free slot — reserves the whole
 * batch atomically and departs (SPEC §7.5's "departure check (atomic)"). Also used for a
 * through-station's "reserve the next section before entering" continuation, since from the sim's
 * point of view arriving at a through-station and departing a real stop are the same operation:
 * *this train currently isn't holding a reservation for the edge ahead of it*. */
function tryEnterSection(
  state: GameState,
  train: Train,
  runtime: TrainRuntime,
): SectionAttemptResult {
  const startIndex = train.routeIndex;
  let endIndex = -1;
  for (let i = startIndex + 1; i < train.route.length; i++) {
    if (runtime.stationTiles.has(train.route[i] as number)) {
      endIndex = i;
      break;
    }
  }
  if (endIndex === -1) {
    // The route ran out before reaching another station — shouldn't happen (every route ends at
    // the order's target station), but force a fresh route search rather than getting stuck.
    train.routeTrackVersion = -1;
    return { ok: false };
  }
  const targetStation = runtime.stationsByTile.get(train.route[endIndex] as number);
  if (!targetStation) {
    train.routeTrackVersion = -1;
    return { ok: false };
  }
  train.waitingForStationId = targetStation.id;

  const batch: HeldBlock[] = [];
  let cumulative = 0;
  let lastBlockId: number | undefined;
  for (let i = startIndex; i < endIndex; i++) {
    const a = train.route[i] as number;
    const b = train.route[i + 1] as number;
    const edge = state.trackGraph.getEdge(a, b);
    if (!edge) {
      train.routeTrackVersion = -1;
      return { ok: false };
    }
    const blockId = blockIdForEdge(runtime.partition, a, b);
    if (blockId !== undefined && blockId !== lastBlockId) {
      const block = runtime.partition.blocks[blockId] as Block;
      batch.push({
        blockId,
        direction: directionBetween(a, b, state.map.width),
        enteredAtDistance: train.distanceTraveled + cumulative,
        lengthTiles: block.lengthTiles,
      });
      lastBlockId = blockId;
    }
    cumulative += edgeLengthTiles(edge);
  }

  // Rule 1 (SPEC §7.5): no block on the path may be held by opposing traffic. Double track never
  // blocks here — opposing trains use separate lanes.
  for (const entry of batch) {
    const block = runtime.partition.blocks[entry.blockId] as Block;
    if (block.double) continue;
    const opposing = occupantsOfBlock(state.trains, train.id, entry.blockId).some(
      (o) => o.direction !== entry.direction,
    );
    if (opposing) {
      setWaitingStatus(train, "waitingForBlock");
      return { ok: false, blockingBlockId: entry.blockId };
    }
  }

  // Rule 2: the target station needs a free slot (inside + inbound).
  const occupancy = stationOccupancy(state, targetStation, train.id);
  if (occupancy >= STATION_TYPE_DEFS[targetStation.type].trainCapacity) {
    setWaitingStatus(train, "waitingForStation");
    const last = batch[batch.length - 1];
    return last ? { ok: false, blockingBlockId: last.blockId } : { ok: false };
  }

  train.heldBlocks.push(...batch);
  train.sectionTargetStationId = targetStation.id;
  setStatus(train, "moving");
  return { ok: true };
}

/** Computes a fresh route from the train's current node to `targetStation` and adopts it (or, if
 * none exists, parks the train in `noRoute`). Always releases held blocks — the block partition
 * itself may have just changed, so any previously-held block id is no longer meaningful. */
function tryRoute(
  state: GameState,
  train: Train,
  runtime: TrainRuntime,
  loco: LocomotiveDef,
  targetStation: Station,
): boolean {
  const start = train.route[train.routeIndex] as number;
  const result = findTrainRoute(state.map.width, state.trackGraph, start, targetStation.tile, {
    weightClass: loco.weightClass,
    electric: loco.type === "electric",
    incomingDirection: train.direction,
    stationTiles: runtime.stationTiles,
    blockPenalties: train.blockPenalties,
    edgeToBlock: runtime.partition.edgeToBlock,
  });
  train.routeTrackVersion = runtime.trackVersion;

  // Fresh departure from a station (`route` is just `[start]`): seed one tile of real history
  // behind it from the approach track, so the renderer's consist layout has somewhere to put
  // trailing cars instead of bunching them at the head (PLAN Phase 6 review carry-over). Only
  // applies here — never for a mid-journey reroute, where `route` already has real tiles behind
  // `routeIndex` from the actual, still-relevant journey so far.
  if (
    result &&
    train.route.length <= 1 &&
    train.lastApproachNode >= 0 &&
    state.trackGraph.hasEdge(train.lastApproachNode, start)
  ) {
    train.route = [train.lastApproachNode, ...result];
    train.routeIndex = 1;
  } else {
    train.route = result ?? [start];
    train.routeIndex = 0;
  }
  train.edgeProgress = 0;
  train.heldBlocks = [];
  delete train.sectionTargetStationId;
  const wasNoRoute = train.status === "noRoute";
  setStatus(train, result ? "moving" : "noRoute");
  if (!result && !wasNoRoute) {
    pushNews(state, { kind: "noRoute", trainId: train.id, stationId: targetStation.id });
  }
  return result !== null;
}

export function computeTargetSpeed(
  state: GameState,
  loco: LocomotiveDef,
  train: Train,
  a: number,
  b: number,
): number {
  const load =
    LOCO_WEIGHT_UNITS +
    train.cars.reduce((sum, c) => {
      // SPEC §7.4: "each carload weighs 1 unit when loaded, 0.4 empty" — interpolated by fill
      // fraction under partial loading (PLAN Phase 16) rather than a flat loaded/empty switch.
      const fraction = c.loadedUnits / CARGO[c.cargoType].capacity;
      return sum + CAR_WEIGHT_EMPTY + fraction * (CAR_WEIGHT_LOADED - CAR_WEIGHT_EMPTY);
    }, 0);
  const elevA = state.map.elevation[a] ?? 0;
  const elevB = state.map.elevation[b] ?? 0;
  const grade = Math.max(0, elevB - elevA);
  const effort = load * (1 + GRADE_EFFORT_FACTOR * grade);
  const speedFactor = clamp(loco.power / effort, MIN_SPEED_FACTOR, MAX_SPEED_FACTOR);
  const dirOut = directionBetween(a, b, state.map.width);
  const curve =
    train.direction >= 0 && directionSteps(train.direction, dirOut) === 1 ? CURVE_SPEED_FACTOR : 1;
  // Water Tower rule (SPEC §6.2): steam only, and only once it's gone further than the range
  // without a refill — diesel/electric never accumulate `tilesSinceWaterTower` at all.
  const conditionFactor =
    loco.type === "steam" && train.tilesSinceWaterTower > WATER_TOWER_RANGE_TILES
      ? 1 - WATER_TOWER_SPEED_PENALTY
      : 1;
  return loco.maxSpeedKmh * speedFactor * curve * conditionFactor;
}

/** Handles a train stalled at a boundary (`waitingForBlock`/`waitingForStation`): the
 * deadlock-reroute-with-penalty timeout at `DEADLOCK_REROUTE_DAYS`, and giving up as `stuck` at
 * `DEADLOCK_STUCK_DAYS` (SPEC §7.5).
 *
 * The reroute attempt deliberately does *not* go through `tryRoute` (which always resolves to
 * `moving`/`noRoute`): if the alternate route it finds is immediately blocked too,
 * `tryEnterSection` puts the train right back in `waitingForBlock`/`waitingForStation` — the same
 * status string, so `setStatus` leaves `waitTicks` alone and the stuck-clock keeps counting. Going
 * through `tryRoute` here would flip to `moving` and reset the clock every `DEADLOCK_REROUTE_DAYS`,
 * so a still-congested train would retry forever and never reach `stuck`. */
function checkDeadlockTimeout(
  state: GameState,
  train: Train,
  runtime: TrainRuntime,
  loco: LocomotiveDef,
  blockingBlockId: number | undefined,
): void {
  if (train.waitTicks === DEADLOCK_STUCK_DAYS * 24) {
    setStatus(train, "stuck");
    pushNews(state, { kind: "trafficJam", tile: train.route[train.routeIndex] as number });
    return;
  }
  if (train.waitTicks !== DEADLOCK_REROUTE_DAYS * 24) return;

  const order = train.orders[train.currentOrderIndex];
  const finalTarget = order && runtime.stationsById.get(order.stationId);
  if (!finalTarget) return;
  if (blockingBlockId !== undefined) {
    train.blockPenalties.set(blockingBlockId, DEADLOCK_BLOCK_PENALTY);
  }

  const start = train.route[train.routeIndex] as number;
  const result = findTrainRoute(state.map.width, state.trackGraph, start, finalTarget.tile, {
    weightClass: loco.weightClass,
    electric: loco.type === "electric",
    incomingDirection: train.direction,
    stationTiles: runtime.stationTiles,
    blockPenalties: train.blockPenalties,
    edgeToBlock: runtime.partition.edgeToBlock,
  });
  train.routeTrackVersion = runtime.trackVersion;
  train.route = result ?? [start];
  train.routeIndex = 0;
  train.edgeProgress = 0;
  train.heldBlocks = [];
  delete train.sectionTargetStationId;
  if (!result) {
    setStatus(train, "noRoute");
    pushNews(state, { kind: "noRoute", trainId: train.id, stationId: finalTarget.id });
    return;
  }
  // One attempt at the new route's first section — sets `moving` on success, or the same
  // `waitingForBlock`/`waitingForStation` (with a fresh target) on failure. Either way the next
  // tick's `handleMoving` retries again as usual.
  tryEnterSection(state, train, runtime);
}

function arriveAtStation(state: GameState, train: Train, station: Station): void {
  if (train.routeIndex > 0) {
    train.lastApproachNode = train.route[train.routeIndex - 1] as number;
  }
  train.route = [station.tile];
  train.routeIndex = 0;
  train.edgeProgress = 0;
  train.heldBlocks = [];
  delete train.sectionTargetStationId;
  delete train.waitingForStationId;
  train.blockPenalties.clear();
  train.speed = 0;
  train.direction = -1;
  train.loadTicksLeft = -1;
  train.loadExtraWaitDays = 0;
  // Engine Shed servicing and Water Tower refills happen on any stop at a station that has them
  // (SPEC §6.2), not just a scheduled order stop.
  if (station.hasEngineShed) train.lastServicedTick = state.ticks;
  if (station.hasWaterTower) train.tilesSinceWaterTower = 0;
  // A queued "Edit cars" change (PLAN Phase 15) is applied the moment the train next stops
  // anywhere, whether or not this is one of its scheduled order stops.
  applyPendingConsist(state, train, station);
  setStatus(train, "loading");
}

function handleLoading(state: GameState, train: Train, runtime: TrainRuntime): void {
  if (train.orders.length === 0) return;
  const order = train.orders[train.currentOrderIndex];
  const station = order && runtime.stationsById.get(order.stationId);
  if (!station) return;

  if (stepLoading(state, train, station)) {
    train.currentOrderIndex = (train.currentOrderIndex + 1) % train.orders.length;
    setStatus(train, "moving");
  }
}

/** Shared recovery for `noRoute`/`stuck` trains: reverse off a dead end that isn't the
 * destination after a short wait (SPEC §7.3), and retry routing whenever the track has changed. */
function handleIdle(
  state: GameState,
  train: Train,
  runtime: TrainRuntime,
  loco: LocomotiveDef,
): void {
  const order = train.orders[train.currentOrderIndex];
  const targetStation = order ? runtime.stationsById.get(order.stationId) : undefined;
  const node = train.route[train.routeIndex] as number;

  if (
    targetStation &&
    node !== targetStation.tile &&
    state.trackGraph.neighborsOf(node).length === 1 &&
    train.waitTicks >= DEAD_END_REVERSE_HOURS
  ) {
    const neighbor = state.trackGraph.neighborsOf(node)[0] as number;
    train.route = [node, neighbor];
    train.routeIndex = 0;
    train.edgeProgress = 0;
    train.routeTrackVersion = runtime.trackVersion;
    setStatus(train, "moving");
    return;
  }

  if (!targetStation || train.routeTrackVersion === runtime.trackVersion) return;
  tryRoute(state, train, runtime, loco, targetStation);
}

function handleMoving(
  state: GameState,
  train: Train,
  runtime: TrainRuntime,
  loco: LocomotiveDef,
): void {
  const order = train.orders[train.currentOrderIndex];
  if (!order) {
    setStatus(train, "noRoute");
    return;
  }
  const targetStation = runtime.stationsById.get(order.stationId);
  if (!targetStation) {
    setStatus(train, "noRoute");
    return;
  }

  const statusAtStart = train.status;
  if (
    train.edgeProgress === 0 &&
    (train.route.length < 2 || train.routeTrackVersion !== runtime.trackVersion)
  ) {
    if (!tryRoute(state, train, runtime, loco, targetStation)) return;
  }

  const wasWaiting = statusAtStart !== "moving";
  let remainingTiles = 0;
  if (!wasWaiting) {
    const a = train.route[train.routeIndex] as number;
    const b = train.route[train.routeIndex + 1];
    let targetSpeed = b !== undefined ? computeTargetSpeed(state, loco, train, a, b) : 0;
    if (b !== undefined) {
      const blockId = blockIdForEdge(runtime.partition, a, b);
      if (blockId !== undefined && leaderAheadTooClose(train, state.trains, blockId)) {
        targetSpeed = 0;
      }
    }
    if (train.speed < targetSpeed)
      train.speed = Math.min(targetSpeed, train.speed + loco.maxSpeedKmh);
    else train.speed = Math.max(targetSpeed, train.speed - loco.maxSpeedKmh);
    remainingTiles = train.speed / TICKS_PER_TILE_DIVISOR;
  } else {
    train.speed = 0;
  }

  for (let step = 0; step < MAX_EDGE_STEPS_PER_TICK; step++) {
    const a = train.route[train.routeIndex] as number;
    const b = train.route[train.routeIndex + 1];
    if (b === undefined) {
      if (a === targetStation.tile) {
        arriveAtStation(state, train, targetStation);
      } else {
        // A recovery hop (dead-end reversal) ran out — force a fresh route search next tick.
        train.routeTrackVersion = -1;
      }
      return;
    }

    // Not holding a reservation for the edge immediately ahead means this is either a fresh
    // departure or a through-station the train just reached mid-route (a station tile is always a
    // block boundary, so the block starting here was never part of an earlier batch) — either way,
    // SPEC §7.5's atomic departure check applies the same way.
    if (train.edgeProgress === 0 && !holdsBlockFor(train, runtime, a, b)) {
      const attempt = tryEnterSection(state, train, runtime);
      if (!attempt.ok) {
        checkDeadlockTimeout(state, train, runtime, loco, attempt.blockingBlockId);
        return;
      }
    }

    if (remainingTiles <= 0) return;

    const edge = state.trackGraph.getEdge(a, b);
    if (!edge) {
      // Track destroyed under the train mid-journey: snap back to the last node it fully held and
      // force a reroute from there next tick, rather than continuing across a gone edge.
      train.edgeProgress = 0;
      train.heldBlocks = [];
      delete train.sectionTargetStationId;
      train.routeTrackVersion = -1;
      return;
    }
    const edgeLen = edgeLengthTiles(edge);
    const remainingOnEdge = (1 - train.edgeProgress) * edgeLen;

    if (remainingTiles < remainingOnEdge) {
      train.edgeProgress += remainingTiles / edgeLen;
      advanceDistance(train, remainingTiles);
      if (loco.type === "steam") train.tilesSinceWaterTower += remainingTiles;
      return;
    }

    remainingTiles -= remainingOnEdge;
    advanceDistance(train, remainingOnEdge);
    if (loco.type === "steam") train.tilesSinceWaterTower += remainingOnEdge;
    train.edgeProgress = 0;
    train.routeIndex++;
    train.direction = edgeDirectionFrom(edge, a);

    if (train.routeTrackVersion !== runtime.trackVersion) {
      if (!tryRoute(state, train, runtime, loco, targetStation)) return;
    }
  }
}

export function stepTrain(state: GameState, train: Train, runtime: TrainRuntime): void {
  train.renderFromX = train.renderToX;
  train.renderFromY = train.renderToY;
  train.waitTicks++;

  if (train.breakdownTicksLeft > 0) {
    // Frozen in place for the repair (SPEC §7.6) — keeps its held blocks (still physically
    // occupying them) and skips loading/routing/movement entirely for the tick.
    train.breakdownTicksLeft--;
    setStatus(train, "broken");
    train.speed = 0;
    if (train.breakdownTicksLeft === 0) {
      setStatus(train, train.route.length >= 2 ? "moving" : "loading");
    }
  } else {
    const loco = locomotiveById(train.locoModelId);
    if (loco) {
      if (train.status === "loading") handleLoading(state, train, runtime);
      else if (train.status === "noRoute" || train.status === "stuck")
        handleIdle(state, train, runtime, loco);
      else handleMoving(state, train, runtime, loco);
    }
  }

  const pos = currentFractionalPosition(state.map.width, train);
  train.renderToX = pos.x;
  train.renderToY = pos.y;
}

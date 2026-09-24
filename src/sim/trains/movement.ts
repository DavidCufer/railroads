/**
 * Per-tick train simulation (SPEC §7.3–§7.5): routing/rerouting, the speed model, block
 * reservation and release, station capacity, and deadlock recovery. `stepTrain` is called once per
 * train per tick (1 tick = 1 in-game hour) by src/sim/trains/index.ts's `stepTrains`.
 */
import {
  CAR_WEIGHT_EMPTY,
  CAR_WEIGHT_LOADED,
  CURVE_SPEED_FACTOR,
  DEADLOCK_BLOCK_PENALTY,
  DEADLOCK_REROUTE_DAYS,
  DEADLOCK_STUCK_DAYS,
  DEAD_END_REVERSE_HOURS,
  GRADE_EFFORT_FACTOR,
  LOCO_WEIGHT_UNITS,
  MAX_SPEED_FACTOR,
  MIN_SPACING_TILES_DOUBLE_TRACK,
  MIN_SPEED_FACTOR,
  TICKS_PER_TILE_DIVISOR,
  locomotiveById,
  type LocomotiveDef,
} from "../../data/trains";
import { STATION_TYPE_DEFS } from "../../data/stations";
import type { GameState } from "../state";
import type { Station } from "../stations/types";
import { directionSteps } from "../track/graph";
import { directionBetween, edgeDirectionFrom, edgeLengthTiles, tileXY } from "./geometry";
import { blockIdForEdge, blockOtherEnd, type BlockPartition } from "./blocks";
import { stepLoading } from "./loading";
import { findTrainRoute } from "./route";
import type { Train, TrainStatus } from "./types";

export interface TrainRuntime {
  trackVersion: number;
  partition: BlockPartition;
  stationTiles: ReadonlySet<number>;
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

function bumpHeldBlockDistance(train: Train, tiles: number): void {
  const newest = train.heldBlocks[train.heldBlocks.length - 1];
  if (newest) newest.distanceInto += tiles;
}

function holdsBlockFor(train: Train, runtime: TrainRuntime, a: number, b: number): boolean {
  const blockId = blockIdForEdge(runtime.partition, a, b);
  const newest = train.heldBlocks[train.heldBlocks.length - 1];
  return blockId !== undefined && newest !== undefined && newest.blockId === blockId;
}

function otherTrainsInBlock(
  trains: readonly Train[],
  excludeId: number,
  blockId: number,
): Array<{ direction: number; distanceInto: number }> {
  const result: Array<{ direction: number; distanceInto: number }> = [];
  for (const t of trains) {
    if (t.id === excludeId) continue;
    for (const hb of t.heldBlocks) {
      if (hb.blockId === blockId)
        result.push({ direction: hb.direction, distanceInto: hb.distanceInto });
    }
  }
  return result;
}

function stationOccupancy(state: GameState, runtime: TrainRuntime, station: Station): number {
  let count = 0;
  for (const t of state.trains) {
    const order = t.orders[t.currentOrderIndex];
    if (!order || order.stationId !== station.id) continue;
    if (t.status === "loading") {
      count++;
      continue;
    }
    const newest = t.heldBlocks[t.heldBlocks.length - 1];
    if (!newest) continue;
    const block = runtime.partition.blocks[newest.blockId];
    if (block && (block.nodeA === station.tile || block.nodeB === station.tile)) count++;
  }
  return count;
}

/** Attempts to reserve the block covering edge (a, b) for `train`, including the station-capacity
 * gate when that block leads directly to `targetStation` (SPEC §7.5: "reserve station slot
 * together with the final block"). Sets `waitingForBlock`/`waitingForStation` and returns false on
 * denial; on success, adds the reservation (dropping anything older than the one-block lag). */
function tryEnterBlock(
  state: GameState,
  train: Train,
  runtime: TrainRuntime,
  a: number,
  b: number,
  targetStation: Station,
): boolean {
  const blockId = blockIdForEdge(runtime.partition, a, b);
  if (blockId === undefined) return true; // not part of any computed block — fail open
  const block = runtime.partition.blocks[blockId];
  if (!block) return true;
  const direction = directionBetween(a, b, state.map.width);
  const occupants = otherTrainsInBlock(state.trains, train.id, blockId);

  if (block.double) {
    const sameDirection = occupants.filter((o) => o.direction === direction);
    if (sameDirection.length > 0) {
      const nearest = Math.min(...sameDirection.map((o) => o.distanceInto));
      if (nearest < MIN_SPACING_TILES_DOUBLE_TRACK) {
        setStatus(train, "waitingForBlock");
        return false;
      }
    }
  } else if (occupants.length > 0) {
    setStatus(train, "waitingForBlock");
    return false;
  }

  if (blockOtherEnd(block, a) === targetStation.tile) {
    const occupancy = stationOccupancy(state, runtime, targetStation);
    if (occupancy >= STATION_TYPE_DEFS[targetStation.type].trainCapacity) {
      setStatus(train, "waitingForStation");
      return false;
    }
  }

  train.heldBlocks.push({ blockId, direction, distanceInto: 0 });
  while (train.heldBlocks.length > 2) train.heldBlocks.shift();
  return true;
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
  setStatus(train, result ? "moving" : "noRoute");
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
    train.cars.reduce((sum, c) => sum + (c.loaded ? CAR_WEIGHT_LOADED : CAR_WEIGHT_EMPTY), 0);
  const elevA = state.map.elevation[a] ?? 0;
  const elevB = state.map.elevation[b] ?? 0;
  const grade = Math.max(0, elevB - elevA);
  const effort = load * (1 + GRADE_EFFORT_FACTOR * grade);
  const speedFactor = clamp(loco.power / effort, MIN_SPEED_FACTOR, MAX_SPEED_FACTOR);
  const dirOut = directionBetween(a, b, state.map.width);
  const curve =
    train.direction >= 0 && directionSteps(train.direction, dirOut) === 1 ? CURVE_SPEED_FACTOR : 1;
  return loco.maxSpeedKmh * speedFactor * curve;
}

/** Handles a train sitting stalled at a boundary (`waitingForBlock`/`waitingForStation`): the
 * deadlock-reroute-with-penalty timeout at `DEADLOCK_REROUTE_DAYS`, and giving up as `stuck` at
 * `DEADLOCK_STUCK_DAYS` (SPEC §7.5).
 *
 * The reroute attempt deliberately does *not* go through `tryRoute` (which always resolves to
 * `moving`/`noRoute`): if the alternate route it finds is immediately blocked too, `tryEnterBlock`
 * puts the train right back in `waitingForBlock`/`waitingForStation` — the same status string, so
 * `setStatus` leaves `waitTicks` alone and the stuck-clock keeps counting. Going through `tryRoute`
 * here would flip to `moving` and reset the clock every `DEADLOCK_REROUTE_DAYS`, so a
 * still-congested train would retry forever and never reach `stuck`. */
function checkDeadlockTimeout(
  state: GameState,
  train: Train,
  runtime: TrainRuntime,
  loco: LocomotiveDef,
  targetStation: Station,
  a: number,
  b: number,
): void {
  if (train.waitTicks === DEADLOCK_STUCK_DAYS * 24) {
    setStatus(train, "stuck");
    return;
  }
  if (train.waitTicks !== DEADLOCK_REROUTE_DAYS * 24) return;

  const blockingBlockId = blockIdForEdge(runtime.partition, a, b);
  if (blockingBlockId !== undefined)
    train.blockPenalties.set(blockingBlockId, DEADLOCK_BLOCK_PENALTY);

  const result = findTrainRoute(state.map.width, state.trackGraph, a, targetStation.tile, {
    weightClass: loco.weightClass,
    electric: loco.type === "electric",
    incomingDirection: train.direction,
    stationTiles: runtime.stationTiles,
    blockPenalties: train.blockPenalties,
    edgeToBlock: runtime.partition.edgeToBlock,
  });
  train.routeTrackVersion = runtime.trackVersion;
  train.route = result ?? [a];
  train.routeIndex = 0;
  train.edgeProgress = 0;
  train.heldBlocks = [];
  if (!result) {
    setStatus(train, "noRoute");
    return;
  }
  const next = train.route[1];
  if (next === undefined || tryEnterBlock(state, train, runtime, a, next, targetStation)) {
    setStatus(train, "moving");
  }
}

function arriveAtStation(train: Train, station: Station): void {
  if (train.routeIndex > 0) {
    train.lastApproachNode = train.route[train.routeIndex - 1] as number;
  }
  train.route = [station.tile];
  train.routeIndex = 0;
  train.edgeProgress = 0;
  train.heldBlocks = [];
  train.blockPenalties.clear();
  train.speed = 0;
  train.direction = -1;
  train.loadTicksLeft = -1;
  train.loadExtraWaitDays = 0;
  setStatus(train, "loading");
}

function handleLoading(state: GameState, train: Train): void {
  if (train.orders.length === 0) return;
  const order = train.orders[train.currentOrderIndex];
  const station = order && state.stations.find((s) => s.id === order.stationId);
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
  const targetStation = order ? state.stations.find((s) => s.id === order.stationId) : undefined;
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
  const targetStation = state.stations.find((s) => s.id === order.stationId);
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
    const targetSpeed = b !== undefined ? computeTargetSpeed(state, loco, train, a, b) : 0;
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
        arriveAtStation(train, targetStation);
      } else {
        // A recovery hop (dead-end reversal) ran out — force a fresh route search next tick.
        train.routeTrackVersion = -1;
      }
      return;
    }

    if (train.edgeProgress === 0 && !holdsBlockFor(train, runtime, a, b)) {
      if (!tryEnterBlock(state, train, runtime, a, b, targetStation)) {
        checkDeadlockTimeout(state, train, runtime, loco, targetStation, a, b);
        return;
      }
      setStatus(train, "moving");
    }

    if (remainingTiles <= 0) return;

    const edge = state.trackGraph.getEdge(a, b);
    if (!edge) {
      // Track destroyed under the train mid-journey: snap back to the last node it fully held and
      // force a reroute from there next tick, rather than continuing across a gone edge.
      train.edgeProgress = 0;
      train.heldBlocks = [];
      train.routeTrackVersion = -1;
      return;
    }
    const edgeLen = edgeLengthTiles(edge);
    const remainingOnEdge = (1 - train.edgeProgress) * edgeLen;

    if (remainingTiles < remainingOnEdge) {
      train.edgeProgress += remainingTiles / edgeLen;
      bumpHeldBlockDistance(train, remainingTiles);
      return;
    }

    remainingTiles -= remainingOnEdge;
    bumpHeldBlockDistance(train, remainingOnEdge);
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

  const loco = locomotiveById(train.locoModelId);
  if (loco) {
    if (train.status === "loading") handleLoading(state, train);
    else if (train.status === "noRoute" || train.status === "stuck")
      handleIdle(state, train, runtime, loco);
    else handleMoving(state, train, runtime, loco);
  }

  const pos = currentFractionalPosition(state.map.width, train);
  train.renderToX = pos.x;
  train.renderToY = pos.y;
}

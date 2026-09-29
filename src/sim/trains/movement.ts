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
  FOLLOW_GAIN_KMH_PER_TILE,
  FOLLOW_MIN_GAP_TILES,
  TRAIN_ACCEL_KMH_PER_TICK,
  TRAIN_BRAKE_KMH_PER_TICK,
  MIN_SPEED_FACTOR,
  SIGNAL_FAIRNESS_HOURS,
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
import { trainBodyLength, updateCrossing } from "./crossing";
import { applyPendingConsist, stepLoading } from "./loading";
import { findTrainRoute } from "./route";
import type { HeldBlock, Train, TrainOrder, TrainStatus } from "./types";

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
    // "stuck" is what a waiting train turns into after DEADLOCK_STUCK_DAYS: keep saying why.
    if (status !== "waitingForBlock" && status !== "waitingForStation" && status !== "stuck")
      delete train.waitingOn;
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
  return trainBodyLength(train);
}

/** How far the head may still advance before it must stop short of a junction/crossing held by
 * another train (PLAN Phase 25A); `Infinity` when free. Claims the next junction cluster when free. */
function crossingLimit(state: GameState, train: Train, runtime: TrainRuntime): number {
  let endIndex = train.route.length - 1;
  const target =
    train.sectionTargetStationId !== undefined
      ? runtime.stationsById.get(train.sectionTargetStationId)
      : undefined;
  if (target) {
    const i = train.route.indexOf(target.tile, train.routeIndex + 1);
    if (i >= 0) endIndex = i;
  }
  const found = nearestLeader(train, state.trains);
  const leaderHeadDist = found ? found.gap + trainLengthTiles(found.leader) : Infinity;
  return updateCrossing(state, train, runtime.stationTiles, endIndex, leaderHeadDist, (blockers) =>
    inWaitCycle(state, train, blockers),
  ).limit;
}

/** Who `t` is stuck behind: whatever it waits for at a station (line / platform), a stopped train's
 * leader, and — unless `withoutCrossings` — the holders of the junction it waits for. */
export function waitsFor(state: GameState, t: Train, withoutCrossings = false): number[] {
  const ids = [...(t.waitingOn?.trainIds ?? [])];
  if (!withoutCrossings) ids.push(...(t.crossingWait?.trainIds ?? []));
  if (t.speed === 0) {
    const found = nearestLeader(t, state.trains);
    if (found) ids.push(found.leader.id);
  }
  return ids;
}

function reach(state: GameState, from: readonly number[], withoutCrossings = false): Set<number> {
  const byId = new Map(state.trains.map((t) => [t.id, t]));
  const seen = new Set<number>();
  const stack = [...from];
  while (stack.length > 0) {
    const id = stack.pop() as number;
    if (seen.has(id)) continue;
    seen.add(id);
    const t = byId.get(id);
    if (t) stack.push(...waitsFor(state, t, withoutCrossings));
  }
  return seen;
}

/** True when `train` is stuck in a wait-for cycle that exists only because of junction holds (it
 * would dissolve without them) and has the lowest id among the cycle's junction waiters, so exactly
 * one of them goes first. Cycles made only of station waits and queues are the older signaling
 * logic's business (its reroute safety net), and forcing a junction would not help them. */
function inWaitCycle(state: GameState, train: Train, blockers: readonly number[]): boolean {
  const fromMe = reach(state, blockers);
  if (!fromMe.has(train.id)) return false;
  const byId = new Map(state.trains.map((t) => [t.id, t]));
  for (const id of fromMe) {
    const t = byId.get(id);
    if (!t || !reach(state, [id]).has(train.id)) continue; // not in my cycle
    if (reach(state, waitsFor(state, t, true), true).has(id)) return false; // cycle without junctions
    if (id < train.id && t.crossingWait) return false; // a lower-id junction waiter goes first
  }
  return true;
}

/** Stations are the passing places (§7.5): a train standing in one holds no crossing claims. */
function dropClaims(train: Train): void {
  train.nodeClaims = [];
  delete train.crossingWait;
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

/** True while the train is out on the line inside a reserved section (not at a station node). A
 * track change during that time does not re-plan it: the reservation is still valid, waiting for
 * the next station to re-route avoids stopping (or losing the reservation) out on the line. */
function insideReservedSection(train: Train, runtime: TrainRuntime): boolean {
  const a = train.route[train.routeIndex] as number;
  const b = train.route[train.routeIndex + 1];
  return (
    b !== undefined &&
    train.sectionTargetStationId !== undefined &&
    !runtime.stationTiles.has(a) &&
    holdsBlockFor(train, runtime, a, b)
  );
}

/** True when the train, standing on node `a` about to take edge `a -> b`, has not yet reserved the
 * section that edge belongs to. Out on the line that is just "do I hold this block". At a station
 * node it must not be the block test: a train reversing at a terminal it merely passes through would
 * find the block it just used (still held by its tail, in the *other* direction) and wrongly assume
 * the return trip is already reserved. There, the section is new unless the train has already left
 * (its `sectionTargetStationId` names some other station than this one). */
function needsNewSection(train: Train, runtime: TrainRuntime, a: number, b: number): boolean {
  if (runtime.stationTiles.has(a)) {
    const target =
      train.sectionTargetStationId !== undefined
        ? runtime.stationsById.get(train.sectionTargetStationId)
        : undefined;
    return target === undefined || target.tile === a;
  }
  return !holdsBlockFor(train, runtime, a, b);
}

function holdsBlockFor(train: Train, runtime: TrainRuntime, a: number, b: number): boolean {
  const blockId = blockIdForEdge(runtime.partition, a, b);
  return blockId !== undefined && train.heldBlocks.some((hb) => hb.blockId === blockId);
}

/** The nearest same-direction leader ahead of `train` in the blocks it holds, with the clear gap
 * (tiles) between the follower's nose and the leader's tail. Uses each train's monotonic
 * `distanceTraveled` marks, so it also sees a leader in a block further along the follower's
 * reserved section, not just the one it is in. */
export function nearestLeader(
  train: Train,
  trains: readonly Train[],
): { leader: Train; gap: number } | undefined {
  let best: { leader: Train; gap: number } | undefined;
  for (const mine of train.heldBlocks) {
    for (const t of trains) {
      if (t.id === train.id) continue;
      for (const hb of t.heldBlocks) {
        if (hb.blockId !== mine.blockId || hb.direction !== mine.direction) continue;
        // A train that has since turned round (it holds this block the other way, entered later)
        // is no longer heading the way this entry says.
        if (
          t.heldBlocks.some(
            (o) =>
              o.blockId === hb.blockId &&
              o.direction !== hb.direction &&
              o.enteredAtDistance > hb.enteredAtDistance,
          )
        )
          continue;
        // Only the block the leader's head is actually in counts (a clamped, passed block would
        // understate the gap).
        const into = t.distanceTraveled - hb.enteredAtDistance;
        if (into < 0 || into > hb.lengthTiles) continue;
        const headGap = mine.enteredAtDistance + into - train.distanceTraveled;
        if (headGap <= 0) continue;
        const gap = headGap - trainLengthTiles(t);
        if (!best || gap < best.gap) best = { leader: t, gap };
      }
    }
  }
  return best;
}

/** SPEC §7.5 (Phase 24A rewrite): a follower matches the leader's speed smoothly. Its target speed
 * is the leader's plus a term proportional to the spare gap (so it closes in exponentially and
 * settles at `FOLLOW_MIN_GAP_TILES`), capped by what it can still brake to a stop for. */
function followerSpeedCap(train: Train, trains: readonly Train[]): number {
  const found = nearestLeader(train, trains);
  if (!found) return Infinity;
  const spare = found.gap - FOLLOW_MIN_GAP_TILES;
  const vLeader = found.leader.speed;
  if (spare <= 0) return Math.max(0, vLeader + FOLLOW_GAIN_KMH_PER_TILE * spare);
  const brakeCap = Math.sqrt(
    vLeader * vLeader + 2 * TRAIN_BRAKE_KMH_PER_TICK * TICKS_PER_TILE_DIVISOR * spare,
  );
  return Math.min(vLeader + FOLLOW_GAIN_KMH_PER_TILE * spare, brakeCap);
}

/** Trains counting against `station`'s slot capacity (SPEC §7.5): physically parked there (loading
 * at their actual stop, or paused mid-route at a through-station whose onward section reservation
 * failed) plus trains that have already reserved a section ending there ("inbound"). A train that
 * has itself reserved a section departing *from* `station` no longer counts (its
 * `sectionTargetStationId` now points elsewhere). */
function stationOccupants(state: GameState, station: Station, excludeId: number): Train[] {
  const result: Train[] = [];
  for (const t of state.trains) {
    if (t.id === excludeId) continue;
    if (t.sectionTargetStationId === station.id) {
      result.push(t);
      continue;
    }
    if (
      t.sectionTargetStationId === undefined &&
      t.edgeProgress === 0 &&
      t.route[t.routeIndex] === station.tile
    ) {
      result.push(t);
    }
  }
  return result;
}

/** Ids of the other trains holding `entry.blockId` in the opposite direction. */
function trainsOpposingOnBlock(
  trains: readonly Train[],
  excludeId: number,
  entry: HeldBlock,
): number[] {
  const ids: number[] = [];
  for (const t of trains) {
    if (t.id === excludeId) continue;
    if (t.heldBlocks.some((hb) => hb.blockId === entry.blockId && hb.direction !== entry.direction))
      ids.push(t.id);
  }
  return ids;
}

/** Rebuilds `train.heldBlocks` from its route against the *current* block partition. Block ids are
 * indices into a partition that is recomputed whenever `trackVersion` changes (a new station or
 * junction splits blocks, a bulldozed edge removes them), so ids saved in `heldBlocks` silently
 * point at unrelated blocks afterwards — a stale reservation that blocks strangers or lets opposing
 * trains through. The reservation is fully determined by the route, though: the edges from the
 * train's tail (never further back than the last station it left) up to the end of its current
 * section (`sectionTargetStationId`). Called once per train when the track changes. */
/** The `HeldBlock.direction` a train gets for entering `block` at its end that the edge `a -> b`
 * (somewhere inside the block) is travelled away from: the direction of the block's first edge in
 * that sense. A train that entered the block whole (`tryEnterSection`) records exactly this; a
 * remapped train whose tail sits mid-block must agree with it, or same-way trains would look
 * opposed. */
function blockEntryDirection(block: Block, a: number, b: number, mapWidth: number): number {
  const nodes = [block.nodeA];
  for (const edge of block.edges) {
    const cur = nodes[nodes.length - 1] as number;
    nodes.push(edge.a === cur ? edge.b : edge.a);
  }
  const k = block.edges.findIndex((e) => (e.a === a && e.b === b) || (e.a === b && e.b === a));
  const last = nodes.length - 1;
  if (k === -1 || (nodes[k] === a && nodes[k + 1] === b)) {
    return directionBetween(nodes[0] as number, nodes[1] as number, mapWidth);
  }
  return directionBetween(nodes[last] as number, nodes[last - 1] as number, mapWidth);
}

export function remapReservations(state: GameState, train: Train, runtime: TrainRuntime): void {
  const mapWidth = state.map.width;
  const held: HeldBlock[] = [];
  const target =
    train.sectionTargetStationId !== undefined
      ? runtime.stationsById.get(train.sectionTargetStationId)
      : undefined;
  if (!target) {
    train.heldBlocks = held;
    return;
  }
  let endIndex = -1;
  for (let i = train.routeIndex; i < train.route.length; i++) {
    if (train.route[i] === target.tile) {
      endIndex = i;
      break;
    }
  }
  if (endIndex === -1) {
    train.heldBlocks = held;
    return;
  }
  const lengthOf = (i: number): number | undefined => {
    const edge = state.trackGraph.getEdge(train.route[i] as number, train.route[i + 1] as number);
    return edge ? edgeLengthTiles(edge) : undefined;
  };
  // Walk back from the head to the tail (or the last station), then forward to the section end.
  const headLen = train.routeIndex + 1 < train.route.length ? lengthOf(train.routeIndex) : 0;
  if (headLen === undefined) {
    train.heldBlocks = held;
    return;
  }
  let behind = train.edgeProgress * headLen;
  let startIndex = train.routeIndex;
  const length = trainLengthTiles(train);
  while (
    startIndex > 0 &&
    behind < length &&
    !runtime.stationTiles.has(train.route[startIndex] as number)
  ) {
    const len = lengthOf(startIndex - 1);
    if (len === undefined) break;
    behind += len;
    startIndex--;
  }
  // Distance from the start of edge `startIndex` to the head.
  let sinceStart = train.edgeProgress * headLen;
  for (let i = startIndex; i < train.routeIndex; i++) sinceStart += lengthOf(i) ?? 0;
  let cumulative = -sinceStart; // route distance of edge i's start, relative to the head
  let lastBlockId: number | undefined;
  for (let i = startIndex; i < endIndex; i++) {
    const a = train.route[i] as number;
    const b = train.route[i + 1] as number;
    const len = lengthOf(i);
    const blockId = blockIdForEdge(runtime.partition, a, b);
    if (len === undefined || blockId === undefined) {
      train.heldBlocks = [];
      return;
    }
    if (blockId !== lastBlockId || (i > startIndex && runtime.stationTiles.has(a))) {
      const block = runtime.partition.blocks[blockId] as Block;
      held.push({
        blockId,
        direction: blockEntryDirection(block, a, b, mapWidth),
        enteredAtDistance: train.distanceTraveled + cumulative,
        lengthTiles: block.lengthTiles,
      });
      lastBlockId = blockId;
    }
    cumulative += len;
  }
  train.heldBlocks = held;
  releaseTrailingBlocks(train);
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
    const opposing = trainsOpposingOnBlock(state.trains, train.id, entry);
    // Fairness: a steady stream of same-way trains must not starve a train that has waited a long
    // time for the other way — yield to it, so the stream drains and it can go.
    const yieldTo =
      opposing.length === 0
        ? state.trains
            .filter(
              (w) =>
                w.id !== train.id &&
                w.waitingOn?.kind === "line" &&
                w.waitingOn.blockId === entry.blockId &&
                w.waitingOn.direction !== entry.direction &&
                w.waitTicks >= SIGNAL_FAIRNESS_HOURS &&
                w.waitTicks > train.waitTicks,
            )
            .map((w) => w.id)
        : [];
    if (opposing.length > 0 || yieldTo.length > 0) {
      setWaitingStatus(train, "waitingForBlock");
      train.waitingOn = {
        kind: "line",
        stationId: targetStation.id,
        blockId: entry.blockId,
        direction: entry.direction,
        trainIds: opposing.length > 0 ? opposing : yieldTo,
      };
      return { ok: false, blockingBlockId: entry.blockId };
    }
  }

  // Rule 2: the target station needs a free slot (inside + inbound).
  const occupants = stationOccupants(state, targetStation, train.id);
  if (occupants.length >= STATION_TYPE_DEFS[targetStation.type].trainCapacity) {
    setWaitingStatus(train, "waitingForStation");
    train.waitingOn = {
      kind: "platform",
      stationId: targetStation.id,
      trainIds: occupants.map((t) => t.id),
    };
    const last = batch[batch.length - 1];
    return last ? { ok: false, blockingBlockId: last.blockId } : { ok: false };
  }

  delete train.waitingOn;
  train.heldBlocks.push(...batch);
  train.sectionTargetStationId = targetStation.id;
  setStatus(train, "moving");
  return { ok: true };
}

/** Computes a fresh route from the train's current node to `targetStation` and adopts it (or, if
 * none exists, parks the train in `noRoute`). Always releases held blocks — the block partition
 * itself may have just changed, so any previously-held block id is no longer meaningful. */
function currentTarget(train: Train, runtime: TrainRuntime): Station | undefined {
  const order = train.orders[train.currentOrderIndex];
  return order && runtime.stationsById.get(order.stationId);
}

function tryRoute(
  state: GameState,
  train: Train,
  runtime: TrainRuntime,
  loco: LocomotiveDef,
  targetStation: Station,
): boolean {
  const start = train.route[train.routeIndex] as number;
  const search = (tile: number): number[] | null =>
    findTrainRoute(state.map.width, state.trackGraph, start, tile, {
      weightClass: loco.weightClass,
      electric: loco.type === "electric",
      incomingDirection: train.direction,
      stationTiles: runtime.stationTiles,
      blockPenalties: train.blockPenalties,
      edgeToBlock: runtime.partition.edgeToBlock,
    });
  let result = search(targetStation.tile);
  if (!result) {
    // Unreachable next stop (PLAN Phase 18 B): report it once, then carry on with the next order
    // that *can* be reached so a dead order doesn't park the train (and a platform slot) forever.
    if (train.noRouteReportedStationId !== targetStation.id) {
      train.noRouteReportedStationId = targetStation.id;
      pushNews(state, { kind: "noRoute", trainId: train.id, stationId: targetStation.id });
    }
    for (let i = 1; i < train.orders.length && !result; i++) {
      const index = (train.currentOrderIndex + i) % train.orders.length;
      const alt = runtime.stationsById.get((train.orders[index] as TrainOrder).stationId);
      if (!alt || alt.tile === start || alt.id === targetStation.id) continue;
      const altRoute = search(alt.tile);
      if (altRoute) {
        result = altRoute;
        train.currentOrderIndex = index;
      }
    }
  } else if (train.noRouteReportedStationId === targetStation.id) {
    delete train.noRouteReportedStationId;
  }
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
  dropClaims(train);
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

/** A `stuck` train is only a train that has waited a long time (SPEC §7.5) — the line may well
 * clear later. Keep re-running the departure check every tick; leave `stuck` (and go) the moment it
 * passes, otherwise the "jam" would outlive its cause. */
function retryStuckDeparture(state: GameState, train: Train, runtime: TrainRuntime): void {
  if (train.route.length < 2 || train.edgeProgress !== 0) return;
  const waited = train.waitTicks;
  const previous = train.waitingOn;
  if (tryEnterSection(state, train, runtime).ok) return;
  train.status = "stuck";
  train.waitTicks = waited;
  if (!train.waitingOn && previous) train.waitingOn = previous;
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

  if (!targetStation) return;
  if (train.routeTrackVersion === runtime.trackVersion) {
    if (train.status === "stuck") retryStuckDeparture(state, train, runtime);
    return;
  }
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
  let targetStation = runtime.stationsById.get(order.stationId);
  if (!targetStation) {
    setStatus(train, "noRoute");
    return;
  }

  const statusAtStart = train.status;
  if (
    train.edgeProgress === 0 &&
    (train.route.length < 2 ||
      (train.routeTrackVersion !== runtime.trackVersion && !insideReservedSection(train, runtime)))
  ) {
    if (!tryRoute(state, train, runtime, loco, targetStation)) return;
    targetStation = currentTarget(train, runtime) ?? targetStation;
  }

  // A train standing still at a station holds no junction claims (stations are the passing places;
  // a train that reversed there would otherwise keep the claims of the way it came in on).
  if (
    train.edgeProgress === 0 &&
    train.speed === 0 &&
    runtime.stationTiles.has(train.route[train.routeIndex] as number)
  )
    dropClaims(train);

  const wasWaiting = statusAtStart !== "moving";
  let remainingTiles = 0;
  if (!wasWaiting) {
    const a = train.route[train.routeIndex] as number;
    const b = train.route[train.routeIndex + 1];
    let targetSpeed = b !== undefined ? computeTargetSpeed(state, loco, train, a, b) : 0;
    if (b !== undefined) targetSpeed = Math.min(targetSpeed, followerSpeedCap(train, state.trains));
    if (b !== undefined && !needsNewSection(train, runtime, a, b)) {
      const limit = crossingLimit(state, train, runtime);
      if (limit < Infinity)
        targetSpeed = Math.min(
          targetSpeed,
          Math.sqrt(2 * TRAIN_BRAKE_KMH_PER_TICK * TICKS_PER_TILE_DIVISOR * limit),
        );
    }
    if (train.speed < targetSpeed)
      train.speed = Math.min(targetSpeed, train.speed + TRAIN_ACCEL_KMH_PER_TICK);
    else train.speed = Math.max(targetSpeed, train.speed - TRAIN_BRAKE_KMH_PER_TICK);
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
    if (train.edgeProgress === 0 && needsNewSection(train, runtime, a, b)) {
      const attempt = tryEnterSection(state, train, runtime);
      if (!attempt.ok) {
        dropClaims(train);
        checkDeadlockTimeout(state, train, runtime, loco, attempt.blockingBlockId);
        return;
      }
    }

    if (remainingTiles <= 0) return;

    const limit = crossingLimit(state, train, runtime);
    if (limit < remainingTiles) {
      // Halted just short of a junction/crossing another train holds.
      remainingTiles = limit;
      train.speed = 0;
      if (remainingTiles <= 0) return;
    }

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
    // Turning round at a station (the route doubles back on itself): what was claimed on the way
    // in is no longer under the train.
    if (
      runtime.stationTiles.has(b) &&
      train.route[train.routeIndex + 1] !== undefined &&
      train.route[train.routeIndex + 1] === train.route[train.routeIndex - 1]
    )
      dropClaims(train);

    if (
      train.routeTrackVersion !== runtime.trackVersion &&
      !insideReservedSection(train, runtime)
    ) {
      if (!tryRoute(state, train, runtime, loco, targetStation)) return;
      targetStation = currentTarget(train, runtime) ?? targetStation;
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
      delete train.repairCrew;
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

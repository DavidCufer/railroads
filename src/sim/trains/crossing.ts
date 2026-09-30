/**
 * Crossing / junction interlock (PLAN Phase 25A, SPEC §7.5 addendum).
 *
 * The block model keeps opposing trains off the same *block*, but a junction or crossing node
 * (degree ≥ 3, not a station) is a block boundary, so two trains from different blocks could pass
 * through it at the same time. On top of the section reservation each train therefore keeps
 * **node claims**: as its head comes within `CROSSING_CLAIM_LOOKAHEAD_TILES` of a junction node it
 * claims it (together with every further junction node that lies within one train length of it —
 * a *cluster*, claimed all-or-nothing) and releases each node once its tail is
 * `CROSSING_CLEARANCE_TILES` past. If another train holds a node of the cluster, the train brakes
 * to a stop just short of the first node and retries every tick.
 *
 * Why this cannot deadlock (see docs/PROGRESS.md): a train waiting for a cluster holds no claim
 * (the previous cluster is more than one train length + lookahead behind it, so its tail has
 * cleared it), and never claims past a train that is ahead of it on its own line. Stopped trains
 * in a station release their claims (stations are the passing places, §7.5).
 */
import {
  CROSSING_CLAIM_LOOKAHEAD_TILES,
  CROSSING_CLEARANCE_TILES,
  CAR_LENGTH_TILES,
  LOCO_LENGTH_TILES,
} from "../../data/trains";
import type { GameState } from "../state";
import { computeConflictMap, edgeCrossingKey, type ConflictMap } from "../track/conflicts";
import { edgeLengthTiles } from "./geometry";
import type { NodeClaim, Train } from "./types";

/** Physical length of `train`'s consist in tiles. */
export function trainBodyLength(train: Train): number {
  return LOCO_LENGTH_TILES + train.cars.length * CAR_LENGTH_TILES;
}

/** A node where routes cross or merge: three or more legs, and not a station (stations have their
 * own slot logic). */
export function isConflictNode(
  state: GameState,
  stationTiles: ReadonlySet<number>,
  node: number,
): boolean {
  return !stationTiles.has(node) && state.trackGraph.neighborsOf(node).length >= 3;
}

const conflictCache = new WeakMap<GameState, { version: number; map: ConflictMap }>();

/** Geometric conflict points of the current track (PLAN Phase 27 B), recomputed when `trackVersion` changes. */
export function getConflictMap(state: GameState): ConflictMap {
  const hit = conflictCache.get(state);
  if (hit && hit.version === state.trackVersion) return hit.map;
  const map = computeConflictMap(
    state.trackGraph,
    new Set(state.stations.map((s) => s.tile)),
    state.map.width,
    state.map.height,
  );
  conflictCache.set(state, { version: state.trackVersion, map });
  return map;
}

/** Whether two claims on the same node can coexist: opposing movements over the same pair of
 * legs on double track use separate lanes. */
function compatible(state: GameState, node: number, a: NodeClaim, b: NodeClaim): boolean {
  if (a.inNode < 0 || a.outNode < 0 || b.inNode < 0 || b.outNode < 0) return false;
  if (a.inNode !== b.outNode || a.outNode !== b.inNode) return false;
  // A mid-tile crossing point lies on the edge itself: opposing trains on its two lanes are apart.
  if (node >= state.map.width * state.map.height) {
    const e = state.trackGraph.getEdge(a.inNode, a.outNode);
    return !!e && e.double;
  }
  const e1 = state.trackGraph.getEdge(node, a.inNode);
  const e2 = state.trackGraph.getEdge(node, a.outNode);
  return !!e1 && !!e2 && e1.double && e2.double;
}

/** True when `front` and `back` are both on a block in the same direction and `front`'s head is further
 * along it — `back` is queued behind `front` (directly or through other trains). */
export function isAheadOnSharedBlock(front: Train, back: Train): boolean {
  for (const f of front.heldBlocks)
    for (const b of back.heldBlocks) {
      if (f.blockId !== b.blockId || f.direction !== b.direction) continue;
      const intoFront = front.distanceTraveled - f.enteredAtDistance;
      const intoBack = back.distanceTraveled - b.enteredAtDistance;
      // Both heads must already be on the block: a train that has yet to enter it is not queued
      // behind anybody (two lines merging into the block are ordered by the claims instead).
      if (intoBack >= 0 && intoFront <= f.lengthTiles && intoFront > intoBack + 1e-9) return true;
    }
  return false;
}

/** Hours a train waits at a junction before it checks whether it is in a wait-for cycle. */
export const CROSSING_PATIENCE_TICKS = 720;

let crossingForcedReporter: ((message: string) => void) | undefined;
/** Diagnostics hook (tests count calls; `?debug=1` may log). Never used by game logic. */
export function setCrossingForcedReporter(fn: ((message: string) => void) | undefined): void {
  crossingForcedReporter = fn;
}

export interface CrossingResult {
  /** Tiles the head may still advance before it must stop (Infinity = free). */
  limit: number;
}

/** Releases claims whose node the tail has cleared, and drops future claims that are no longer on
 * the route (re-plans). Cheap; called every tick a train moves. */
export function releaseClaims(train: Train): void {
  const claims = train.nodeClaims;
  if (!claims || claims.length === 0) return;
  const tail = train.distanceTraveled - trainBodyLength(train);
  train.nodeClaims = claims.filter((c) => {
    if (c.atDistance + (c.clearance ?? CROSSING_CLEARANCE_TILES) < tail) return false;
    if (c.atDistance > train.distanceTraveled + 1e-6) {
      return train.route.indexOf(c.node, train.routeIndex + 1) >= 0;
    }
    return true;
  });
}

/** Called once per tick for a moving train that already holds its section reservation. Claims the
 * next junction cluster if free; otherwise returns the stopping limit and records `crossingWait`.
 * `leaderHeadDist` is the distance from this train's nose to the nose of the nearest same-way
 * leader ahead on its line (a train that is in the way must not be overtaken for a claim). */
export function updateCrossing(
  state: GameState,
  train: Train,
  stationTiles: ReadonlySet<number>,
  endIndex: number,
  leaderHeadDist: number,
  breaksDeadlock: (blockers: readonly number[]) => boolean,
): CrossingResult {
  releaseClaims(train);
  const claims = (train.nodeClaims ??= []);
  const route = train.route;
  const last = Math.min(endIndex, route.length - 1);
  const length = trainBodyLength(train);
  const graph = state.trackGraph;

  // Conflict items ahead, in route order: junction nodes and mid-tile crossing points, each with its
  // distance from the nose and its geometric clearance.
  const conflicts = getConflictMap(state);
  interface Item {
    i: number;
    node: number;
    dist: number;
    clearance: number;
    inNode: number;
    outNode: number;
  }
  const conflict: Item[] = [];
  const headEdge =
    train.routeIndex + 1 < route.length
      ? graph.getEdge(route[train.routeIndex] as number, route[train.routeIndex + 1] as number)
      : undefined;
  let nodeDist = headEdge ? -train.edgeProgress * edgeLengthTiles(headEdge) : 0;
  for (let i = train.routeIndex; i <= last; i++) {
    const node = route[i] as number;
    if (i > train.routeIndex && nodeDist > CROSSING_CLAIM_LOOKAHEAD_TILES + length * 4 + 8) break;
    // (`clearance` lists exactly the junction nodes: degree ≥ 3 and not a station.)
    if ((i > train.routeIndex || train.edgeProgress === 0) && conflicts.clearance.has(node))
      conflict.push({
        i,
        node,
        dist: Math.max(0, nodeDist),
        clearance: conflicts.clearance.get(node) ?? CROSSING_CLEARANCE_TILES,
        inNode: i > 0 ? (route[i - 1] as number) : -1,
        outNode: i + 1 < route.length ? (route[i + 1] as number) : -1,
      });
    if (i >= last) break;
    const e = graph.getEdge(node, route[i + 1] as number);
    if (!e) break;
    const len = edgeLengthTiles(e);
    const points =
      conflicts.crossingsOnEdge.size === 0
        ? undefined
        : conflicts.crossingsOnEdge.get(edgeCrossingKey(conflicts.mapSize, e.a, e.b));
    for (const pt of points ?? []) {
      const d = nodeDist + (node === e.a ? pt.frac : 1 - pt.frac) * len;
      if (d < -1e-9) continue; // the nose is already past it
      conflict.push({
        i,
        node: pt.id,
        dist: Math.max(0, d),
        clearance: conflicts.clearance.get(pt.id) ?? CROSSING_CLEARANCE_TILES,
        inNode: node,
        outNode: route[i + 1] as number,
      });
    }
    nodeDist += len;
  }

  const previousWait = train.crossingWait;
  delete train.crossingWait;
  let cursor = 0;
  while (cursor < conflict.length) {
    const start = cursor;
    const first = conflict[cursor] as (typeof conflict)[number];
    if (first.dist > CROSSING_CLAIM_LOOKAHEAD_TILES) break;
    // Cluster: successive junction nodes closer than a train length (+lookahead + clearance).
    const cluster = [first];
    let k = cursor + 1;
    while (k < conflict.length) {
      const prev = cluster[cluster.length - 1] as (typeof conflict)[number];
      const next = conflict[k] as (typeof conflict)[number];
      if (
        next.dist - prev.dist >
        length + CROSSING_CLAIM_LOOKAHEAD_TILES + prev.clearance + next.clearance
      )
        break;
      cluster.push(next);
      k++;
    }
    cursor = k;
    if (
      cluster.every((c) =>
        claims.some(
          (m) =>
            m.node === c.node &&
            m.atDistance >= train.distanceTraveled + c.dist - 1e-6 &&
            m.atDistance <= train.distanceTraveled + c.dist + 1e-6,
        ),
      )
    )
      continue;

    const mine: NodeClaim[] = cluster.map((c) => ({
      node: c.node,
      atDistance: train.distanceTraveled + c.dist,
      inNode: c.inNode,
      outNode: c.outNode,
      clearance: c.clearance,
    }));
    const blockers = new Set<number>();
    for (const other of state.trains) {
      if (other.id === train.id || !other.nodeClaims) continue;
      // A train stuck behind this one (this one is its leader) can never get to its nodes before
      // us, so its claims must not stall us — otherwise the two would wait for each other (e.g.
      // two trains leaving a station in the same tick, or one running back over its own tail
      // after reversing at a dead end).
      if (isAheadOnSharedBlock(train, other)) continue;
      for (const oc of other.nodeClaims) {
        for (const mc of mine)
          if (oc.node === mc.node && !compatible(state, mc.node, mc, oc)) blockers.add(other.id);
      }
    }
    const stopAt = first.dist - first.clearance;
    const leaderInTheWay = leaderHeadDist < first.dist;
    if (blockers.size === 0 && !leaderInTheWay) {
      claims.push(...mine);
      continue;
    }
    if (stopAt < -1e-6) {
      // Already on top of the node (a junction built under the train, or no room left to brake):
      // there is no stopping any more, so take this one node (others yield to us) and treat the
      // rest of the cluster, which we can still stop short of, as a cluster of its own.
      claims.push(mine[0] as NodeClaim);
      cursor = start + 1;
      continue;
    }
    if (blockers.size > 0) {
      const since = previousWait?.node === first.node ? previousWait.since : state.ticks;
      train.crossingWait = { node: first.node, trainIds: [...blockers], since };
      // Safety net (should never fire; the stress test asserts it does not): if the wait has
      // dragged on and it is part of a wait-for cycle, the cycle member with the lowest id goes.
      if (
        state.ticks - since >= CROSSING_PATIENCE_TICKS &&
        blockers.size > 0 &&
        breaksDeadlock([...blockers])
      ) {
        crossingForcedReporter?.(`${train.name} forced through junction ${first.node}`);
        claims.push(...mine);
        delete train.crossingWait;
        continue;
      }
    }
    return { limit: Math.max(0, stopAt) };
  }
  return { limit: Infinity };
}

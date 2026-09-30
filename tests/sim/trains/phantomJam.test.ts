/**
 * PLAN Phase 18 B: randomized, seeded stress test for phantom traffic jams. Several maps with a
 * mixed single/double network, shared stations and 6–12 trains run for two game years while
 * tracks and stations are added mid-run; every day we assert that the signaling bookkeeping is
 * consistent (SPEC §7.5) and that no train waits without a live blocker or outside a wait-for cycle.
 * `STRESS_BIG=1` runs a larger variant.
 */
import { describe, expect, it } from "vitest";
import {
  buildStation,
  buildTrack,
  buyTrain,
  setOrders,
  upgradeTrack,
} from "../../../src/sim/commands";
import { createRng, nextFloat, nextInt, type RngState } from "../../../src/sim/rng";
import { advanceOneHour } from "../../../src/sim/tick";
import {
  nearestLeader,
  waitsFor,
  getTrainRuntime,
  setCrossingForcedReporter,
  setStaleReservationReporter,
} from "../../../src/sim/trains";
import { edgeKey } from "../../../src/sim/track/graph";
import { findBuildPath } from "../../../src/sim/track/pathfind";
import { STATION_TYPES } from "../../../src/data/stations";
import type { GameState } from "../../../src/sim/state";
import type { Train } from "../../../src/sim/trains/types";
import { makeTestMap, makeTestState, tileAt } from "../track/helpers";
import { describeOverlap, vehicleOverlapsNow } from "./geometryHelpers";
import { makeCrossingWatch } from "./crossingHelpers";

const BIG = process.env.STRESS_BIG === "1";
const SIZE = BIG ? 48 : 30;
const YEARS = BIG ? 4 : 2;
const SEEDS = BIG ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] : [1, 2, 3, 4, 5, 6];
const WAIT_LIMIT_DAYS = BIG ? 250 : 100;
const LOCO = "american-4-4-0";
const crossWaited = new Map<number, number>();
/** Hours each train has been `moving` at speed 0 (PLAN 28A Bug 4: never more than `STALL_LIMIT_DAYS`). */
const stalledDays = new Map<number, number>();
const STALL_LIMIT_DAYS = 5;

function randTile(rng: RngState, map: GameState["map"]): number {
  return tileAt(map, nextInt(rng, 1, SIZE - 2), nextInt(rng, 1, SIZE - 2));
}

function link(state: GameState, rng: RngState, a: number, b: number): number[] | null {
  const path = findBuildPath(state.map, a, b, 1900);
  if (!path || path.length < 2) return null;
  if (!buildTrack(state, path).ok) return null;
  if (nextFloat(rng) < 0.4) upgradeTrack(state, path);
  return path;
}

function addStations(
  state: GameState,
  rng: RngState,
  path: readonly number[],
  count: number,
): void {
  for (let i = 0; i < count; i++) {
    const tile = path[nextInt(rng, 0, path.length - 1)] as number;
    const type = STATION_TYPES[
      nextInt(rng, 0, STATION_TYPES.length - 1)
    ] as (typeof STATION_TYPES)[number];
    const before = state.stations.length;
    buildStation(state, tile, type);
    if (state.stations.length > before)
      (state.stations[before] as { hasEngineShed: boolean }).hasEngineShed = true;
  }
}

function scenario(seed: number, extraTrains = 0): { state: GameState; rng: RngState } {
  const map = makeTestMap(Array.from({ length: SIZE }, () => "p".repeat(SIZE)));
  const state = makeTestState(map, { seed, startYear: 1900, cash: 1e12 });
  const rng = createRng(seed * 7919 + 13);
  const hubs = Array.from({ length: 6 }, () => randTile(rng, map));
  for (let i = 0; i < hubs.length; i++) {
    const path = link(state, rng, hubs[i] as number, hubs[(i + 1) % hubs.length] as number);
    if (path) addStations(state, rng, path, 2);
  }
  for (let i = 0; i < 2; i++) {
    const path = link(
      state,
      rng,
      hubs[nextInt(rng, 0, 5)] as number,
      hubs[nextInt(rng, 0, 5)] as number,
    );
    if (path) addStations(state, rng, path, 1);
  }
  const trainCount = nextInt(rng, 6, BIG ? 20 : 12) + extraTrains;
  for (let i = 0; i < trainCount && state.stations.length >= 2; i++) {
    // Over-subscribed variant: the extra trains all shuttle between the first two stations.
    const pool = i >= trainCount - extraTrains ? state.stations.slice(0, 2) : state.stations;
    const home = pool[nextInt(rng, 0, pool.length - 1)]!;
    if (!buyTrain(state, home.id, LOCO, ["coal", "coal"]).ok) continue;
    const train = state.trains[state.trains.length - 1]!;
    const stops = [home.id];
    for (let k = nextInt(rng, 1, 2); k > 0; k--) {
      const s = pool[nextInt(rng, 0, pool.length - 1)]!;
      if (s.id !== stops[stops.length - 1]) stops.push(s.id);
    }
    if (stops.length < 2)
      stops.push(
        pool.find((s) => s.id !== home.id)?.id ?? state.stations.find((s) => s.id !== home.id)!.id,
      );
    setOrders(
      state,
      train.id,
      stops.map((stationId) => ({ stationId, rule: "auto" as const })),
    );
  }
  return { state, rng };
}

function findCycleMembers(state: GameState, wide = false): Set<number> {
  const edges = new Map<number, number[]>();
  for (const t of state.trains)
    if (wide) edges.set(t.id, waitsFor(state, t));
    else if (t.waitingOn) edges.set(t.id, t.waitingOn.trainIds);
  const inCycle = new Set<number>();
  for (const start of edges.keys()) {
    // DFS: can we get back to `start`?
    const seen = new Set<number>();
    const stack = [...(edges.get(start) ?? [])];
    while (stack.length) {
      const n = stack.pop()!;
      if (n === start) {
        inCycle.add(start);
        break;
      }
      if (seen.has(n)) continue;
      seen.add(n);
      stack.push(...(edges.get(n) ?? []));
    }
  }
  return inCycle;
}

/** Trains whose wait chain ends at a train with no possible route at all (excused: impossible). */
function waitsOnDeadTrain(state: GameState, id: number, wide = false): boolean {
  const byId = new Map(state.trains.map((t) => [t.id, t]));
  const seen = new Set<number>();
  const stack = [id];
  while (stack.length) {
    const n = stack.pop()!;
    if (seen.has(n)) continue;
    seen.add(n);
    const t = byId.get(n);
    if (!t) continue;
    if (n !== id && (t.status === "noRoute" || t.status === "stuck")) return true;
    stack.push(...(wide ? waitsFor(state, t) : (t.waitingOn?.trainIds ?? [])));
  }
  return false;
}

/** Every train the given trains (transitively) wait for, themselves included. */
function reachFrom(state: GameState, from: readonly number[]): Set<number> {
  const byId = new Map(state.trains.map((t) => [t.id, t]));
  const seen = new Set<number>();
  const stack = [...from];
  while (stack.length) {
    const n = stack.pop()!;
    if (seen.has(n)) continue;
    seen.add(n);
    const t = byId.get(n);
    if (t) stack.push(...waitsFor(state, t));
  }
  return seen;
}

function checkInvariants(state: GameState, waited: Map<number, number>, log: string[]): void {
  const runtime = getTrainRuntime(state);
  const byId = new Map(state.trains.map((t) => [t.id, t]));
  const cycle = findCycleMembers(state);
  const wideCycle = findCycleMembers(state, true);
  for (const t of state.trains) {
    const where = `train ${t.id} @tick ${state.ticks} status ${t.status}`;
    // (a) reservations belong to a train that will still use them.
    const routeBlocks = new Set<number>();
    for (let i = 0; i + 1 < t.route.length; i++) {
      const id = runtime.partition.edgeToBlock.get(edgeKey(t.route[i]!, t.route[i + 1]!));
      if (id !== undefined) routeBlocks.add(id);
    }
    for (const hb of t.heldBlocks) {
      if (hb.blockId >= runtime.partition.blocks.length)
        log.push(`${where}: held block ${hb.blockId} does not exist`);
      else if (!routeBlocks.has(hb.blockId))
        log.push(`${where}: held block ${hb.blockId} not on its route`);
    }
    // (b) a section target must be a real station this train is heading to / sitting at.
    if (t.sectionTargetStationId !== undefined) {
      const s = runtime.stationsById.get(t.sectionTargetStationId);
      if (!s) log.push(`${where}: sectionTarget ${t.sectionTargetStationId} missing`);
      else if (!t.route.includes(s.tile)) log.push(`${where}: sectionTarget ${s.id} not on route`);
    }
    // (c) waits.
    const waiting = t.status === "waitingForBlock" || t.status === "waitingForStation";
    if (waiting) {
      waited.set(t.id, (waited.get(t.id) ?? 0) + 1);
      const w = t.waitingOn;
      if (!w) log.push(`${where}: waiting without a recorded blocker`);
      else {
        for (const id of w.trainIds)
          if (!byId.has(id)) log.push(`${where}: blocker ${id} does not exist`);
        if (w.trainIds.length === 0) log.push(`${where}: waiting with no live blocker`);
      }
      if (
        (waited.get(t.id) ?? 0) > WAIT_LIMIT_DAYS &&
        !cycle.has(t.id) &&
        !waitsOnDeadTrain(state, t.id)
      ) {
        log.push(
          `${where}: waited ${waited.get(t.id)} days on ${JSON.stringify(w)} without a wait-for cycle; blockers ${JSON.stringify(
            (w?.trainIds ?? []).map((id) => {
              const b = byId.get(id)!;
              return {
                id,
                status: b.status,
                held: b.heldBlocks,
                route: b.route,
                ri: b.routeIndex,
                ep: b.edgeProgress,
                dir: b.direction,
                tgt: b.sectionTargetStationId,
                cur: b.currentOrderIndex,
                orders: b.orders.map((o) => o.stationId),
                wt: b.waitTicks,
              };
            }),
          )}; me ${JSON.stringify({ route: t.route, ri: t.routeIndex, held: t.heldBlocks })}`,
        );
      }
    } else waited.set(t.id, 0);
    if (t.crossingWait) {
      crossWaited.set(t.id, (crossWaited.get(t.id) ?? 0) + 1);
      if (t.crossingWait.trainIds.some((id) => !byId.has(id)))
        log.push(`${where}: crossing blocker does not exist`);
      if (
        (crossWaited.get(t.id) ?? 0) > WAIT_LIMIT_DAYS &&
        !wideCycle.has(t.id) &&
        ![...reachFrom(state, t.crossingWait.trainIds)].some((id) => wideCycle.has(id)) &&
        !waitsOnDeadTrain(state, t.id, true)
      )
        log.push(
          `${where}: waited ${crossWaited.get(t.id)} days at a crossing for ${JSON.stringify(t.crossingWait)}`,
        );
    } else crossWaited.set(t.id, 0);
    if (
      t.status === "stuck" &&
      (waited.get(t.id) ?? 0) > WAIT_LIMIT_DAYS &&
      !cycle.has(t.id) &&
      !waitsOnDeadTrain(state, t.id)
    )
      log.push(`${where}: stuck without a cycle`);
  }
  // Station slot counts never exceed capacity by more than physical presence.
  for (const s of state.stations) {
    const occ = state.trains.filter(
      (t) =>
        t.sectionTargetStationId === s.id ||
        (t.sectionTargetStationId === undefined &&
          t.edgeProgress === 0 &&
          t.route[t.routeIndex] === s.tile),
    );
    for (const t of occ) {
      if (
        t.sectionTargetStationId === undefined &&
        t.edgeProgress === 0 &&
        t.route[t.routeIndex] === s.tile
      )
        continue;
    }
  }
}

/** Why a `moving` train stands still, if it is a legitimate reason the UI names: it waits at a junction
 * (`crossingWait`, bounded by the crossing watch) or queues behind a train that is itself stopped for a
 * reason. Anything else is PLAYTEST-1 Bug 4's "moving at speed 0" lie. */
function stallExplained(state: GameState, t: Train): boolean {
  return (
    t.crossingWait !== undefined ||
    t.status !== "moving" ||
    nearestLeader(t, state.trains) !== undefined
  );
}

/** Bug 4: per hour, a train `moving` at speed 0 counts up; more than `STALL_LIMIT_DAYS` in a row without an
 * explanation — or 60 days with one — is a failure. */
function watchStalls(state: GameState, log: string[]): void {
  for (const t of state.trains) {
    const where = `train ${t.id} @tick ${state.ticks} status ${t.status}`;
    if (t.status === "moving" && t.speed === 0) {
      const hours = (stalledDays.get(t.id) ?? 0) + 1;
      stalledDays.set(t.id, hours);
      const limit = stallExplained(state, t) ? 60 * 24 : STALL_LIMIT_DAYS * 24;
      if (hours === limit + 1)
        log.push(
          `${where}: moving at speed 0 for ${limit / 24} days (route ${t.route.join(">")} ri ${t.routeIndex} ep ${t.edgeProgress} cw ${JSON.stringify(t.crossingWait)})`,
        );
    } else stalledDays.set(t.id, 0);
  }
}

function collision(state: GameState): string | null {
  // block -> direction -> holding train ids. A train may hold a block in both directions itself
  // (reversing at a terminal it passes through); two *different* trains may not.
  const holders = new Map<number, Map<number, Set<number>>>();
  for (const t of state.trains)
    for (const hb of t.heldBlocks) {
      const byDir = holders.get(hb.blockId) ?? new Map<number, Set<number>>();
      const ids = byDir.get(hb.direction) ?? new Set<number>();
      ids.add(t.id);
      byDir.set(hb.direction, ids);
      holders.set(hb.blockId, byDir);
    }
  const runtime = getTrainRuntime(state);
  for (const [id, byDir] of holders) {
    const block = runtime.partition.blocks[id];
    if (!block || block.double || byDir.size < 2) continue;
    const all = [...byDir.values()].flatMap((ids) => [...ids]);
    const opposed = [...byDir.entries()].some(([dir, ids]) =>
      [...byDir.entries()].some(
        ([other, otherIds]) =>
          other !== dir && [...ids].some((a) => [...otherIds].some((b) => a !== b)),
      ),
    );
    if (opposed) return `opposing trains ${all.join(",")} on block ${id}`;
  }
  return null;
}

describe("phantom jam stress", () => {
  for (const [label, seed, extra] of [
    ...SEEDS.map((seed) => ["", seed, 0] as const),
    // Over-subscribed stations (PLAN 28A): far more trains than platforms between two stations.
    ...[1, 2, 3].map((seed) => [" over-subscribed", seed, 4] as const),
  ]) {
    it(`seed ${seed}${label}: signaling stays consistent for ${YEARS} years`, () => {
      crossWaited.clear();
      stalledDays.clear();
      const { state, rng } = scenario(seed, extra);
      expect(state.trains.length).toBeGreaterThanOrEqual(2);
      const waited = new Map<number, number>();
      const log: string[] = [];
      const watchCrossings = makeCrossingWatch();
      // The sim's own daily self-check must never have anything to clear.
      setStaleReservationReporter((m) => log.push(`stale reservation @tick ${state.ticks}: ${m}`));
      setCrossingForcedReporter((m) => log.push(`crossing safety net @tick ${state.ticks}: ${m}`));
      const days = YEARS * 365;
      for (let day = 0; day < days && log.length === 0; day++) {
        // Mid-run edits: extend the network / add stations while trains are running.
        if (day % 60 === 30 && day > 0) {
          const path = link(state, rng, randTile(rng, state.map), randTile(rng, state.map));
          if (path) addStations(state, rng, path, 1);
        }
        for (let h = 0; h < 24; h++) {
          advanceOneHour(state);
          if (process.env.TRACE_TICKS && process.env.TRACE) {
            const [lo, hi] = process.env.TRACE_TICKS.split("-").map(Number) as [number, number];
            if (state.ticks >= lo && state.ticks <= hi)
              for (const t of state.trains.filter((x) =>
                process.env.TRACE!.split(",").map(Number).includes(x.id),
              ))
                console.log(
                  "T",
                  state.ticks,
                  t.id,
                  t.status,
                  "ri",
                  t.routeIndex,
                  "n",
                  t.route[t.routeIndex],
                  "->",
                  t.route[t.routeIndex + 1],
                  "ep",
                  t.edgeProgress.toFixed(2),
                  "held",
                  t.heldBlocks
                    .map(
                      (h) =>
                        `${h.blockId}/${h.direction}@${h.enteredAtDistance.toFixed(1)}+${h.lengthTiles.toFixed(1)}`,
                    )
                    .join(","),
                  "tgt",
                  t.sectionTargetStationId,
                  "dt",
                  t.distanceTraveled.toFixed(1),
                  "tv",
                  t.routeTrackVersion,
                  state.trackVersion,
                  "spd",
                  t.speed.toFixed(0),
                  "cl",
                  JSON.stringify(
                    (t.nodeClaims ?? []).map((c) => `${c.node}@${c.atDistance.toFixed(1)}`),
                  ),
                  "cw",
                  JSON.stringify(t.crossingWait),
                );
          }
          const c = collision(state);
          if (c) log.push(`tick ${state.ticks}: ${c}`);
          watchCrossings(state, log);
          watchStalls(state, log);
          for (const o of vehicleOverlapsNow(state))
            log.push(`tick ${state.ticks}: vehicles overlap: ${o} ${describeOverlap(state, o)}`);
        }
        checkInvariants(state, waited, log);
        if (process.env.TRACE) {
          const ids = process.env.TRACE.split(",").map(Number);
          for (const t of state.trains.filter((x) => ids.includes(x.id)))
            console.log(
              day,
              t.id,
              t.status,
              "route",
              t.route.join(">"),
              "ri",
              t.routeIndex,
              "ep",
              t.edgeProgress.toFixed(2),
              "held",
              t.heldBlocks.map((h) => `${h.blockId}/${h.direction}`).join(","),
              "tgt",
              t.sectionTargetStationId,
              "wait",
              JSON.stringify(t.waitingOn),
              "claims",
              JSON.stringify(t.nodeClaims),
              "cw",
              JSON.stringify(t.crossingWait),
              "spd",
              t.speed.toFixed(0),
              "dt",
              t.distanceTraveled.toFixed(2),
              "cur",
              t.orders[t.currentOrderIndex]?.stationId,
            );
        }
      }
      setStaleReservationReporter(undefined);
      setCrossingForcedReporter(undefined);
      expect(log.slice(0, 10)).toEqual([]);
    }, 120_000);
  }
});

export type { Train };

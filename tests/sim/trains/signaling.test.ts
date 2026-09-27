/**
 * PLAN Phase 15's required signaling tests (SPEC §7.5, rewritten after play-testing): "trains wait
 * only at stations, never out on the line." The regression scenarios that encoded the *old*
 * per-block rule (single-track shuttle, congested line, double-track opposing traffic,
 * determinism) live in movement.test.ts, updated in place — see PROGRESS.md for what changed and
 * why. This file covers the new scenarios PLAN calls out by name.
 */
import { describe, expect, it } from "vitest";
import { buildStation, buildTrack, buyTrain, setOrders } from "../../../src/sim/commands";
import { createGameState } from "../../../src/sim/state";
import { stepTrains } from "../../../src/sim/trains";
import { deserializeGameState, serializeGameState } from "../../../src/save/serialize";
import { tileAt } from "../track/helpers";
import type { GameState } from "../../../src/sim/state";
import type { Train } from "../../../src/sim/trains/types";
import type { StationType } from "../../../src/data/stations";

const LOCO = "american-4-4-0"; // medium weight, available from 1848

function flatLine(seed: number, width: number): GameState {
  const state = createGameState({ seed, size: "small", waterLevel: "normal", roughness: "normal" });
  for (let x = 0; x < width; x++) {
    state.map.terrain[x] = 0; // plain
    state.map.elevation[x] = 0;
  }
  state.startYear = 1848;
  const path = Array.from({ length: width }, (_, x) => tileAt(state.map, x, 0));
  expect(buildTrack(state, path).ok).toBe(true);
  return state;
}

function station(state: GameState, x: number, type: StationType): number {
  const result = buildStation(state, tileAt(state.map, x, 0), type);
  expect(result.ok).toBe(true);
  return (state.stations[state.stations.length - 1] as { id: number }).id;
}

function trainById(state: GameState, id: number): Train {
  const train = state.trains.find((t) => t.id === id);
  if (!train) throw new Error("unreachable: train not found");
  return train;
}

/** A single-track block may be held by any number of trains travelling the *same* way at once
 * (SPEC §7.5) — the invariant that must never break is that it's never held by two trains
 * travelling *opposite* ways at once. Every block has exactly two possible entry directions (one
 * per end), so more than one distinct direction present on a block at once is a collision. */
function opposingDirectionCollision(state: GameState): boolean {
  const directionsByBlock = new Map<number, Set<number>>();
  for (const train of state.trains) {
    for (const hb of train.heldBlocks) {
      const dirs = directionsByBlock.get(hb.blockId) ?? new Set<number>();
      dirs.add(hb.direction);
      directionsByBlock.set(hb.blockId, dirs);
    }
  }
  for (const dirs of directionsByBlock.values()) {
    if (dirs.size > 1) return true;
  }
  return false;
}

/** Only the station that's ever `buildStation`-ed first gets a free Engine Shed (SPEC §6.1), and
 * `buyTrain` requires one — so a second train can't just be spawned at the far station to get an
 * "opposite directions from the start" scenario. Instead this buys it at the shed station like the
 * first, drives it out to `farStationId` and back once (running real ticks, not teleporting), and
 * stops right as it departs `farStationId` heading back — at which point it's genuinely travelling
 * the opposite way from a *second* fresh train about to depart the shed station outbound. This is
 * exactly the reported bug shape: an existing train already returning meets a new one just leaving. */
function buyTrainReturning(
  state: GameState,
  shedStationId: number,
  farStationId: number,
  farTile: number,
  maxTicks: number,
): number {
  const bought = buyTrain(state, shedStationId, LOCO, []);
  expect(bought.ok).toBe(true);
  const id = (state.trains[state.trains.length - 1] as { id: number }).id;
  expect(
    setOrders(state, id, [
      { stationId: shedStationId, rule: "passThrough" },
      { stationId: farStationId, rule: "passThrough" },
    ]).ok,
  ).toBe(true);

  let reachedFar = false;
  for (let i = 0; i < maxTicks; i++) {
    stepTrains(state);
    const train = trainById(state, id);
    if (!reachedFar && train.status === "loading" && train.route[0] === farTile) reachedFar = true;
    if (reachedFar && train.status === "moving" && train.heldBlocks.length > 0) return id;
  }
  throw new Error("unreachable: train never returned within maxTicks");
}

describe("the exact reported scenario: two trains, opposite directions, single track between two depots", () => {
  it("never gets stuck and both trains keep completing round trips over 2 in-game years", () => {
    const state = flatLine(101, 10);
    const depotA = station(state, 0, "depot");
    const depotB = station(state, 9, "depot");
    const bTile = tileAt(state.map, 9, 0);

    // train1: already mid-journey, heading back from B to A.
    const id1 = buyTrainReturning(state, depotA, depotB, bTile, 2_000);
    // train2: a brand new train just leaving A for B — opposite direction on the same single track.
    const bought2 = buyTrain(state, depotA, LOCO, []);
    expect(bought2.ok).toBe(true);
    const id2 = (state.trains[state.trains.length - 1] as { id: number }).id;
    expect(
      setOrders(state, id2, [
        { stationId: depotA, rule: "passThrough" },
        { stationId: depotB, rule: "passThrough" },
      ]).ok,
    ).toBe(true);

    // "keeps earning" is stood in for here by "keeps completing loading stops" (revenue requires a
    // full cargo/economy setup this synthetic single-row map doesn't have) — every transition into
    // "loading" is a real arrival at a station on its route, which is what generates revenue in the
    // full game.
    const loadingStops = new Map<number, number>([
      [id1, 0],
      [id2, 0],
    ]);
    const wasLoading = new Map<number, boolean>([
      [id1, false],
      [id2, false],
    ]);

    const TICKS = 2 * 365 * 24; // 2 in-game years
    for (let tick = 0; tick < TICKS; tick++) {
      stepTrains(state);
      expect(opposingDirectionCollision(state)).toBe(false);
      for (const id of [id1, id2]) {
        const train = trainById(state, id);
        expect(train.status).not.toBe("stuck");
        const isLoading = train.status === "loading";
        if (isLoading && !wasLoading.get(id)) {
          loadingStops.set(id, (loadingStops.get(id) as number) + 1);
        }
        wasLoading.set(id, isLoading);
      }
    }

    expect(loadingStops.get(id1)).toBeGreaterThan(10);
    expect(loadingStops.get(id2)).toBeGreaterThan(10);
  });
});

describe("same-direction convoy", () => {
  it("3 trains heading the same way on one single-track section follow each other without ever being denied for line clear", () => {
    const state = flatLine(102, 20);
    const depotA = station(state, 0, "depot");
    const terminalB = station(state, 19, "terminal"); // capacity 5 — platform contention isn't what's under test here

    const trainIds: number[] = [];
    for (let i = 0; i < 3; i++) {
      const bought = buyTrain(state, depotA, LOCO, []);
      expect(bought.ok).toBe(true);
      const id = (state.trains[state.trains.length - 1] as { id: number }).id;
      trainIds.push(id);
      expect(
        setOrders(state, id, [
          { stationId: depotA, rule: "passThrough" },
          { stationId: terminalB, rule: "passThrough" },
        ]).ok,
      ).toBe(true);
    }

    // Measured only up to the point where the *first* train would reach the far end and turn back
    // (a real, separate opposing-traffic scenario the "middle station" test below covers) — this
    // window isolates the "all still heading the same way" claim under test here.
    let anyWaitingForBlock = false;
    let anyReachedTerminal = false;
    for (let tick = 0; tick < 300 && !anyReachedTerminal; tick++) {
      stepTrains(state);
      expect(opposingDirectionCollision(state)).toBe(false);
      if (state.trains.some((t) => t.status === "waitingForBlock")) anyWaitingForBlock = true;
      if (state.trains.some((t) => t.status === "loading")) anyReachedTerminal = true;
    }

    expect(anyReachedTerminal).toBe(true);
    // No opposing traffic exists in this scenario at all, so SPEC §7.5's "same direction is fine"
    // rule means none of them should ever have been denied departure for a line-clear reason.
    expect(anyWaitingForBlock).toBe(false);
    for (const id of trainIds) {
      const train = trainById(state, id);
      expect(train.status).not.toBe("stuck");
      expect(train.status).not.toBe("noRoute");
    }
  });
});

describe("a middle station lets opposing trains pass", () => {
  it("two trains heading opposite ways on a line with a station in between both keep running", () => {
    const state = flatLine(103, 16);
    const depotA = station(state, 0, "depot");
    station(state, 8, "depot"); // the passing point between them
    const depotB = station(state, 15, "depot");
    const bTile = tileAt(state.map, 15, 0);

    // west: already returning from B to A. east: a fresh train just leaving A for B.
    const westId = buyTrainReturning(state, depotA, depotB, bTile, 2_000);
    const eastBought = buyTrain(state, depotA, LOCO, []);
    expect(eastBought.ok).toBe(true);
    const eastId = (state.trains[state.trains.length - 1] as { id: number }).id;
    expect(
      setOrders(state, eastId, [
        { stationId: depotA, rule: "passThrough" },
        { stationId: depotB, rule: "passThrough" },
      ]).ok,
    ).toBe(true);

    for (let tick = 0; tick < 60 * 24; tick++) {
      stepTrains(state);
      expect(opposingDirectionCollision(state)).toBe(false);
    }

    for (const id of [westId, eastId]) {
      const train = trainById(state, id);
      expect(train.status).not.toBe("stuck");
      expect(train.status).not.toBe("noRoute");
    }
  });
});

describe("a train never stops outside a station on its own", () => {
  it("a lone train (nothing to brake behind, no breakdown) never sits at speed 0 mid-block", () => {
    const state = flatLine(104, 12);
    const depotA = station(state, 0, "depot");
    const depotB = station(state, 11, "depot");

    const bought = buyTrain(state, depotA, LOCO, []);
    expect(bought.ok).toBe(true);
    expect(
      setOrders(state, state.trains[0]?.id as number, [
        { stationId: depotA, rule: "passThrough" },
        { stationId: depotB, rule: "passThrough" },
      ]).ok,
    ).toBe(true);

    for (let tick = 0; tick < 20 * 24; tick++) {
      stepTrains(state);
      const train = state.trains[0];
      if (!train) continue;
      if (train.status === "moving" && train.edgeProgress > 0) {
        expect(train.speed).toBeGreaterThan(0);
      }
    }
  });
});

describe("save/load mid-reservation", () => {
  it("continuing after a save/load round trip mid-section produces identical results to never saving", () => {
    function run(saveMidway: boolean): GameState {
      let state = flatLine(105, 14);
      const depotA = station(state, 0, "depot");
      const depotB = station(state, 13, "depot");
      const t1 = buyTrain(state, depotA, LOCO, ["coal"]);
      const t2 = buyTrain(state, depotA, LOCO, ["grain"]);
      expect(t1.ok).toBe(true);
      expect(t2.ok).toBe(true);
      expect(
        setOrders(state, state.trains[0]?.id as number, [
          { stationId: depotA, rule: "passThrough" },
          { stationId: depotB, rule: "passThrough" },
        ]).ok,
      ).toBe(true);
      expect(
        setOrders(state, state.trains[1]?.id as number, [
          { stationId: depotA, rule: "passThrough" },
          { stationId: depotB, rule: "passThrough" },
        ]).ok,
      ).toBe(true);

      for (let tick = 0; tick < 20 * 24; tick++) stepTrains(state);
      // Both trains should be mid-section, holding a real reservation, at this point.
      expect(state.trains.some((t) => t.heldBlocks.length > 0)).toBe(true);

      if (saveMidway) {
        state = deserializeGameState(JSON.parse(JSON.stringify(serializeGameState(state))));
      }

      for (let tick = 0; tick < 40 * 24; tick++) stepTrains(state);
      return state;
    }

    const withoutSave = run(false);
    const withSave = run(true);

    const snapshot = (s: GameState) =>
      s.trains.map((t) => ({
        route: t.route,
        routeIndex: t.routeIndex,
        edgeProgress: t.edgeProgress,
        distanceTraveled: t.distanceTraveled,
        heldBlocks: t.heldBlocks,
        speed: t.speed,
        status: t.status,
      }));

    expect(snapshot(withSave)).toEqual(snapshot(withoutSave));
  });
});

describe("station slots (SPEC §7.5: Depot 2 / Station 3 / Terminal 5)", () => {
  it("never lets more trains be inside-or-inbound at a Depot than its 2-slot capacity", () => {
    const state = flatLine(106, 20);
    const depotA = station(state, 0, "depot");
    const depotB = station(state, 19, "depot"); // capacity 2 — 3 trains will contend for it

    const bTile = tileAt(state.map, 19, 0);
    for (let i = 0; i < 3; i++) {
      const bought = buyTrain(state, depotA, LOCO, []);
      expect(bought.ok).toBe(true);
      const id = (state.trains[state.trains.length - 1] as { id: number }).id;
      expect(
        setOrders(state, id, [
          { stationId: depotA, rule: "passThrough" },
          { stationId: depotB, rule: "passThrough" },
        ]).ok,
      ).toBe(true);
    }

    for (let tick = 0; tick < 20 * 24; tick++) {
      stepTrains(state);
      const atOrTowardB = state.trains.filter(
        (t) =>
          t.sectionTargetStationId === depotB ||
          (t.sectionTargetStationId === undefined &&
            t.edgeProgress === 0 &&
            t.route[t.routeIndex] === bTile),
      ).length;
      expect(atOrTowardB).toBeLessThanOrEqual(2);
    }
  });
});

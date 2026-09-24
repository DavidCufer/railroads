import { describe, expect, it } from "vitest";
import {
  buildStation,
  buildTrack,
  buyTrain,
  setOrders,
  upgradeTrack,
} from "../../../src/sim/commands";
import { createGameState } from "../../../src/sim/state";
import { computeTargetSpeed, stepTrains } from "../../../src/sim/trains";
import type { Train } from "../../../src/sim/trains";
import { locomotiveById } from "../../../src/data/trains";
import { tileAt } from "../track/helpers";
import type { GameState } from "../../../src/sim/state";

const LOCO = "american-4-4-0"; // medium weight, available from 1848

function buildLine(state: GameState, width: number, y: number): void {
  const path = Array.from({ length: width }, (_, x) => tileAt(state.map, x, y));
  const result = buildTrack(state, path);
  expect(result.ok).toBe(true);
}

function upgradeToDouble(state: GameState, width: number, y: number): void {
  const path = Array.from({ length: width }, (_, x) => tileAt(state.map, x, y));
  const result = upgradeTrack(state, path);
  expect(result.ok).toBe(true);
}

function heldBlockIds(state: GameState): Map<number, number[]> {
  const byBlock = new Map<number, number[]>();
  for (const train of state.trains) {
    for (const hb of train.heldBlocks) {
      const list = byBlock.get(hb.blockId) ?? [];
      list.push(train.id);
      byBlock.set(hb.blockId, list);
    }
  }
  return byBlock;
}

describe("computeTargetSpeed", () => {
  it("is slower uphill than on the flat", () => {
    const state = createGameState({
      seed: 1,
      size: "small",
      waterLevel: "normal",
      roughness: "normal",
    });
    state.startYear = 1848;
    const loco = locomotiveById(LOCO);
    if (!loco) throw new Error("unreachable");
    const train = { cars: [], direction: -1 } as unknown as Train;

    state.map.elevation[0] = 0;
    state.map.elevation[1] = 0;
    state.map.elevation[2] = 5;
    const flat = computeTargetSpeed(state, loco, train, 0, 1);
    const uphill = computeTargetSpeed(state, loco, train, 1, 2);
    expect(uphill).toBeLessThan(flat);
  });
});

describe("single-track shuttle", () => {
  it("two trains shuttle for 60 days without ever double-booking the block or getting stuck", () => {
    const state = createGameState({
      seed: 1,
      size: "small",
      waterLevel: "normal",
      roughness: "normal",
    });
    // Force a long flat plain strip regardless of generated terrain, at y=0.
    const width = 10;
    for (let x = 0; x < width; x++) {
      state.map.terrain[x] = 0; // plain
      state.map.elevation[x] = 0;
    }
    state.startYear = 1848;
    buildLine(state, width, 0);

    const a = buildStation(state, tileAt(state.map, 0, 0), "depot");
    const b = buildStation(state, tileAt(state.map, width - 1, 0), "depot");
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    const stationA = state.stations[0] as { id: number };
    const stationB = state.stations[1] as { id: number };

    const t1 = buyTrain(state, stationA.id, LOCO, []);
    const t2 = buyTrain(state, stationA.id, LOCO, []);
    expect(t1.ok).toBe(true);
    expect(t2.ok).toBe(true);
    for (const train of state.trains) {
      expect(
        setOrders(state, train.id, [
          { stationId: stationA.id, rule: "passThrough" },
          { stationId: stationB.id, rule: "passThrough" },
        ]).ok,
      ).toBe(true);
    }

    for (let tick = 0; tick < 60 * 24; tick++) {
      stepTrains(state);
      for (const [, trainIds] of heldBlockIds(state)) {
        const distinct = new Set(trainIds);
        expect(distinct.size).toBeLessThanOrEqual(1);
      }
    }

    for (const train of state.trains) {
      expect(train.status).not.toBe("stuck");
      expect(train.status).not.toBe("noRoute");
    }
  });
});

describe("double-track opposing traffic", () => {
  it("allows two trains to run in opposite directions concurrently", () => {
    const state = createGameState({
      seed: 2,
      size: "small",
      waterLevel: "normal",
      roughness: "normal",
    });
    const width = 10;
    for (let x = 0; x < width; x++) {
      state.map.terrain[x] = 0;
      state.map.elevation[x] = 0;
    }
    state.startYear = 1848;
    buildLine(state, width, 0);
    upgradeToDouble(state, width, 0);

    const a = buildStation(state, tileAt(state.map, 0, 0), "depot");
    const b = buildStation(state, tileAt(state.map, width - 1, 0), "depot");
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    const stationA = state.stations[0] as { id: number };
    const stationB = state.stations[1] as { id: number };

    const t1 = buyTrain(state, stationA.id, LOCO, []);
    const t2 = buyTrain(state, stationA.id, LOCO, []);
    expect(t1.ok).toBe(true);
    expect(t2.ok).toBe(true);
    for (const train of state.trains) {
      expect(
        setOrders(state, train.id, [
          { stationId: stationB.id, rule: "passThrough" },
          { stationId: stationA.id, rule: "passThrough" },
        ]).ok,
      ).toBe(true);
    }

    let sawOppositeDirections = false;
    for (let tick = 0; tick < 60 * 24; tick++) {
      stepTrains(state);
      const directions = new Set(
        state.trains.filter((t) => t.status === "moving").map((t) => t.direction),
      );
      if (directions.size > 1) sawOppositeDirections = true;
    }

    expect(sawOppositeDirections).toBe(true);
    for (const train of state.trains) {
      expect(train.status).not.toBe("stuck");
    }
  });
});

describe("congested line (4 trains)", () => {
  it("resolves (or reports stuck) within the deadlock timeouts without ever double-booking a block", () => {
    const state = createGameState({
      seed: 3,
      size: "small",
      waterLevel: "normal",
      roughness: "normal",
    });
    const width = 16;
    for (let x = 0; x < width; x++) {
      state.map.terrain[x] = 0;
      state.map.elevation[x] = 0;
    }
    state.startYear = 1848;
    buildLine(state, width, 0);

    const stationXs = [0, 5, 10, 15];
    const stationIds: number[] = [];
    for (const x of stationXs) {
      const r = buildStation(state, tileAt(state.map, x, 0), "depot");
      expect(r.ok).toBe(true);
      stationIds.push((state.stations[state.stations.length - 1] as { id: number }).id);
    }
    const engineShedStation = stationIds[0] as number;

    const trainIds: number[] = [];
    for (let i = 0; i < 4; i++) {
      const bought = buyTrain(state, engineShedStation, LOCO, []);
      expect(bought.ok).toBe(true);
      const train = state.trains[state.trains.length - 1] as { id: number };
      trainIds.push(train.id);
      const forward = i % 2 === 0;
      const orders = forward
        ? [
            { stationId: stationIds[3] as number, rule: "passThrough" as const },
            { stationId: stationIds[0] as number, rule: "passThrough" as const },
          ]
        : [
            { stationId: stationIds[2] as number, rule: "passThrough" as const },
            { stationId: stationIds[3] as number, rule: "passThrough" as const },
            { stationId: stationIds[0] as number, rule: "passThrough" as const },
          ];
      expect(setOrders(state, train.id, orders).ok).toBe(true);
    }

    const startPositions = new Map(
      state.trains.map((t) => [t.id, { x: t.renderToX, y: t.renderToY }]),
    );
    // Per-train run length of consecutive ticks spent waiting at a boundary — the deadlock
    // mechanism (SPEC §7.5) guarantees a resolution (reroute or `stuck`) by DEADLOCK_STUCK_DAYS,
    // so this must never exceed that, however long the surrounding queue takes to drain.
    const waitStreak = new Map<number, number>();
    let maxWaitStreak = 0;

    const TICK_BUDGET = 60 * 24; // 60 in-game days — plenty of room for a 4-train line to drain
    for (let tick = 0; tick < TICK_BUDGET; tick++) {
      stepTrains(state);
      for (const [, ids] of heldBlockIds(state)) {
        expect(new Set(ids).size).toBeLessThanOrEqual(1);
      }
      for (const train of state.trains) {
        const waiting = train.status === "waitingForBlock" || train.status === "waitingForStation";
        const streak = waiting ? (waitStreak.get(train.id) ?? 0) + 1 : 0;
        waitStreak.set(train.id, streak);
        maxWaitStreak = Math.max(maxWaitStreak, streak);
      }
    }

    expect(maxWaitStreak).toBeLessThanOrEqual(10 * 24);

    let anyMoved = false;
    for (const train of state.trains) {
      expect(["moving", "loading", "waitingForBlock", "waitingForStation", "stuck"]).toContain(
        train.status,
      );
      const start = startPositions.get(train.id);
      if (
        start &&
        Math.abs(train.renderToX - start.x) + Math.abs(train.renderToY - start.y) > 0.01
      ) {
        anyMoved = true;
      }
    }
    expect(anyMoved).toBe(true);
  });
});

describe("determinism", () => {
  it("the same commands produce the same train positions after 90 days", () => {
    function run(): GameState {
      const state = createGameState({
        seed: 42,
        size: "small",
        waterLevel: "normal",
        roughness: "normal",
      });
      const width = 10;
      for (let x = 0; x < width; x++) {
        state.map.terrain[x] = 0;
        state.map.elevation[x] = x === 5 ? 3 : 0;
      }
      state.startYear = 1848;
      buildLine(state, width, 0);
      const a = buildStation(state, tileAt(state.map, 0, 0), "depot");
      const b = buildStation(state, tileAt(state.map, width - 1, 0), "depot");
      expect(a.ok).toBe(true);
      expect(b.ok).toBe(true);
      const stationA = state.stations[0] as { id: number };
      const stationB = state.stations[1] as { id: number };
      buyTrain(state, stationA.id, LOCO, ["coal"]);
      buyTrain(state, stationA.id, LOCO, ["grain"]);
      for (const train of state.trains) {
        setOrders(state, train.id, [
          { stationId: stationA.id, rule: "passThrough" },
          { stationId: stationB.id, rule: "passThrough" },
        ]);
      }
      for (let tick = 0; tick < 90 * 24; tick++) stepTrains(state);
      return state;
    }

    const s1 = run();
    const s2 = run();
    expect(
      s1.trains.map((t) => ({
        route: t.route,
        routeIndex: t.routeIndex,
        edgeProgress: t.edgeProgress,
        speed: t.speed,
        status: t.status,
      })),
    ).toEqual(
      s2.trains.map((t) => ({
        route: t.route,
        routeIndex: t.routeIndex,
        edgeProgress: t.edgeProgress,
        speed: t.speed,
        status: t.status,
      })),
    );
  });
});

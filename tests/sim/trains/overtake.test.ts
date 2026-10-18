/** Phase 55: a faster train overtakes a slower one at a station or passing loop (SPEC §7.5). */
import { describe, expect, it } from "vitest";
import {
  buildPassingLoop,
  buildStation,
  buildTrack,
  buyTrain,
  setOrders,
  upgradeTrack,
} from "../../../src/sim/commands";
import { OVERTAKE_MAX_HOLD_HOURS } from "../../../src/data/trains";
import { stepTrains } from "../../../src/sim/trains";
import { overtaking } from "../../../src/sim/trains/overtake";
import type { GameState } from "../../../src/sim/state";
import { makeTestMap, makeTestState, tileAt } from "../track/helpers";

const LENGTH = 40;
const MID = 20;

function line(): { state: GameState; a: number; m: number; b: number } {
  const map = makeTestMap([Array.from({ length: LENGTH }, () => "p").join("")]);
  const state = makeTestState(map, { startYear: 1900 });
  state.cash = 50_000_000;
  buildTrack(
    state,
    Array.from({ length: LENGTH }, (_, x) => tileAt(map, x, 0)),
  );
  buildStation(state, tileAt(map, 0, 0), "depot");
  buildStation(state, tileAt(map, MID, 0), "depot");
  buildStation(state, tileAt(map, LENGTH - 1, 0), "terminal");
  const [a, m, b] = state.stations;
  return { state, a: a!.id, m: m!.id, b: b!.id };
}

function launch(state: GameState, loco: string, from: number, stops: number[]): number {
  const bought = buyTrain(state, from, loco, ["passengers"]);
  expect(bought).toMatchObject({ ok: true });
  const id = state.trains[state.trains.length - 1]!.id;
  setOrders(
    state,
    id,
    stops.map((stationId) => ({ stationId, rule: "auto" as const })),
  );
  return id;
}

/** Ticks until `trainId` first stands at the end station `at`, or Infinity. */
function run(state: GameState, ticks: number, watch: (tick: number) => void): void {
  for (let i = 0; i < ticks; i++) {
    stepTrains(state);
    watch(i);
  }
}

describe("overtaking at a passing place", () => {
  it("an express behind a local that stops everywhere passes it at the middle station", () => {
    const { state, a, m, b } = line();
    const local = launch(state, "grasshopper-0-4-0", a, [a, m, b, m]);
    run(state, 255, () => {});
    const express = launch(state, "american-4-4-0", a, [a, b]);
    let held = 0;
    let expressAtB = Infinity;
    let localAtB = Infinity;
    const L = state.trains.find((t) => t.id === local)!;
    const E = state.trains.find((t) => t.id === express)!;
    run(state, 2500, (tick) => {
      if (L.waitingOn?.kind === "overtake") {
        held++;
        expect(L.waitingOn.trainIds).toEqual([express]);
      }
      const bTile = state.stations.find((s) => s.id === b)!.tile;
      if (E.route[E.routeIndex] === bTile && E.status === "loading" && expressAtB === Infinity)
        expressAtB = tick;
      if (L.route[L.routeIndex] === bTile && L.status === "loading" && localAtB === Infinity)
        localAtB = tick;
    });
    expect(held).toBeGreaterThan(0);
    expect(expressAtB).toBeLessThan(localAtB);
    expect(held).toBeLessThanOrEqual(OVERTAKE_MAX_HOLD_HOURS);
  });

  it("without the rule the express waits behind the local (the rule is worth something)", () => {
    const times: number[] = [];
    for (const on of [true, false]) {
      overtaking.enabled = on;
      try {
        const { state, a, m, b } = line();
        launch(state, "grasshopper-0-4-0", a, [a, m, b, m]);
        run(state, 255, () => {});
        const express = launch(state, "american-4-4-0", a, [a, b]);
        const E = state.trains.find((t) => t.id === express)!;
        const bTile = state.stations.find((s) => s.id === b)!.tile;
        let at = Infinity;
        run(state, 2500, (tick) => {
          if (E.route[E.routeIndex] === bTile && E.status === "loading" && at === Infinity)
            at = tick;
        });
        times.push(at);
      } finally {
        overtaking.enabled = true;
      }
    }
    expect(times[0]).toBeLessThan(times[1]!);
  });

  it("two equal-speed trains never hold each other", () => {
    const { state, a, m, b } = line();
    const t1 = launch(state, "grasshopper-0-4-0", a, [a, m, b, m]);
    run(state, 60, () => {});
    const t2 = launch(state, "grasshopper-0-4-0", a, [a, m, b, m]);
    const ts = state.trains.filter((t) => t.id === t1 || t.id === t2);
    run(state, 1500, () => {
      for (const t of ts) expect(t.waitingOn?.kind).not.toBe("overtake");
    });
  });

  it("opposing traffic on the single track at the same time: nobody deadlocks", () => {
    const { state, a, m, b } = line();
    const local = launch(state, "grasshopper-0-4-0", a, [a, m, b, m]);
    run(state, 255, () => {});
    const express = launch(state, "american-4-4-0", a, [a, b]);
    const opposing = launch(state, "american-4-4-0", a, [b, a]);
    const ids = [local, express, opposing];
    const loads = new Map<number, number>();
    run(state, 6000, () => {
      for (const t of state.trains) {
        if (t.status === "loading" && t.loadTicksLeft === -1)
          loads.set(t.id, (loads.get(t.id) ?? 0) + 1);
      }
    });
    for (const id of ids) {
      expect(state.trains.find((t) => t.id === id)!.status).not.toBe("stuck");
      expect(loads.get(id) ?? 0).toBeGreaterThan(2);
    }
  });

  it("a train never holds for one that is itself waiting", () => {
    const { state, a, m, b } = line();
    launch(state, "grasshopper-0-4-0", a, [a, m, b, m]);
    run(state, 150, () => {});
    launch(state, "american-4-4-0", a, [a, b]);
    run(state, 2000, () => {
      for (const t of state.trains) {
        if (t.waitingOn?.kind !== "overtake") continue;
        for (const id of t.waitingOn.trainIds) {
          const f = state.trains.find((x) => x.id === id)!;
          expect(["moving", "loading"]).toContain(f.status);
        }
      }
    });
  });

  it("a train passing a passing loop is held there for a faster one", () => {
    const { state, a, b } = line();
    const loopTile = 12;
    expect(buildPassingLoop(state, loopTile).ok).toBe(true);
    const local = launch(state, "grasshopper-0-4-0", a, [a, b]);
    run(state, 150, () => {});
    launch(state, "american-4-4-0", a, [a, b]);
    const L = state.trains.find((t) => t.id === local)!;
    let held = 0;
    run(state, 2500, () => {
      if (L.waitingOn?.kind === "overtake") held++;
    });
    expect(held).toBeGreaterThan(0);
  });

  it("a passing loop can be built on double track, where it only serves overtaking", () => {
    const { state, a, b } = line();
    const path = Array.from({ length: LENGTH }, (_, x) => x);
    expect(upgradeTrack(state, path).ok).toBe(true);
    expect(buildPassingLoop(state, 12).ok).toBe(true);
    const local = launch(state, "grasshopper-0-4-0", a, [a, b]);
    run(state, 150, () => {});
    const express = launch(state, "american-4-4-0", a, [a, b]);
    const L = state.trains.find((t) => t.id === local)!;
    let held = 0;
    let longest = 0;
    run(state, 2500, () => {
      if (L.waitingOn?.kind === "overtake") {
        held++;
        expect(L.waitingOn.trainIds).toEqual([express]);
      } else held = 0;
      longest = Math.max(longest, held);
    });
    expect(longest).toBeGreaterThan(0);
    expect(longest).toBeLessThanOrEqual(OVERTAKE_MAX_HOLD_HOURS);
  });
});

/** PLAN Phase 27: the player's Ljubljana layout — a diagonal double main, a single branch joining it and a
 * diagonal line crossing it mid-tile next to the branch. */
import { describe, expect, it } from "vitest";
import {
  buildStation,
  buildTrack,
  buyTrain,
  setOrders,
  upgradeTrack,
} from "../../../src/sim/commands";
import { stepTrains } from "../../../src/sim/trains";
import type { GameState } from "../../../src/sim/state";
import { forceTrack, makeTestMap, makeTestState, tileAt } from "../track/helpers";
import { bodyPoints } from "./crossingHelpers";
import { vehicleOverlapsNow } from "./geometryHelpers";

const N = 20;

export function playerWorld(): { state: GameState; stations: number[]; built: boolean } {
  const map = makeTestMap(Array.from({ length: N }, () => "p".repeat(N)));
  const state = makeTestState(map, { startYear: 1900, cash: 1e9 });
  const t = (x: number, y: number): number => tileAt(map, x, y);
  const path = (pts: Array<[number, number]>): number[] => pts.map(([x, y]) => t(x, y));
  const main = Array.from({ length: 13 }, (_, i) => [2 + i, 2 + i] as [number, number]);
  let built = buildTrack(state, path(main)).ok;
  built = upgradeTrack(state, path(main)).ok && built;
  // Branch off the main at (5,5), running east to (9,5).
  built =
    buildTrack(
      state,
      path([
        [5, 5],
        [6, 5],
        [7, 5],
        [8, 5],
        [9, 5],
      ]),
    ).ok && built;
  // Line crossing the main mid-tile between (7,7)-(8,8): x + y = 15.
  const cross = Array.from({ length: 12 }, (_, i) => [13 - i, 2 + i] as [number, number]);
  // The layout rules (Phase 27 A) refuse this line today; an old save still contains it, so add it directly.
  expect(buildTrack(state, path(cross)).ok).toBe(false);
  forceTrack(state, cross);
  const st = (x: number, y: number): number => {
    expect(buildStation(state, t(x, y), "depot").ok).toBe(true);
    const s = state.stations[state.stations.length - 1]!;
    s.hasEngineShed = true;
    return s.id;
  };
  const stations = [st(2, 2), st(14, 14), st(9, 5), st(13, 2), st(2, 13)];
  return { state, stations, built };
}

function train(state: GameState, from: number, to: number): void {
  expect(buyTrain(state, from, "american-4-4-0", ["coal", "coal", "coal"])).toMatchObject({
    ok: true,
  });
  const id = state.trains[state.trains.length - 1]!.id;
  setOrders(state, id, [
    { stationId: from, rule: "passThrough" },
    { stationId: to, rule: "passThrough" },
  ]);
}

describe("player's junction layout (Ljubljana)", () => {
  it("trains never overlap, even where the lines cross mid-tile", () => {
    const { state, stations } = playerWorld();
    const [a, b, c, d, e] = stations as [number, number, number, number, number];
    train(state, a, b);
    train(state, b, a);
    train(state, c, b);
    train(state, d, e);
    train(state, e, d);
    const overlaps: string[] = [];
    for (let i = 0; i < 3000 && overlaps.length < 5; i++) {
      stepTrains(state);
      state.ticks++;
      for (const o of vehicleOverlapsNow(state)) overlaps.push(`tick ${i}: ${o}`);
    }
    expect(overlaps.slice(0, 5)).toEqual([]);
  });
});

describe("route-precise junction waits (Phase 31)", () => {
  // d -> e train frozen (a breakdown) on the mid-tile crossing next to the branch junction at (5,5).
  function waits(from: number, to: number): { waited: number; arrivedAt: number } {
    const { state, stations } = playerWorld();
    buyTrain(state, stations[3]!, "american-4-4-0", ["coal", "coal", "coal"]);
    const blocker = state.trains[0]!;
    setOrders(state, blocker.id, [
      { stationId: stations[3]!, rule: "auto" },
      { stationId: stations[4]!, rule: "auto" },
    ]);
    // Run until the blocker's loco is on the crossing point (the middle of the cell (7,7)-(8,8), i.e. (8, 8) in
    // the helper's centre-based coordinates) and its head has passed it; then keep it broken down there.
    let frozen = false;
    const tile = (x: number, y: number): number => tileAt(state.map, x, y);
    for (let i = 0; i < 4000 && !frozen; i++) {
      stepTrains(state);
      state.ticks++;
      const head = bodyPoints(state, blocker)[0]!;
      const passed =
        blocker.route[blocker.routeIndex] === tile(7, 8) ||
        (blocker.route[blocker.routeIndex] === tile(8, 7) &&
          blocker.route[blocker.routeIndex + 1] === tile(7, 8) &&
          blocker.edgeProgress > 0.6);
      frozen = passed && Math.hypot(head[0] - 7.6, head[1] - 8.4) < 0.5;
    }
    expect(frozen).toBe(true);
    buyTrain(state, stations[from]!, "american-4-4-0", ["coal", "coal"]);
    const t = state.trains[1]!;
    setOrders(state, t.id, [
      { stationId: stations[from]!, rule: "auto" },
      { stationId: stations[to]!, rule: "auto" },
    ]);
    let waited = 0;
    let arrivedAt = -1;
    for (let i = 0; i < 3000; i++) {
      blocker.breakdownTicksLeft = 5000;
      stepTrains(state);
      state.ticks++;
      if (t.crossingWait) waited++;
      if (arrivedAt < 0 && t.status === "loading" && t.currentOrderIndex === 1) arrivedAt = i;
    }
    return { waited, arrivedAt };
  }

  it("a train that only turns off the main (a -> branch) is not held by a train stuck on the crossing", () => {
    const turn = waits(0, 2);
    expect(turn.waited).toBe(0);
    expect(turn.arrivedAt).toBeGreaterThan(0);
    const back = waits(2, 0);
    expect(back.waited).toBe(0);
    expect(back.arrivedAt).toBeGreaterThan(0);
  });

  it("a train that runs on over the crossing does wait for it", () => {
    const straight = waits(0, 1);
    expect(straight.arrivedAt).toBe(-1); // the frozen train never lets it through
  });
});

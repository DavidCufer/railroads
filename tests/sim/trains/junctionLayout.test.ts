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
import { makeTestMap, makeTestState, tileAt } from "../track/helpers";
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
  built = buildTrack(state, path(cross)).ok && built;
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

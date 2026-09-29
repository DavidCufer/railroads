/** Phase 25A: crossing / junction nodes are exclusive — trains never overlap on them. */
import { describe, expect, it } from "vitest";
import { buildStation, buildTrack, buyTrain, setOrders } from "../../../src/sim/commands";
import { stepTrains } from "../../../src/sim/trains";
import type { GameState } from "../../../src/sim/state";
import { makeTestMap, makeTestState, tileAt } from "../track/helpers";
import { conflictNodes, overlapsNow } from "./crossingHelpers";

const N = 17;

function line(state: GameState, pts: Array<[number, number]>): void {
  const map = state.map;
  expect(
    buildTrack(
      state,
      pts.map(([x, y]) => tileAt(map, x, y)),
    ).ok,
  ).toBe(true);
}

function world(): GameState {
  const map = makeTestMap(Array.from({ length: N }, () => "p".repeat(N)));
  return makeTestState(map, { startYear: 1900, cash: 1e9 });
}

function station(state: GameState, x: number, y: number): number {
  expect(buildStation(state, tileAt(state.map, x, y), "depot").ok).toBe(true);
  const st = state.stations[state.stations.length - 1]!;
  st.hasEngineShed = true;
  return st.id;
}

function train(state: GameState, from: number, to: number): number {
  const r = buyTrain(state, from, "american-4-4-0", ["coal", "coal"]);
  expect(r).toMatchObject({ ok: true });
  const id = state.trains[state.trains.length - 1]!.id;
  setOrders(state, id, [
    { stationId: from, rule: "passThrough" },
    { stationId: to, rule: "passThrough" },
  ]);
  return id;
}

function run(state: GameState, ticks: number): { overlaps: string[]; arrived: Set<number> } {
  const overlaps: string[] = [];
  const arrived = new Set<number>();
  for (let i = 0; i < ticks; i++) {
    stepTrains(state);
    state.ticks++;
    overlaps.push(...overlapsNow(state).map((o) => `tick ${i}: ${o}`));
    for (const t of state.trains)
      if (t.status === "loading" && t.currentOrderIndex === 0) arrived.add(t.id);
  }
  return { overlaps, arrived };
}

describe("crossing interlock", () => {
  it("X crossing: two trains arriving together never overlap on the crossing", () => {
    const s = world();
    const mid = 8;
    line(
      s,
      Array.from({ length: N }, (_, x) => [x, mid] as [number, number]),
    );
    line(
      s,
      Array.from({ length: N }, (_, y) => [mid, y] as [number, number]),
    );
    expect(conflictNodes(s)).toEqual([tileAt(s.map, mid, mid)]);
    const w = station(s, 0, mid);
    const e = station(s, N - 1, mid);
    const nn = station(s, mid, 0);
    const ss = station(s, mid, N - 1);
    train(s, w, e);
    train(s, nn, ss);
    const { overlaps } = run(s, 400);
    expect(overlaps.slice(0, 5)).toEqual([]);
  });

  it("junction off a single main line: a merging branch train and a main train never overlap", () => {
    const s = world();
    const mid = 8;
    line(
      s,
      Array.from({ length: N }, (_, x) => [x, mid] as [number, number]),
    );
    // 45° branch joining the main line at (8,8) from the north-west.
    line(s, [
      [4, 4],
      [5, 5],
      [6, 6],
      [7, 7],
      [8, 8],
    ]);
    expect(conflictNodes(s).length).toBe(1);
    const w = station(s, 0, mid);
    const e = station(s, N - 1, mid);
    const b = station(s, 4, 4);
    train(s, w, e);
    train(s, b, e);
    const { overlaps } = run(s, 400);
    expect(overlaps.slice(0, 5)).toEqual([]);
  });
});

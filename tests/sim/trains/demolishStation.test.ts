/** PLAN Phase 29 B: demolishing a station from its panel strips it from train orders instead of refusing. */
import { describe, expect, it } from "vitest";
import {
  buildStation,
  buildTrack,
  buyTrain,
  demolishStation,
  setOrders,
} from "../../../src/sim/commands";
import { advanceOneHour } from "../../../src/sim/tick";
import { stuckTrains } from "../../../src/sim/trains";
import { makeTestMap, makeTestState, tileAt } from "../track/helpers";

function world() {
  const map = makeTestMap(Array.from({ length: 4 }, () => "p".repeat(40)));
  const state = makeTestState(map, { seed: 5, startYear: 1900, cash: 1e12 });
  const line = Array.from({ length: 30 }, (_, x) => tileAt(map, x + 2, 1));
  expect(buildTrack(state, line).ok).toBe(true);
  for (const i of [0, 9, 19, 29])
    expect(buildStation(state, line[i] as number, "depot").ok).toBe(true);
  const ids = state.stations.map((s) => s.id) as [number, number, number, number];
  const order = (list: number[]) => list.map((stationId) => ({ stationId, rule: "auto" as const }));
  expect(buyTrain(state, ids[0], "atlantic-4-4-2", ["passengers"]).ok).toBe(true);
  const t1 = state.trains[state.trains.length - 1]!;
  setOrders(state, t1.id, order([ids[0], ids[1], ids[2]]));
  expect(buyTrain(state, ids[0], "atlantic-4-4-2", ["passengers"]).ok).toBe(true);
  const t2 = state.trains[state.trains.length - 1]!;
  setOrders(state, t2.id, order([ids[0], ids[3]]));
  return { state, ids, t1, t2 };
}

describe("demolishStation", () => {
  it("removes the stop from orders at any moment of the trains' cycle and keeps everything moving", () => {
    for (const cut of [1, 30, 75, 140, 260, 400]) {
      const { state, ids, t1 } = world();
      for (let h = 0; h < cut; h++) advanceOneHour(state);
      const cash = state.cash;
      const res = demolishStation(state, ids[1]);
      expect(res.ok).toBe(true);
      expect(state.cash).toBeGreaterThan(cash);
      expect(state.stations.some((s) => s.id === ids[1])).toBe(false);
      expect(t1.orders.map((o) => o.stationId)).toEqual([ids[0], ids[2]]);
      expect(state.news.some((n) => n.kind === "stationDemolished")).toBe(true);
      const before = t1.distanceTraveled;
      for (let h = 0; h < 12 * 24; h++) advanceOneHour(state);
      expect(t1.distanceTraveled - before).toBeGreaterThan(20);
      expect(["noRoute", "stuck"]).not.toContain(t1.status);
    }
  });

  it("flags a train left with a single stop", () => {
    const { state, ids, t2 } = world();
    expect(demolishStation(state, ids[3]).ok).toBe(true);
    expect(t2.orders).toHaveLength(1);
    expect(stuckTrains(state).map((s) => s.train.id)).toContain(t2.id);
  });

  it("refuses the last engine shed", () => {
    const { state, ids } = world();
    for (const s of state.stations) s.hasEngineShed = false;
    state.stations[0]!.hasEngineShed = true;
    expect(demolishStation(state, ids[0])).toEqual({ ok: false, reason: "last-engine-shed" });
  });
});

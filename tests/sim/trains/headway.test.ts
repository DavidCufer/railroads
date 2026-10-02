/** PLAN Phase 34 item 9: exposing departure spacing — per-stop gap command and "Space trains evenly". */
import { describe, expect, it } from "vitest";
import {
  buildStation,
  buildTrack,
  buyTrain,
  setOrderGap,
  setOrders,
  spaceTrainsEvenly,
} from "../../../src/sim/commands";
import { estimateRoundTripDays, evenGapDays } from "../../../src/sim/trains/headway";
import { makeTestMap, makeTestState, tileAt } from "../track/helpers";

function world(trains: number) {
  const row = Array.from({ length: 40 }, () => "p").join("");
  const map = makeTestMap([row, row, row]);
  const state = makeTestState(map, { startYear: 1860 });
  state.cash = 1e9;
  buildTrack(
    state,
    Array.from({ length: 40 }, (_, x) => tileAt(map, x, 1)),
  );
  buildStation(state, tileAt(map, 0, 1), "station");
  buildStation(state, tileAt(map, 39, 1), "station");
  const [a, b] = state.stations.map((s) => s.id) as [number, number];
  for (let i = 0; i < trains; i++) {
    expect(buyTrain(state, a, "grasshopper-0-4-0", ["passengers"]).ok).toBe(true);
    const id = state.trains[i]!.id;
    expect(
      setOrders(state, id, [
        { stationId: a, rule: "auto" },
        { stationId: b, rule: "auto" },
      ]).ok,
    ).toBe(true);
  }
  return state;
}

describe("departure spacing (Phase 34)", () => {
  it("setOrderGap sets and clears one stop's gap and keeps the train's progress", () => {
    const state = world(1);
    const id = state.trains[0]!.id;
    state.trains[0]!.currentOrderIndex = 1;
    expect(setOrderGap(state, id, 0, 5).ok).toBe(true);
    expect(state.trains[0]!.orders[0]?.minGapDays).toBe(5);
    expect(state.trains[0]!.currentOrderIndex).toBe(1);
    expect(setOrderGap(state, id, 0, undefined).ok).toBe(true);
    expect(state.trains[0]!.orders[0]?.minGapDays).toBeUndefined();
    expect(setOrderGap(state, id, 5, 2).ok).toBe(false);
    expect(setOrderGap(state, id, 0, 0).ok).toBe(false);
  });

  it("round trip grows with distance and the even gap divides it between the trains", () => {
    const state = world(4);
    const round = estimateRoundTripDays(state, state.trains[0]!);
    expect(round).toBeGreaterThan(0.5);
    expect(evenGapDays(round, 4)).toBe(Math.max(1, Math.round(round / 4)));
    expect(evenGapDays(0.5, 4)).toBe(1);
  });

  it("spaceTrainsEvenly gives every stop of every train of the line the same gap; one train is refused", () => {
    const state = world(4);
    const ids = state.trains.map((t) => t.id);
    const r = spaceTrainsEvenly(state, ids);
    expect(r.ok).toBe(true);
    const gap = r.ok ? r.gapDays : undefined;
    expect(gap).toBeGreaterThanOrEqual(1);
    for (const t of state.trains) for (const o of t.orders) expect(o.minGapDays).toBe(gap);
    expect(spaceTrainsEvenly(state, [ids[0]!]).ok).toBe(false);
  });
});

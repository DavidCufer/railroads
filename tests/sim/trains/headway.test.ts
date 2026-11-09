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
import { advanceOneHour } from "../../../src/sim/tick";
import { makeTestMap, makeTestState, tileAt } from "../track/helpers";
import { lineWithStops } from "./middleStop.test";

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

/** Phase 91: the stop-time estimate follows the real loading rule (cars unloaded + cars loaded), so the round trip it gives
 * matches a measured one on a five-stop there-and-back line, for a busy and for a thin line. */
describe("round-trip estimate against a measured run (Phase 91)", () => {
  const measure = (pop: number, cars: number): { est: number; real: number } => {
    const { state, stationIds } = lineWithStops(5, 14, 1870, pop);
    for (const s of state.stations) s.hasEngineShed = true;
    const cyc = [0, 1, 2, 3, 4, 3, 2, 1];
    expect(
      buyTrain(state, stationIds[0]!, "american-4-4-0", Array(cars).fill("passengers")).ok,
    ).toBe(true);
    const t = state.trains[0]!;
    setOrders(
      state,
      t.id,
      cyc.map((i) => ({ stationId: stationIds[i]!, rule: "auto" as const })),
    );
    // the day the train sets off from the first station, each time
    const leaves: number[] = [];
    let prev = "";
    for (let h = 0; h < 24 * 260; h++) {
      advanceOneHour(state);
      if (prev === "loading" && t.status === "moving" && t.currentOrderIndex === 1)
        leaves.push(state.ticks);
      prev = t.status;
    }
    const real = leaves.slice(2).reduce((u, x, i) => u + (x - leaves[i + 1]!), 0);
    return {
      est: estimateRoundTripDays(state, t),
      real: real / (leaves.length - 2) / 24,
    };
  };
  for (const [pop, cars] of [
    [40_000, 6],
    [3_000, 6],
    [1_000, 8],
  ] as const)
    it(`pop ${pop}, ${cars} cars: within 12 % of the measured round trip`, () => {
      const { est, real } = measure(pop, cars);
      expect(Math.abs(est - real) / real).toBeLessThan(0.12);
    });
});

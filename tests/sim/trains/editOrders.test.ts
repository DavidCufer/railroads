import { describe, expect, it } from "vitest";
import {
  buildStation,
  buildTrack,
  buyTrain,
  editOrders,
  setOrders,
} from "../../../src/sim/commands";
import { makeTestMap, makeTestState, tileAt } from "../track/helpers";

describe("editOrders", () => {
  function world() {
    const map = makeTestMap(["ppppppppp"]);
    const state = makeTestState(map);
    buildTrack(
      state,
      Array.from({ length: 9 }, (_, x) => tileAt(map, x, 0)),
    );
    for (const x of [0, 4, 8]) buildStation(state, tileAt(map, x, 0), "depot");
    const [a, b, c] = state.stations;
    expect(buyTrain(state, a!.id, "grasshopper-0-4-0", []).ok).toBe(true);
    const train = state.trains[0]!;
    setOrders(state, train.id, [
      { stationId: a!.id, rule: "auto" },
      { stationId: b!.id, rule: "auto" },
      { stationId: c!.id, rule: "auto" },
    ]);
    return { state, train, a: a!, b: b!, c: c! };
  }

  it("keeps heading for the same station when stops are reordered or rules change", () => {
    const { state, train, a, b, c } = world();
    train.currentOrderIndex = 1; // heading for b
    const r = editOrders(state, train.id, [
      { stationId: b.id, rule: "fullLoad" },
      { stationId: c.id, rule: "auto" },
      { stationId: a.id, rule: "auto" },
    ]);
    expect(r.ok).toBe(true);
    expect(train.currentOrderIndex).toBe(0);
    expect(train.orders[0]?.rule).toBe("fullLoad");
  });

  it("restarts at the top when the current stop is removed, and validates 2..8 stops", () => {
    const { state, train, a, b, c } = world();
    train.currentOrderIndex = 2; // c
    expect(
      editOrders(state, train.id, [
        { stationId: a.id, rule: "auto" },
        { stationId: b.id, rule: "auto" },
      ]).ok,
    ).toBe(true);
    expect(train.currentOrderIndex).toBe(0);
    expect(editOrders(state, train.id, [{ stationId: c.id, rule: "auto" }]).ok).toBe(false);
    expect(editOrders(state, 999, [])).toEqual({ ok: false, reason: "invalid-train" });
  });
});

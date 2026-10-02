import { describe, expect, it } from "vitest";
import { buyTrain, setOrders } from "../../../src/sim/commands";
import { passedOrderStops } from "../../../src/sim/trains/passedStops";
import { lineWithStops } from "./middleStop.test";

describe("passedOrderStops (Phase 32)", () => {
  it("A, B, C passes B on the way back; A, B, C, B and A, C do not", () => {
    const { state, stationIds } = lineWithStops(3, 12, 1840);
    const [a, b, c] = stationIds as [number, number, number];
    buyTrain(state, a, "norris-4-2-0", ["passengers", "passengers", "mail"]);
    const t = state.trains[0]!;
    const orders = (ids: number[]) => ids.map((id) => ({ stationId: id, rule: "auto" as const }));
    setOrders(state, t.id, orders([a, b, c]));
    expect(passedOrderStops(state, t)).toEqual([{ orderIndex: 1, fromIndex: 2 }]);
    setOrders(state, t.id, orders([a, b, c, b]));
    expect(passedOrderStops(state, t)).toEqual([]);
    setOrders(state, t.id, orders([a, c]));
    expect(passedOrderStops(state, t)).toEqual([]);
  });
});

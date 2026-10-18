/** Phase 54 item 2: an express (orders A, B only) really passes the stations between its stops without calling at them. */
import { describe, expect, it } from "vitest";
import { buyTrain, setOrders } from "../../../src/sim/commands";
import { advanceOneHour } from "../../../src/sim/tick";
import { passengerLinks } from "../../../src/sim/stations/destinations";
import { lineWithStops } from "./middleStop.test";

describe("express and local trains on one line", () => {
  it("an express A-C never stops at B, a local A-B-C-B does; the network gives the express no link to B", () => {
    const { state, stationIds } = lineWithStops(3, 12, 1860);
    const [a, b, c] = stationIds as [number, number, number];
    for (const s of state.stations) s.hasEngineShed = true;
    const orders = (ids: number[]) => ids.map((id) => ({ stationId: id, rule: "auto" as const }));
    expect(buyTrain(state, a, "american-4-4-0", ["passengers"]).ok).toBe(true);
    const express = state.trains[0]!;
    expect(setOrders(state, express.id, orders([a, c])).ok).toBe(true);
    // the express alone links A and C, not B
    expect([...(passengerLinks(state.trains).get(a) ?? [])]).toEqual([c]);

    const stopsAt = new Set<number>();
    for (let i = 0; i < 24 * 30; i++) {
      advanceOneHour(state);
      if (express.status === "loading")
        stopsAt.add(express.orders[express.currentOrderIndex]!.stationId);
    }
    expect(stopsAt.has(a)).toBe(true);
    expect(stopsAt.has(c)).toBe(true);
    expect(stopsAt.has(b)).toBe(false);
    expect(state.stations.find((s) => s.id === b)?.lastDepartureTick).toBeUndefined();

    // a local calls at B, and adds B to the network
    expect(buyTrain(state, a, "american-4-4-0", ["passengers"]).ok).toBe(true);
    const local = state.trains[1]!;
    expect(setOrders(state, local.id, orders([a, b, c, b])).ok).toBe(true);
    expect([...(passengerLinks(state.trains).get(a) ?? [])].sort()).toEqual([b, c].sort());
    for (
      let i = 0;
      i < 24 * 40 && state.stations.find((s) => s.id === b)?.lastDepartureTick === undefined;
      i++
    )
      advanceOneHour(state);
    expect(state.stations.find((s) => s.id === b)?.lastDepartureTick).toBeDefined();
  });
});

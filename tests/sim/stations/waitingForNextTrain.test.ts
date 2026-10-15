/** Phase 51: people wait only for the next train (SPEC §9.5e-5). */
import { describe, expect, it } from "vitest";
import { MAX_WAIT_DAYS, MIN_WAIT_DAYS } from "../../../src/data/economy";
import { buyTrain, setOrders } from "../../../src/sim/commands";
import { accrueDailyCargo } from "../../../src/sim/economy/cargoFlow";
import {
  serviceIntervalDays,
  serviceKey,
  serviceRates,
  waitingCap,
} from "../../../src/sim/stations/waiting";
import { advanceOneHour } from "../../../src/sim/tick";
import type { Train } from "../../../src/sim/trains/types";
import type { Station } from "../../../src/sim/stations/types";
import { lineWithStops } from "../trains/middleStop.test";

describe("the waiting cap", () => {
  it("is the demand of the days until the next train", () => {
    // 300 a month = 10 a day; a train every 4 days
    expect(waitingCap(300, 4)).toBeCloseTo(40, 9);
    expect(waitingCap(300, 7.5)).toBeCloseTo(75, 9);
  });

  it("is clamped to MIN_WAIT_DAYS and MAX_WAIT_DAYS of demand", () => {
    expect(waitingCap(300, 0.1)).toBeCloseTo(10 * MIN_WAIT_DAYS, 9);
    expect(waitingCap(300, 400)).toBeCloseTo(10 * MAX_WAIT_DAYS, 9);
  });

  it("is zero with no service", () => {
    expect(waitingCap(300, serviceIntervalDays(undefined))).toBe(0);
    expect(waitingCap(300, serviceIntervalDays(0))).toBe(0);
    expect(waitingCap(0, 4)).toBe(0);
  });

  it("the interval is the round trip over the number of trains that carry the people", () => {
    const { state, stationIds } = lineWithStops(3, 12, 1860);
    for (const s of state.stations) s.hasEngineShed = true;
    const [a, b] = stationIds;
    const buy = (): Train => {
      expect(buyTrain(state, a!, "american-4-4-0", ["passengers"]).ok).toBe(true);
      const t = state.trains[state.trains.length - 1] as Train;
      expect(
        setOrders(state, t.id, [
          { stationId: a!, rule: "auto" },
          { stationId: b!, rule: "auto" },
        ]).ok,
      ).toBe(true);
      return t;
    };
    buy();
    const one = serviceIntervalDays(serviceRates(state).get(serviceKey(a!, b!)))!;
    buy();
    buy();
    const three = serviceIntervalDays(serviceRates(state).get(serviceKey(a!, b!)))!;
    expect(three).toBeCloseTo(one / 3, 9);
    // a train that does not call at b carries nobody there
    expect(serviceRates(state).get(serviceKey(a!, 999))).toBeUndefined();
  });

  it("people over the cap are counted as unserved demand", () => {
    const { state, stationIds } = lineWithStops(3, 12, 1860);
    for (const s of state.stations) s.hasEngineShed = true;
    const [a, b, c] = stationIds;
    expect(buyTrain(state, a!, "american-4-4-0", ["passengers"]).ok).toBe(true);
    const t = state.trains[state.trains.length - 1] as Train;
    setOrders(
      state,
      t.id,
      [a!, b!, c!, b!].map((id) => ({ stationId: id, rule: "auto" as const })),
    );
    for (let day = 0; day < 90; day++) accrueDailyCargo(state);
    const eco = state.stationEconomy.get(a!);
    const waiting = state.stationCargo.get(a!)?.passengers?.amount ?? 0;
    const flow = state.stationFlow.get(a!);
    const lost =
      (flow?.month.passengers?.lostUnits ?? 0) + (flow?.lastMonth.passengers?.lostUnits ?? 0);
    expect(waiting).toBeGreaterThan(0);
    expect(waiting).toBeLessThan(eco?.supply.passengers ?? 0); // less than a month of people
    expect(lost).toBeGreaterThan(0);
  });
});

describe("a multi-stop train refills its seats at an intermediate stop", () => {
  it("people who get off at the middle station make room for those bound further", () => {
    const { state, stationIds } = lineWithStops(3, 12, 1860);
    for (const s of state.stations) s.hasEngineShed = true;
    const [a, b, c] = stationIds.map((id) => state.stations.find((s) => s.id === id)) as Station[];
    expect(buyTrain(state, a!.id, "american-4-4-0", ["passengers"]).ok).toBe(true);
    const t = state.trains[state.trains.length - 1] as Train;
    setOrders(
      state,
      t.id,
      [a!, b!, c!, b!].map((s) => ({ stationId: s.id, rule: "auto" as const })),
    );
    t.currentOrderIndex = 1;
    // a full car, all bound for b
    const car = t.cars[0] as Train["cars"][number];
    const full = 40;
    car.lots = [{ dest: b!.id, amount: full, originTile: a!.tile, tick: state.ticks }];
    car.loadedUnits = full;
    car.loadedTile = a!.tile;
    car.loadedTick = state.ticks;
    // b's platform has people bound for c waiting
    state.stationCargo.set(b!.id, {
      passengers: {
        amount: 200,
        waitingDays: 5,
        lots: [{ dest: c!.id, amount: 200, originTile: b!.tile }],
      },
    });
    let refilled = false;
    for (let i = 0; i < 24 * 40 && !refilled; i++) {
      advanceOneHour(state);
      if (t.currentOrderIndex === 2 && t.status === "moving")
        refilled =
          t.cars.some((cc) => cc.lots?.some((l) => l.dest === c!.id)) &&
          t.cars.every((cc) => !cc.lots?.some((l) => l.dest === b!.id));
    }
    expect(refilled).toBe(true);
    expect(t.cars[0]!.loadedUnits).toBeGreaterThan(0);
  });
});

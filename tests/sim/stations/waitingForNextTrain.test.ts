/** Phase 51: people wait only for the next train (SPEC §9.5e-5). */
import { describe, expect, it } from "vitest";
import { MAX_WAIT_DAYS } from "../../../src/data/economy";
import { buyTrain, setOrders } from "../../../src/sim/commands";
import { accrueDailyCargo } from "../../../src/sim/economy/cargoFlow";
import {
  serviceIntervalDays,
  serviceKey,
  serviceRates,
  observedIntervalDays,
  stampDeparture,
  waitingCap,
} from "../../../src/sim/stations/waiting";
import { advanceOneHour } from "../../../src/sim/tick";
import type { Train } from "../../../src/sim/trains/types";
import type { Station } from "../../../src/sim/stations/types";
import { lineWithStops } from "../trains/middleStop.test";

describe("the waiting cap", () => {
  it("is MAX_WAIT_DAYS of demand while a train serves the pair", () => {
    // 300 a month = 10 a day
    expect(waitingCap(300, true)).toBeCloseTo(10 * MAX_WAIT_DAYS, 9);
  });

  it("is zero with no service", () => {
    expect(waitingCap(300, false)).toBe(0);
    expect(waitingCap(0, true)).toBe(0);
    expect(serviceIntervalDays(undefined)).toBeUndefined();
    expect(serviceIntervalDays(0)).toBeUndefined();
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

  it("a laid-up train gives no service (Phase 67)", () => {
    const { state, stationIds } = lineWithStops(3, 12, 1860);
    for (const s of state.stations) s.hasEngineShed = true;
    const [a, b] = stationIds;
    expect(buyTrain(state, a!, "american-4-4-0", ["passengers"]).ok).toBe(true);
    const t = state.trains[state.trains.length - 1] as Train;
    setOrders(state, t.id, [
      { stationId: a!, rule: "auto" },
      { stationId: b!, rule: "auto" },
    ]);
    expect(serviceRates(state).get(serviceKey(a!, b!))).toBeGreaterThan(0);
    t.laidUp = true;
    expect(serviceRates(state).get(serviceKey(a!, b!))).toBeUndefined();
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
    expect(waiting).toBeLessThanOrEqual((eco?.supply.passengers ?? 0) + 1e-9); // at most a month of people
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
    // b's one pile has people waiting; the ones this train takes ride on to c
    state.stationCargo.set(b!.id, {
      passengers: { amount: 200, waitingDays: 5 },
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

describe("people wait for the actual next train (Phase 53C)", () => {
  /** A two-stop passenger line with a train; accrual only (the train never moves). */
  const served = () => {
    const { state, stationIds } = lineWithStops(3, 12, 1860);
    for (const s of state.stations) s.hasEngineShed = true;
    const [a, b] = stationIds;
    expect(buyTrain(state, a!, "american-4-4-0", ["passengers"]).ok).toBe(true);
    const t = state.trains[state.trains.length - 1] as Train;
    setOrders(
      state,
      t.id,
      [a!, b!].map((id) => ({ stationId: id, rule: "auto" as const })),
    );
    return { state, a: a!, b: b! };
  };
  const lostAt = (state: ReturnType<typeof served>["state"], id: number): number => {
    const f = state.stationFlow.get(id);
    return (f?.month.passengers?.lostUnits ?? 0) + (f?.lastMonth.passengers?.lostUnits ?? 0);
  };

  it("a gap shorter than MAX_WAIT_DAYS loses no one", () => {
    const { state, a } = served();
    for (let day = 0; day < MAX_WAIT_DAYS - 1; day++) accrueDailyCargo(state);
    expect(state.stationCargo.get(a)?.passengers?.amount).toBeGreaterThan(0);
    expect(lostAt(state, a)).toBe(0);
  });

  it("a long gap loses only the part above MAX_WAIT_DAYS of demand", () => {
    const { state, a } = served();
    const gap = 3 * MAX_WAIT_DAYS;
    for (let day = 0; day < gap; day++) accrueDailyCargo(state);
    const perDay = (state.stationEconomy.get(a)?.passengerPool ?? 0) / 30;
    expect(perDay).toBeGreaterThan(0);
    const pile = state.stationCargo.get(a)?.passengers?.amount ?? 0;
    expect(pile).toBeCloseTo(perDay * MAX_WAIT_DAYS, 6);
    // the loss is exactly the days above the ceiling
    expect(lostAt(state, a)).toBeGreaterThanOrEqual(perDay * (gap - MAX_WAIT_DAYS) - 1e-6);
  });

  it("what a train cannot take stays, and the pile refills from there", () => {
    const { state, a } = served();
    for (let day = 0; day < 20; day++) accrueDailyCargo(state);
    const pile = (): number => state.stationCargo.get(a)?.passengers?.amount ?? 0;
    const before = pile();
    state.stationCargo.get(a)!.passengers!.amount -= before / 2; // a train took half
    for (let day = 0; day < 5; day++) accrueDailyCargo(state);
    const perDay = (state.stationEconomy.get(a)?.passengerPool ?? 0) / 30;
    expect(pile()).toBeCloseTo(before / 2 + 5 * perDay, 6);
  });

  it("the observed gap is the smoothed time between departures", () => {
    const { state, a, b } = served();
    state.ticks = 24;
    stampDeparture(state, a, [b]);
    expect(state.departures.get(serviceKey(a, b))?.gapDays).toBeUndefined();
    state.ticks += 24 * 10;
    stampDeparture(state, a, [b]);
    expect(state.departures.get(serviceKey(a, b))?.gapDays).toBeCloseTo(10, 9);
    state.ticks += 24 * 2;
    stampDeparture(state, a, [b]);
    expect(state.departures.get(serviceKey(a, b))?.gapDays).toBeCloseTo(8, 9); // 10 + (2 - 10) / 4
    const rates = serviceRates(state);
    expect(observedIntervalDays(state, rates, a, b)).toBeCloseTo(8, 9);
  });
});

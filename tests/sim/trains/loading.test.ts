import { describe, expect, it } from "vitest";
import { buildStation, buildTrack, buyTrain, setOrders } from "../../../src/sim/commands";
import { computeRevenue, stepLoading } from "../../../src/sim/trains/loading";
import { CARGO } from "../../../src/data/cargo";
import { DIFFICULTY, eraInflation } from "../../../src/data/finance";
import { makeTestMap, makeTestState, tileAt } from "../track/helpers";
import type { GameState } from "../../../src/sim/state";
import type { Station } from "../../../src/sim/stations/types";

const LOCO = "american-4-4-0"; // available from 1848, plenty of cars

function twoStationLine(distanceTiles: number): { state: GameState; a: Station; b: Station } {
  const width = distanceTiles + 1;
  const map = makeTestMap([Array.from({ length: width }, () => "p").join("")]);
  const state = makeTestState(map);
  state.startYear = 1848;
  const path = Array.from({ length: width }, (_, x) => tileAt(map, x, 0));
  expect(buildTrack(state, path).ok).toBe(true);
  expect(buildStation(state, tileAt(map, 0, 0), "depot").ok).toBe(true);
  expect(buildStation(state, tileAt(map, width - 1, 0), "depot").ok).toBe(true);
  const a = state.stations[0] as Station;
  const b = state.stations[1] as Station;
  return { state, a, b };
}

function setAccepts(state: GameState, stationId: number, cargos: string[]): void {
  const economy = state.stationEconomy.get(stationId);
  if (economy) economy.accepts = cargos as never[];
}

function runToDeparture(state: GameState, train: { id: number }, station: Station): void {
  const t = state.trains.find((tr) => tr.id === train.id);
  if (!t) throw new Error("train not found");
  for (let i = 0; i < 1000; i++) {
    if (stepLoading(state, t, station)) return;
  }
  throw new Error("stepLoading never finished");
}

describe("computeRevenue", () => {
  const cases: Array<{
    cargo: keyof typeof CARGO;
    distanceTiles: number;
    days: number;
    expected: number;
  }> = [
    // coal: urgency 2.5, baseRate 1200, decayDays 30. expected = (8/2)*2.5+2 = 12 days exactly.
    { cargo: "coal", distanceTiles: 8, days: 6, expected: 1200 * 0.8 * (1 + 0.25 * (1 - 6 / 12)) },
    { cargo: "coal", distanceTiles: 8, days: 12, expected: 1200 * 0.8 * 1.0 },
    { cargo: "coal", distanceTiles: 8, days: 42, expected: 1200 * 0.8 * (1 - (42 - 12) / 60) },
    // Very late: time factor floors at 0.2.
    { cargo: "coal", distanceTiles: 8, days: 500, expected: 1200 * 0.8 * 0.2 },
    // Passengers: urgency 1.0. expected = (20/2)*1+2 = 12 days.
    { cargo: "passengers", distanceTiles: 20, days: 12, expected: 3000 * 2 * 1.0 },
  ];

  for (const c of cases) {
    it(`${c.cargo} @ ${c.distanceTiles} tiles, ${c.days} days`, () => {
      const map = makeTestMap(["p"]);
      const state = makeTestState(map);
      state.startYear = 1830; // eraInflation(1830) = 1.0, revenueMult (normal) = 1.0
      const revenue = computeRevenue(state, c.cargo, c.distanceTiles, c.days);
      expect(revenue).toBeCloseTo(c.expected, 6);
    });
  }

  it("scales with era inflation and difficulty revenue multiplier", () => {
    const map = makeTestMap(["p"]);
    const state = makeTestState(map, { difficulty: "hard" });
    state.startYear = 1830;
    state.ticks = (1950 - 1830) * 360 * 24; // ~1950
    const revenue = computeRevenue(state, "coal", 8, 12);
    const expected = 1200 * 0.8 * 1.0 * eraInflation(1950) * DIFFICULTY.hard.revenueMult;
    expect(revenue).toBeCloseTo(expected, 0);
  });
});

describe("stepLoading", () => {
  it("unloads an accepted cargo, pays revenue, and clears the car", () => {
    const { state, a, b } = twoStationLine(10);
    setAccepts(state, b.id, ["coal"]);
    const bought = buyTrain(state, a.id, LOCO, ["coal"]);
    expect(bought.ok).toBe(true);
    const train = state.trains[0];
    if (!train) throw new Error("no train");
    const car = train.cars[0];
    if (!car) throw new Error("no car");
    car.loaded = true;
    car.loadedTile = a.tile;
    car.loadedTick = state.ticks;
    state.ticks += 5 * 24; // 5 in-game days in transit

    setOrders(state, train.id, [
      { stationId: a.id, rule: "auto" },
      { stationId: b.id, rule: "auto" },
    ]);
    train.currentOrderIndex = 1; // arriving at b

    runToDeparture(state, train, b);

    expect(car.loaded).toBe(false);
    expect(state.pendingDeliveries).toHaveLength(1);
    expect(state.pendingDeliveries[0]?.cargoType).toBe("coal");
    expect(state.pendingDeliveries[0]?.revenue).toBeGreaterThan(0);
  });

  it("pays nothing for a delivery under the minimum distance, but still unloads it", () => {
    const { state, a, b } = twoStationLine(2); // 2 tiles < MIN_REVENUE_DISTANCE_TILES (3)
    setAccepts(state, b.id, ["coal"]);
    const bought = buyTrain(state, a.id, LOCO, ["coal"]);
    const train = state.trains[0];
    if (!bought.ok || !train) throw new Error("setup failed");
    const car = train.cars[0];
    if (!car) throw new Error("no car");
    car.loaded = true;
    car.loadedTile = a.tile;
    car.loadedTick = state.ticks;

    setOrders(state, train.id, [
      { stationId: a.id, rule: "auto" },
      { stationId: b.id, rule: "auto" },
    ]);
    train.currentOrderIndex = 1;

    runToDeparture(state, train, b);

    expect(car.loaded).toBe(false);
    expect(state.pendingDeliveries).toHaveLength(0);
  });

  it("leaves cargo on the train when the arrival station doesn't accept it", () => {
    const { state, a, b } = twoStationLine(10);
    // b accepts nothing (default).
    const bought = buyTrain(state, a.id, LOCO, ["coal"]);
    const train = state.trains[0];
    if (!bought.ok || !train) throw new Error("setup failed");
    const car = train.cars[0];
    if (!car) throw new Error("no car");
    car.loaded = true;
    car.loadedTile = a.tile;
    car.loadedTick = state.ticks;

    setOrders(state, train.id, [
      { stationId: a.id, rule: "auto" },
      { stationId: b.id, rule: "auto" },
    ]);
    train.currentOrderIndex = 1;

    runToDeparture(state, train, b);

    expect(car.loaded).toBe(true);
    expect(state.pendingDeliveries).toHaveLength(0);
  });

  it("'auto' loads an empty car from the station's waiting pile when a later stop accepts it", () => {
    const { state, a, b } = twoStationLine(10);
    setAccepts(state, b.id, ["coal"]);
    state.stationCargo.set(a.id, { coal: { amount: 25, waitingDays: 3 } });
    const bought = buyTrain(state, a.id, LOCO, ["coal"]);
    const train = state.trains[0];
    if (!bought.ok || !train) throw new Error("setup failed");

    setOrders(state, train.id, [
      { stationId: a.id, rule: "auto" },
      { stationId: b.id, rule: "auto" },
    ]);
    train.currentOrderIndex = 0; // sitting at a, about to load

    runToDeparture(state, train, a);

    const car = train.cars[0];
    expect(car?.loaded).toBe(true);
    expect(car?.loadedTile).toBe(a.tile);
    expect(state.stationCargo.get(a.id)?.coal?.amount).toBe(5); // 25 - CARLOAD_UNITS(20)
  });

  it("'unloadOnly' never loads, even with supply and a willing later stop", () => {
    const { state, a, b } = twoStationLine(10);
    setAccepts(state, b.id, ["coal"]);
    state.stationCargo.set(a.id, { coal: { amount: 25, waitingDays: 3 } });
    const bought = buyTrain(state, a.id, LOCO, ["coal"]);
    const train = state.trains[0];
    if (!bought.ok || !train) throw new Error("setup failed");

    setOrders(state, train.id, [
      { stationId: a.id, rule: "unloadOnly" },
      { stationId: b.id, rule: "auto" },
    ]);
    train.currentOrderIndex = 0;

    runToDeparture(state, train, a);

    expect(train.cars[0]?.loaded).toBe(false);
    expect(state.stationCargo.get(a.id)?.coal?.amount).toBe(25); // untouched
  });

  it("'passThrough' departs immediately without touching any car", () => {
    const { state, a, b } = twoStationLine(10);
    setAccepts(state, b.id, ["coal"]);
    const bought = buyTrain(state, a.id, LOCO, ["coal"]);
    const train = state.trains[0];
    if (!bought.ok || !train) throw new Error("setup failed");
    const car = train.cars[0];
    if (!car) throw new Error("no car");
    car.loaded = true;
    car.loadedTile = a.tile;
    car.loadedTick = state.ticks;

    setOrders(state, train.id, [
      { stationId: a.id, rule: "auto" },
      { stationId: b.id, rule: "passThrough" },
    ]);
    train.currentOrderIndex = 1;

    expect(stepLoading(state, train, b)).toBe(true);
    expect(car.loaded).toBe(true);
    expect(state.pendingDeliveries).toHaveLength(0);
  });

  it("'fullLoad' waits extra days for more supply, then departs at maxWaitDays regardless", () => {
    const { state, a, b } = twoStationLine(10);
    setAccepts(state, b.id, ["coal"]);
    state.stationCargo.set(a.id, { coal: { amount: 20, waitingDays: 3 } }); // enough for 1 of 2 cars
    const bought = buyTrain(state, a.id, LOCO, ["coal", "coal"]);
    const train = state.trains[0];
    if (!bought.ok || !train) throw new Error("setup failed");

    setOrders(state, train.id, [
      { stationId: a.id, rule: "fullLoad", maxWaitDays: 2 },
      { stationId: b.id, rule: "auto" },
    ]);
    train.currentOrderIndex = 0;

    let ticks = 0;
    while (!stepLoading(state, train, a)) {
      ticks++;
      if (ticks > 10_000) throw new Error("never departed");
    }

    // One car loaded (the only supply available), the other stayed empty — departed anyway once
    // maxWaitDays was reached rather than waiting forever.
    expect(train.cars.filter((c) => c.loaded)).toHaveLength(1);
    expect(ticks).toBeGreaterThan(24); // it did wait at least a day past the initial batch
  });
});

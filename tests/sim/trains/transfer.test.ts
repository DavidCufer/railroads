/** PLAN Phase 18 C: a Warehouse station is a transfer hub — feeder trains drop cargo there without
 * being paid, other trains pick it up, and the final delivery pays for the whole trip. */
import { describe, expect, it } from "vitest";
import { buildStation, buildTrack, buyTrain, setOrders } from "../../../src/sim/commands";
import { CARGO } from "../../../src/data/cargo";
import { accrueDailyCargo } from "../../../src/sim/economy/cargoFlow";
import { stationStorageCap } from "../../../src/sim/stations/improvements";
import { computeRevenue, stepLoading } from "../../../src/sim/trains/loading";
import type { GameState } from "../../../src/sim/state";
import type { Station } from "../../../src/sim/stations/types";
import type { LoadingRule, Train } from "../../../src/sim/trains/types";
import { makeTestMap, makeTestState, tileAt } from "../track/helpers";

const LOCO = "american-4-4-0";
const LENGTH = 21; // A at x=0, hub at x=10, B at x=20

function world(warehouse = true): { state: GameState; a: Station; h: Station; b: Station } {
  const map = makeTestMap([Array.from({ length: LENGTH }, () => "p").join("")]);
  const state = makeTestState(map, { startYear: 1848 });
  const path = Array.from({ length: LENGTH }, (_, x) => tileAt(map, x, 0));
  expect(buildTrack(state, path).ok).toBe(true);
  for (const x of [0, 10, 20])
    expect(buildStation(state, tileAt(map, x, 0), "depot").ok).toBe(true);
  const [a, h, b] = state.stations as [Station, Station, Station];
  if (warehouse) h.improvements.push("warehouse");
  const econ = (id: number, accepts: string[]): void => {
    const e = state.stationEconomy.get(id);
    if (e) e.accepts = accepts as never[];
  };
  econ(a.id, []);
  econ(h.id, []);
  econ(b.id, ["coal"]);
  return { state, a, h, b };
}

function trainAt(
  state: GameState,
  at: Station,
  orders: Array<{ station: Station; rule: LoadingRule }>,
): Train {
  expect(buyTrain(state, state.stations[0]!.id, LOCO, ["coal"]).ok).toBe(true);
  const train = state.trains[state.trains.length - 1] as Train;
  setOrders(
    state,
    train.id,
    orders.map((o) => ({ stationId: o.station.id, rule: o.rule })),
  );
  train.route = [at.tile];
  train.routeIndex = 0;
  train.status = "loading";
  train.loadTicksLeft = -1;
  return train;
}

function loadCar(train: Train, units: number, originTile: number, tick: number): void {
  const car = train.cars[0]!;
  car.loadedUnits = units;
  car.loadedTile = originTile;
  car.loadedTick = tick;
}

function depart(state: GameState, train: Train, station: Station): void {
  for (let i = 0; i < 1000; i++) if (stepLoading(state, train, station)) return;
  throw new Error("never finished");
}

describe("warehouse transfer hub", () => {
  it("feeder drops coal at the hub: stock keeps its origin, no money, 'Transferred' event", () => {
    const { state, a, h } = world();
    const feeder = trainAt(state, h, [
      { station: h, rule: "transfer" },
      { station: a, rule: "auto" },
    ]);
    loadCar(feeder, 20, a.tile, 0);
    const cash = state.cash;
    state.ticks = 24 * 3;
    depart(state, feeder, h);
    expect(feeder.cars[0]!.loadedUnits).toBe(0);
    expect(state.stationTransfer.get(h.id)).toEqual([
      expect.objectContaining({
        cargoType: "coal",
        units: 20,
        originTile: a.tile,
        loadedTick: 0,
        originStationId: a.id,
      }),
    ]);
    expect(state.cash).toBe(cash);
    expect(feeder.lifetimeRevenue).toBe(0);
    expect(state.pendingDeliveries).toEqual([
      expect.objectContaining({ transferred: true, revenue: 0, units: 20 }),
    ]);
  });

  it("'auto' at a hub also takes cargo neither the hub nor any later stop demands", () => {
    const { state, a, h } = world();
    const feeder = trainAt(state, h, [
      { station: h, rule: "auto" },
      { station: a, rule: "auto" },
    ]);
    loadCar(feeder, 20, a.tile, 0);
    depart(state, feeder, h);
    expect(state.stationTransfer.get(h.id)?.[0]?.units).toBe(20);
  });

  it("but keeps cargo aboard when a later stop of the same train demands it", () => {
    const { state, a, h, b } = world();
    const through = trainAt(state, h, [
      { station: h, rule: "auto" },
      { station: b, rule: "auto" },
    ]);
    loadCar(through, 20, a.tile, 0);
    depart(state, through, h);
    expect(through.cars[0]!.loadedUnits).toBe(20);
    expect(state.stationTransfer.size).toBe(0);
  });

  it("without a Warehouse nothing is transferred", () => {
    const { state, a, h } = world(false);
    const feeder = trainAt(state, h, [
      { station: h, rule: "transfer" },
      { station: a, rule: "auto" },
    ]);
    loadCar(feeder, 20, a.tile, 0);
    depart(state, feeder, h);
    expect(feeder.cars[0]!.loadedUnits).toBe(20);
    expect(state.stationTransfer.size).toBe(0);
  });

  it("relay A → hub → B pays once, at B, for the A → B distance and total elapsed time", () => {
    const { state, a, h, b } = world();
    const feeder = trainAt(state, h, [
      { station: h, rule: "transfer" },
      { station: a, rule: "auto" },
    ]);
    loadCar(feeder, 20, a.tile, 0);
    state.ticks = 24 * 2;
    depart(state, feeder, h);

    const carrier = trainAt(state, h, [
      { station: h, rule: "auto" },
      { station: b, rule: "auto" },
    ]);
    state.ticks = 24 * 4;
    depart(state, carrier, h);
    const car = carrier.cars[0]!;
    expect(car.loadedUnits).toBe(20);
    expect(car.loadedTile).toBe(a.tile);
    expect(car.loadedTick).toBe(0);
    expect(state.stationTransfer.size).toBe(0);
    expect(carrier.lifetimeRevenue).toBe(0);

    // Deliver at B ten days after the original pickup.
    carrier.route = [b.tile];
    carrier.routeIndex = 0;
    carrier.currentOrderIndex = 1;
    carrier.loadTicksLeft = -1;
    state.ticks = 24 * 10;
    const cash = state.cash;
    depart(state, carrier, b);
    const expected = computeRevenue(state, "coal", 20, 10) * (20 / CARGO.coal.capacity);
    expect(expected).toBeGreaterThan(
      computeRevenue(state, "coal", 10, 10) * (20 / CARGO.coal.capacity),
    );
    expect(carrier.lifetimeRevenue).toBeCloseTo(expected, 6);
    expect(state.cash - cash).toBeCloseTo(expected, 6);
    expect(feeder.lifetimeRevenue).toBe(0);
  });

  it("a feeder loads cargo bound for a transfer stop even though nothing there demands it", () => {
    const { state, a, h } = world();
    state.stationCargo.set(a.id, { coal: { amount: 20, waitingDays: 0 } });
    const feeder = trainAt(state, a, [
      { station: a, rule: "auto" },
      { station: h, rule: "transfer" },
    ]);
    depart(state, feeder, a);
    expect(feeder.cars[0]!.loadedUnits).toBe(20);
    expect(feeder.cars[0]!.loadedTile).toBe(a.tile);
  });

  it("a feeder never reloads its own drop", () => {
    const { state, a, h } = world();
    state.stationEconomy.get(a.id)!.accepts = ["coal"]; // so 'acceptedAtAnotherStop' would be true
    const feeder = trainAt(state, h, [
      { station: h, rule: "transfer" },
      { station: a, rule: "auto" },
    ]);
    loadCar(feeder, 20, a.tile, 0);
    depart(state, feeder, h);
    expect(feeder.cars[0]!.loadedUnits).toBe(0);
    expect(state.stationTransfer.get(h.id)?.[0]?.units).toBe(20);
  });

  it("respects the warehouse capacity: overflow stays on the train", () => {
    const { state, a, h } = world();
    const cap = stationStorageCap(h, "coal");
    state.stationTransfer.set(h.id, [
      {
        cargoType: "coal",
        units: cap - 5,
        originTile: a.tile,
        loadedTick: 0,
        depositedByTrainId: 99,
      },
    ]);
    const feeder = trainAt(state, h, [
      { station: h, rule: "transfer" },
      { station: a, rule: "auto" },
    ]);
    loadCar(feeder, 20, a.tile, 0);
    depart(state, feeder, h);
    const total = state.stationTransfer.get(h.id)!.reduce((s, l) => s + l.units, 0);
    expect(total).toBeCloseTo(cap, 6);
    expect(feeder.cars[0]!.loadedUnits).toBeCloseTo(15, 6);
  });

  it("transfer stock does not decay at a warehouse", () => {
    const { state, a, h } = world();
    state.stationTransfer.set(h.id, [
      { cargoType: "coal", units: 40, originTile: a.tile, loadedTick: 0, depositedByTrainId: 1 },
    ]);
    for (let d = 0; d < 400; d++) accrueDailyCargo(state);
    expect(state.stationTransfer.get(h.id)![0]!.units).toBe(40);
  });
});

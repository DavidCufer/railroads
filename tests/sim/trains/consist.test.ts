/**
 * PLAN Phase 15: "Edit consist on an existing train" (`editConsist`/`computeEditConsistPlan` in
 * src/sim/commands.ts). Cars that persist (matched by cargo type, in order) keep their existing
 * load; a genuinely new car is charged full price; a removed car refunds
 * `CONSIST_EDIT_REFUND_FRACTION` and drops any cargo it was carrying.
 */
import { describe, expect, it } from "vitest";
import {
  buildStation,
  buildTrack,
  buyTrain,
  computeEditConsistPlan,
  editConsist,
  setOrders,
} from "../../../src/sim/commands";
import { CONSIST_EDIT_REFUND_FRACTION } from "../../../src/data/trains";
import { CARGO } from "../../../src/data/cargo";
import { stepLoading } from "../../../src/sim/trains/loading";
import { stepTrains } from "../../../src/sim/trains";
import { makeTestMap, makeTestState, tileAt } from "../track/helpers";
import type { GameState } from "../../../src/sim/state";
import type { Station } from "../../../src/sim/stations/types";
import type { Train } from "../../../src/sim/trains/types";

const LOCO = "grasshopper-0-4-0"; // available from 1830, max 3 cars

function twoStationLine(distanceTiles: number): { state: GameState; a: Station; b: Station } {
  const width = distanceTiles + 1;
  const map = makeTestMap([Array.from({ length: width }, () => "p").join("")]);
  const state = makeTestState(map);
  const path = Array.from({ length: width }, (_, x) => tileAt(map, x, 0));
  expect(buildTrack(state, path).ok).toBe(true);
  expect(buildStation(state, tileAt(map, 0, 0), "depot").ok).toBe(true);
  expect(buildStation(state, tileAt(map, width - 1, 0), "depot").ok).toBe(true);
  return { state, a: state.stations[0] as Station, b: state.stations[1] as Station };
}

function setAccepts(state: GameState, stationId: number, cargos: string[]): void {
  const economy = state.stationEconomy.get(stationId);
  if (economy) economy.accepts = cargos as never[];
}

function trainOf(state: GameState, id: number): Train {
  const train = state.trains.find((t) => t.id === id);
  if (!train) throw new Error("unreachable: train not found");
  return train;
}

describe("computeEditConsistPlan", () => {
  it("charges full price for a genuinely added car and nothing for cars that persist", () => {
    const { state, a } = twoStationLine(5);
    const bought = buyTrain(state, a.id, LOCO, ["coal", "coal"]);
    expect(bought.ok).toBe(true);
    const train = state.trains[0] as Train;

    const plan = computeEditConsistPlan(state, train.id, ["coal", "coal", "grain"]);
    expect(plan.valid).toBe(true);
    // Only "grain" is new — the two "coal" cars match the existing ones and are free.
    expect(plan.addedCost).toBeCloseTo(CARGO.grain.carCost, 6);
    expect(plan.refund).toBe(0);
    expect(plan.netCost).toBeCloseTo(CARGO.grain.carCost, 6);
  });

  it("refunds 50% for a removed car and nothing for one that persists", () => {
    const { state, a } = twoStationLine(5);
    const bought = buyTrain(state, a.id, LOCO, ["coal", "grain"]);
    expect(bought.ok).toBe(true);
    const train = state.trains[0] as Train;

    const plan = computeEditConsistPlan(state, train.id, ["coal"]);
    expect(plan.valid).toBe(true);
    expect(plan.addedCost).toBe(0);
    expect(plan.refund).toBeCloseTo(CARGO.grain.carCost * CONSIST_EDIT_REFUND_FRACTION, 6);
    expect(plan.netCost).toBeCloseTo(-plan.refund, 6);
  });

  it("rejects more cars than the locomotive's max", () => {
    const { state, a } = twoStationLine(5);
    const bought = buyTrain(state, a.id, LOCO, []);
    expect(bought.ok).toBe(true);
    const train = state.trains[0] as Train;

    const plan = computeEditConsistPlan(state, train.id, ["coal", "coal", "coal", "coal"]);
    expect(plan.valid).toBe(false);
  });

  it("rejects a cargo type not available yet in the current era", () => {
    const { state, a } = twoStationLine(5);
    state.startYear = 1830; // oil is era 1860
    const bought = buyTrain(state, a.id, LOCO, []);
    expect(bought.ok).toBe(true);
    const train = state.trains[0] as Train;

    const plan = computeEditConsistPlan(state, train.id, ["oil"]);
    expect(plan.valid).toBe(false);
  });
});

describe("editConsist — applied immediately at a station", () => {
  it("swaps the consist right away, keeping the matched car's load, and charges cash now", () => {
    const { state, a } = twoStationLine(5);
    const bought = buyTrain(state, a.id, LOCO, ["coal", "grain"]);
    expect(bought.ok).toBe(true);
    const train = state.trains[0] as Train;
    train.cars[0]!.loaded = true;
    train.cars[0]!.loadedTile = a.tile;
    train.cars[0]!.loadedTick = 0;
    expect(train.status).toBe("loading");
    const cashBefore = state.cash;

    const result = editConsist(state, train.id, ["coal", "coal"]);
    expect(result.ok).toBe(true);

    expect(train.cars.map((c) => c.cargoType)).toEqual(["coal", "coal"]);
    // The first "coal" car matched the existing loaded one and kept its load...
    expect(train.cars[0]!.loaded).toBe(true);
    // ...while the second is a brand new, empty car (grain's slot was reused for it positionally,
    // but it's charged as new since nothing of type "coal" was left over to match).
    expect(train.cars[1]!.loaded).toBe(false);
    expect(train.pendingConsist).toBeUndefined();

    const plan = { addedCost: CARGO.coal.carCost, refund: CARGO.grain.carCost * 0.5 };
    expect(state.cash).toBeCloseTo(cashBefore - (plan.addedCost - plan.refund), 6);
  });

  it("drops a removed car's cargo for revenue when the current station accepts it", () => {
    const { state, a } = twoStationLine(20);
    setAccepts(state, a.id, ["coal"]);
    const bought = buyTrain(state, a.id, LOCO, ["coal"]);
    expect(bought.ok).toBe(true);
    const train = state.trains[0] as Train;
    train.cars[0]!.loaded = true;
    train.cars[0]!.loadedTile = state.stations[1]!.tile; // "loaded" far away, so it's worth real revenue
    train.cars[0]!.loadedTick = 0;
    state.ticks = 24; // one day later
    const cashBefore = state.cash;

    const result = editConsist(state, train.id, []);
    expect(result.ok).toBe(true);
    expect(state.cash).toBeGreaterThan(cashBefore); // refund + delivery revenue, net positive
    expect(state.pendingDeliveries.length).toBe(1);
  });

  it("wastes a removed car's cargo (no revenue) when the current station doesn't accept it", () => {
    const { state, a } = twoStationLine(20);
    setAccepts(state, a.id, []);
    const bought = buyTrain(state, a.id, LOCO, ["coal"]);
    expect(bought.ok).toBe(true);
    const train = state.trains[0] as Train;
    train.cars[0]!.loaded = true;
    train.cars[0]!.loadedTile = state.stations[1]!.tile;
    train.cars[0]!.loadedTick = 0;
    state.ticks = 24;

    const result = editConsist(state, train.id, []);
    expect(result.ok).toBe(true);
    expect(state.pendingDeliveries.length).toBe(0);
  });
});

describe("editConsist — queued while not at a station", () => {
  it("doesn't touch cars right away, then applies at the next stop", () => {
    const { state, a, b } = twoStationLine(10);
    const bought = buyTrain(state, a.id, LOCO, ["coal"]);
    expect(bought.ok).toBe(true);
    const train = trainOf(state, (state.trains[0] as Train).id);
    expect(
      setOrders(state, train.id, [
        { stationId: a.id, rule: "passThrough" },
        { stationId: b.id, rule: "passThrough" },
      ]).ok,
    ).toBe(true);

    // Run until it's actually left the station.
    for (let i = 0; i < 100 && train.status === "loading"; i++) stepTrains(state);
    expect(train.status).not.toBe("loading");
    const originalCars = train.cars.map((c) => c.cargoType);

    const result = editConsist(state, train.id, ["grain", "grain"]);
    expect(result.ok).toBe(true);
    expect(train.cars.map((c) => c.cargoType)).toEqual(originalCars); // unchanged for now
    expect(train.pendingConsist).toBeDefined();

    for (let i = 0; i < 2_000 && train.status !== "loading"; i++) stepTrains(state);
    expect(train.status).toBe("loading");
    expect(train.cars.map((c) => c.cargoType)).toEqual(["grain", "grain"]);
    expect(train.pendingConsist).toBeUndefined();
  });
});

describe("stepLoading sanity (unaffected by editConsist)", () => {
  it("still resolves a plain stop normally", () => {
    const { state, a } = twoStationLine(5);
    const bought = buyTrain(state, a.id, LOCO, []);
    expect(bought.ok).toBe(true);
    const train = state.trains[0] as Train;
    expect(
      setOrders(state, train.id, [
        { stationId: a.id, rule: "passThrough" },
        { stationId: state.stations[1]!.id, rule: "passThrough" },
      ]).ok,
    ).toBe(true);
    let done = false;
    for (let i = 0; i < 100 && !done; i++) done = stepLoading(state, train, a);
    expect(done).toBe(true);
  });
});

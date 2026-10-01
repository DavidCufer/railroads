import { describe, expect, it } from "vitest";
import { buildStation, buildTrack, buyTrain, setOrders } from "../../../src/sim/commands";
import { computeRevenue, stepLoading } from "../../../src/sim/trains/loading";
import { CARGO } from "../../../src/data/cargo";
import { KM_PER_TILE, WORLD_SCALE } from "../../../src/data/scale";
import { DIFFICULTY } from "../../../src/data/finance";
import { competitionLoss, fareIndex } from "../../../src/data/economy";
import { makeTestMap, makeTestState, tileAt } from "../track/helpers";
import type { GameState } from "../../../src/sim/state";
import type { Station } from "../../../src/sim/stations/types";

/** The 1830 fare level (Economic model v2: rail is a premium novelty, freight competes with the wagon). */
const F = (cargo: keyof typeof CARGO): number => fareIndex(1830, cargo);

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
    // Distances are the pre-Phase-23 tile counts × WORLD_SCALE (same km).
    // coal: urgency 2.5, baseRate 1200, decayDays 30. expected = (8/2)*2.5+2 = 12 days exactly.
    {
      cargo: "coal",
      distanceTiles: 8 * WORLD_SCALE,
      days: 6,
      expected: 1200 * 0.8 * (1 + 0.25 * (1 - 6 / 12)) * F("coal"),
    },
    {
      cargo: "coal",
      distanceTiles: 8 * WORLD_SCALE,
      days: 12,
      expected: 1200 * 0.8 * 1.0 * F("coal"),
    },
    {
      cargo: "coal",
      distanceTiles: 8 * WORLD_SCALE,
      days: 42,
      expected: 1200 * 0.8 * (1 - (42 - 12) / 60) * F("coal"),
    },
    // Very late: time factor floors at 0.2.
    {
      cargo: "coal",
      distanceTiles: 8 * WORLD_SCALE,
      days: 500,
      expected: 1200 * 0.8 * 0.2 * F("coal"),
    },
    // Passengers: urgency 1.0. expected = (20/2)*1+2 = 12 days.
    // (× the 1830 fare level.)
    {
      cargo: "passengers",
      distanceTiles: 20 * WORLD_SCALE,
      days: 12,
      expected: 1650 * 2 * 1.0 * F("passengers"),
    },
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

  it("the same km route earns the same revenue as before the 5 km/tile conversion", () => {
    // Pre-Phase-23 formula on the old 10 km grid: base * (oldTiles / 10) with expected = oldTiles/2*urgency+2.
    const map = makeTestMap(["p"]);
    const state = makeTestState(map);
    state.startYear = 1830;
    const oldTiles = 12;
    const km = oldTiles * 10;
    for (const cargo of ["coal", "passengers", "mail"] as const) {
      for (const days of [3, 9, 30]) {
        const def = CARGO[cargo];
        const expected = (oldTiles / 2) * def.urgency + 2;
        const timeFactor =
          days <= expected
            ? 1 + 0.25 * (1 - days / expected)
            : Math.max(0.2, 1 - (days - expected) / (def.decayDays * 2));
        const before = def.baseRate * (oldTiles / 10) * timeFactor * F(cargo);
        expect(computeRevenue(state, cargo, km / KM_PER_TILE, days)).toBeCloseTo(before, 6);
      }
    }
  });

  it("scales with era inflation and difficulty revenue multiplier", () => {
    const map = makeTestMap(["p"]);
    const state = makeTestState(map, { difficulty: "hard" });
    state.startYear = 1830;
    state.ticks = (1950 - 1830) * 360 * 24; // ~1950
    const revenue = computeRevenue(state, "coal", 8 * WORLD_SCALE, 12);
    const loss = competitionLoss(1950, "coal", 8 * WORLD_SCALE * KM_PER_TILE, 0); // lorries take a little
    const expected =
      1200 * 0.8 * 1.0 * fareIndex(1950, "coal") * (1 - loss) * DIFFICULTY.hard.revenueMult;
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
    car.loadedUnits = CARGO.coal.capacity;
    car.loadedTile = a.tile;
    car.loadedTick = state.ticks;
    state.ticks += 5 * 24; // 5 in-game days in transit

    setOrders(state, train.id, [
      { stationId: a.id, rule: "auto" },
      { stationId: b.id, rule: "auto" },
    ]);
    train.currentOrderIndex = 1; // arriving at b

    runToDeparture(state, train, b);

    expect(car.loadedUnits).toBe(0);
    expect(state.pendingDeliveries).toHaveLength(1);
    expect(state.pendingDeliveries[0]?.cargoType).toBe("coal");
    expect(state.pendingDeliveries[0]?.revenue).toBeGreaterThan(0);
    expect(state.pendingDeliveries[0]?.units).toBe(CARGO.coal.capacity);
  });

  it("refills a car at the same stop where it was just unloaded (two-way mail shuttle regression)", () => {
    // Play-test report: mail from Trieste was delivered at Ljubljana, but Ljubljana's own waiting
    // mail was never picked up — the just-unloaded car was excluded from the load plan.
    const { state, a, b } = twoStationLine(10);
    setAccepts(state, a.id, ["mail"]);
    setAccepts(state, b.id, ["mail"]);
    expect(buyTrain(state, a.id, LOCO, ["mail"]).ok).toBe(true);
    const train = state.trains[0];
    if (!train) throw new Error("no train");
    const car = train.cars[0];
    if (!car) throw new Error("no car");
    car.loadedUnits = CARGO.mail.capacity;
    car.loadedTile = a.tile;
    car.loadedTick = state.ticks;
    state.ticks += 5 * 24;
    state.stationCargo.set(b.id, { mail: { amount: 9, waitingDays: 2 } });

    setOrders(state, train.id, [
      { stationId: a.id, rule: "auto" },
      { stationId: b.id, rule: "auto" },
    ]);
    train.currentOrderIndex = 1; // arriving at b

    runToDeparture(state, train, b);

    expect(state.pendingDeliveries).toHaveLength(1); // a's mail delivered at b
    expect(car.loadedUnits).toBe(9); // ...and b's waiting mail picked up for the trip back
    expect(car.loadedTile).toBe(b.tile);
    expect(state.stationCargo.get(b.id)?.mail?.amount).toBe(0);
  });

  it("pays nothing for a delivery under the minimum distance, but still unloads it", () => {
    const { state, a, b } = twoStationLine(2); // 2 tiles < MIN_REVENUE_DISTANCE_TILES (3)
    setAccepts(state, b.id, ["coal"]);
    const bought = buyTrain(state, a.id, LOCO, ["coal"]);
    const train = state.trains[0];
    if (!bought.ok || !train) throw new Error("setup failed");
    const car = train.cars[0];
    if (!car) throw new Error("no car");
    car.loadedUnits = CARGO.coal.capacity;
    car.loadedTile = a.tile;
    car.loadedTick = state.ticks;

    setOrders(state, train.id, [
      { stationId: a.id, rule: "auto" },
      { stationId: b.id, rule: "auto" },
    ]);
    train.currentOrderIndex = 1;

    runToDeparture(state, train, b);

    expect(car.loadedUnits).toBe(0);
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
    car.loadedUnits = CARGO.coal.capacity;
    car.loadedTile = a.tile;
    car.loadedTick = state.ticks;

    setOrders(state, train.id, [
      { stationId: a.id, rule: "auto" },
      { stationId: b.id, rule: "auto" },
    ]);
    train.currentOrderIndex = 1;

    runToDeparture(state, train, b);

    expect(car.loadedUnits).toBe(CARGO.coal.capacity);
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
    expect(car?.loadedUnits).toBe(CARGO.coal.capacity); // filled to capacity (20), 5 left waiting
    expect(car?.loadedTile).toBe(a.tile);
    expect(state.stationCargo.get(a.id)?.coal?.amount).toBe(5); // 25 - 20 (coal's capacity)
  });

  it("'auto' loads a partial car when supply is short of a full carload (PLAN Phase 16)", () => {
    // The play-test bug this fixes: a small town's trickle of supply (well under a full carload)
    // never accumulated enough for the old "only load a full carload" rule, so passenger cars
    // always left empty (PROGRESS.md's Phase 16 entry). Auto should now take whatever's there.
    const { state, a, b } = twoStationLine(10);
    setAccepts(state, b.id, ["passengers"]);
    state.stationCargo.set(a.id, { passengers: { amount: 6, waitingDays: 3 } }); // well under 40/car
    const bought = buyTrain(state, a.id, LOCO, ["passengers"]);
    const train = state.trains[0];
    if (!bought.ok || !train) throw new Error("setup failed");

    setOrders(state, train.id, [
      { stationId: a.id, rule: "auto" },
      { stationId: b.id, rule: "auto" },
    ]);
    train.currentOrderIndex = 0;

    runToDeparture(state, train, a);

    const car = train.cars[0];
    expect(car?.loadedUnits).toBe(6);
    expect(car?.loadedUnits).toBeLessThan(CARGO.passengers.capacity);
    expect(car?.loadedTile).toBe(a.tile);
    expect(state.stationCargo.get(a.id)?.passengers?.amount).toBeCloseTo(0, 5);
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

    expect(train.cars[0]?.loadedUnits).toBe(0);
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
    car.loadedUnits = CARGO.coal.capacity;
    car.loadedTile = a.tile;
    car.loadedTick = state.ticks;

    setOrders(state, train.id, [
      { stationId: a.id, rule: "auto" },
      { stationId: b.id, rule: "passThrough" },
    ]);
    train.currentOrderIndex = 1;

    expect(stepLoading(state, train, b)).toBe(true);
    expect(car.loadedUnits).toBe(CARGO.coal.capacity);
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
    expect(train.cars.filter((c) => c.loadedUnits >= CARGO.coal.capacity)).toHaveLength(1);
    expect(train.cars.filter((c) => c.loadedUnits === 0)).toHaveLength(1);
    expect(ticks).toBeGreaterThan(24); // it did wait at least a day past the initial batch
  });
});

describe("Bug 1: 'fullLoad' keeps what it loaded", () => {
  it("does not unload cargo at the station it was loaded at on extra wait days", () => {
    const { state, a, b } = twoStationLine(10);
    setAccepts(state, a.id, ["passengers"]);
    setAccepts(state, b.id, ["passengers"]);
    state.stationCargo.set(a.id, {
      passengers: { amount: CARGO.passengers.capacity, waitingDays: 0 },
    });
    const bought = buyTrain(state, a.id, LOCO, ["passengers", "passengers", "passengers"]);
    const train = state.trains[0];
    if (!bought.ok || !train) throw new Error("setup failed");
    setOrders(state, train.id, [
      { stationId: a.id, rule: "fullLoad", maxWaitDays: 3 },
      { stationId: b.id, rule: "auto" },
    ]);
    train.currentOrderIndex = 0;
    let ticks = 0;
    while (!stepLoading(state, train, a)) {
      ticks++;
      state.stationCargo.get(a.id)!.passengers = {
        amount: CARGO.passengers.capacity,
        waitingDays: 0,
      };
      if (ticks > 10_000) throw new Error("never departed");
    }
    // The cars hold what was loaded; nothing was "delivered" back to the origin.
    const total = train.cars.reduce((n, c) => n + c.loadedUnits, 0);
    expect(total).toBe(3 * CARGO.passengers.capacity);
    expect(state.pendingDeliveries).toHaveLength(0);
  });
});

import { describe, expect, it } from "vitest";
import { CARGO } from "../../../src/data/cargo";
import { buildStation, buildTrack, buyTrain, setOrders } from "../../../src/sim/commands";
import { advanceOneHour } from "../../../src/sim/tick";
import { computeRevenue, dropCarCargo } from "../../../src/sim/trains/loading";
import { chainPayEstimate } from "../../../src/sim/economy/longHaulPay";
import type { GameState } from "../../../src/sim/state";
import { makeTestMap, makeTestState, tileAt } from "../track/helpers";

/** Mine - Smelter - Mint on a straight line of plains: stations at x = 0, 20 and 40. */
function world(cars: Array<"silverOre" | "silverBars">, at: 0 | 1 = 0) {
  const map = makeTestMap(["p".repeat(45), "p".repeat(45), "p".repeat(45)]);
  const state = makeTestState(map, { startYear: 1860, cash: 5e6 });
  const industries = [
    { id: 0, type: "silverMine", x: 0, y: 0 },
    { id: 1, type: "smelter", x: 20, y: 0 },
    { id: 2, type: "mint", x: 40, y: 0 },
  ] as const;
  for (const i of industries) {
    map.industryId[tileAt(map, i.x, i.y)] = i.id;
    state.industries.push({ ...i });
  }
  state.industryEconomy.set(0, { inputStock: {}, monthlyOutput: { silverOre: 80 } });
  state.industryEconomy.set(1, { inputStock: {}, monthlyOutput: {} });
  state.industryEconomy.set(2, { inputStock: {}, monthlyOutput: {} });
  buildTrack(
    state,
    Array.from({ length: 41 }, (_, x) => tileAt(map, x, 1)),
  );
  for (const x of [0, 20, 40]) buildStation(state, tileAt(map, x, 1), "depot");
  const [mine, plant, mint] = state.stations;
  mine!.hasEngineShed = true;
  expect(buyTrain(state, mine!.id, "american-4-4-0", cars).ok).toBe(true);
  const train = state.trains[0]!;
  setOrders(state, train.id, [
    { stationId: (at === 0 ? mine : plant)!.id, rule: "auto" },
    { stationId: (at === 0 ? plant : mint)!.id, rule: "auto" },
  ]);
  return { state, train, mine: mine!, plant: plant!, mint: mint! };
}

const dist = (s: GameState, a: number, b: number): number =>
  Math.hypot(
    (a % s.map.width) - (b % s.map.width),
    Math.floor(a / s.map.width) - Math.floor(b / s.map.width),
  );

describe("long-haul chain pays on final delivery only (Phase 40)", () => {
  it("pays nothing for ore at the smelter, which only learns the ore's origin", () => {
    const { state, train, mine, plant } = world(["silverOre"]);
    const car = train.cars[0]!;
    car.loadedUnits = 20;
    car.loadedTile = mine.tile;
    car.loadedTick = state.ticks;
    const cash = state.cash;
    dropCarCargo(state, train, plant, car);
    expect(state.cash).toBe(cash);
    expect(state.finance.thisYear.freight).toBe(0);
    expect(state.industryEconomy.get(1)!.inputStock.silverOre).toBe(20);
    expect(state.industryEconomy.get(1)!.oreOriginTile).toBe(mine.tile);
    expect(car.oreOriginTile).toBeUndefined();
  });

  it("pays bars by the distance from the ore's origin, not from the smelter", () => {
    const { state, train, mine, plant, mint } = world(["silverBars"], 1);
    const car = train.cars[0]!;
    const full = CARGO.silverBars.capacity;
    car.loadedUnits = full;
    car.loadedTile = plant.tile;
    car.loadedTick = state.ticks;
    car.oreOriginTile = mine.tile;
    const before = state.cash;
    dropCarCargo(state, train, mint, car);
    const paid = state.cash - before;
    expect(paid).toBeCloseTo(
      computeRevenue(state, "silverBars", dist(state, mine.tile, mint.tile), 0),
      6,
    );

    // the same bars without a known origin pay only for the last leg: half
    const again = world(["silverBars"], 1);
    const c2 = again.train.cars[0]!;
    c2.loadedUnits = full;
    c2.loadedTile = again.plant.tile;
    c2.loadedTick = again.state.ticks;
    const b2 = again.state.cash;
    dropCarCargo(again.state, again.train, again.mint, c2);
    expect(paid / (again.state.cash - b2)).toBeCloseTo(2, 1);
  });

  it("runs end to end: ore trains pay nothing, bars made from them pay by the mine's distance", () => {
    const { state, mine, plant, mint } = world(["silverOre", "silverOre"]);
    // a second train carries the bars from the smelter to the mint
    plant.hasEngineShed = true;
    expect(buyTrain(state, plant.id, "american-4-4-0", ["silverBars", "silverBars"]).ok).toBe(true);
    setOrders(state, state.trains[1]!.id, [
      { stationId: plant.id, rule: "auto" },
      { stationId: mint.id, rule: "auto" },
    ]);
    let barsLoadedWithOrigin = 0;
    for (let h = 0; h < 24 * 360; h++) {
      advanceOneHour(state);
      if (h % 24 === 0)
        for (const c of state.trains[1]!.cars)
          if (c.loadedUnits > 0 && c.oreOriginTile === mine.tile) barsLoadedWithOrigin++;
    }
    const events = state.pendingDeliveries;
    expect(events.filter((e) => e.cargoType === "silverOre" && e.revenue > 0)).toHaveLength(0);
    const barsPaid = events.filter((e) => e.cargoType === "silverBars" && e.revenue > 0);
    expect(barsPaid.length).toBeGreaterThan(0);
    expect(barsLoadedWithOrigin).toBeGreaterThan(0);
    // 10 t of bars from 40 tiles away pay more than the 20-tile leg alone would
    for (const e of barsPaid) {
      const legOnly =
        computeRevenue(state, "silverBars", dist(state, plant.tile, mint.tile), 0) *
        ((e.units ?? 0) / 10);
      expect(e.revenue).toBeGreaterThan(legOnly * 0.9);
    }
  });

  it("estimates the pay per ton for the station panel from the mine's distance", () => {
    const { state, mine } = world(["silverOre"]);
    void mine;
    const bars = chainPayEstimate(state, "silverBars")!;
    const ore = chainPayEstimate(state, "silverOre")!;
    expect(bars.sinkName).toBe("Mint");
    expect(bars.perTon).toBeGreaterThan(0);
    // a 20 t ore car makes a 10 t bar car: a ton of ore is worth half a ton of bars
    expect(ore.perTon / bars.perTon).toBeCloseTo(0.5, 6);
    expect(chainPayEstimate(state, "coal")).toBeUndefined();
  });
});

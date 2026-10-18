/** Phase 48: passengers ride to their destination station, pay once for the whole trip, and change trains at an interchange. */
import { describe, expect, it } from "vitest";
import { PARTY_SIZE } from "../../../src/data/economy";
import { locomotiveById } from "../../../src/data/trains";
import { buyTrain, setOrders } from "../../../src/sim/commands";
import { computeStationEconomies } from "../../../src/sim/stations/economy";
import { passengerLinks } from "../../../src/sim/stations/destinations";
import { computeTargetSpeed, type Train } from "../../../src/sim/trains";
import { computeRevenue } from "../../../src/sim/trains/loading";
import { advanceOneHour } from "../../../src/sim/tick";
import type { GameState } from "../../../src/sim/state";
import type { City } from "../../../src/sim/economy/types";
import type { Station } from "../../../src/sim/stations/types";
import { makeTestMap, makeTestState, tileAt } from "../track/helpers";
import { lineWithStops } from "../trains/middleStop.test";
import { giveStationsTowns } from "../stationTowns";

const LOCO = "american-4-4-0";

function trainAt(state: GameState, stationId: number, orders: number[], cars = 1): Train {
  expect(buyTrain(state, stationId, LOCO, Array(cars).fill("passengers") as never).ok).toBe(true);
  const t = state.trains[state.trains.length - 1] as Train;
  expect(
    setOrders(
      state,
      t.id,
      orders.map((id) => ({ stationId: id, rule: "auto" as const })),
    ).ok,
  ).toBe(true);
  return t;
}

/** Puts `units` people aboard the first car, bound for `dest`, as if they boarded at `origin` now. */
function board(
  state: GameState,
  t: Train,
  dest: number,
  origin: Station,
  units = 40 / PARTY_SIZE,
): void {
  const car = t.cars[0] as Train["cars"][number];
  car.lots = [{ dest, amount: units, originTile: origin.tile, tick: state.ticks }];
  car.loadedUnits = units;
  car.loadedTile = origin.tile;
  car.loadedTick = state.ticks;
}

const tileDist = (state: GameState, a: Station, b: Station): number => {
  const w = state.map.width;
  return Math.hypot((a.tile % w) - (b.tile % w), Math.floor(a.tile / w) - Math.floor(b.tile / w));
};

describe("Phase 48 through passengers", () => {
  it("a through passenger is paid once, on arrival, for the whole distance", () => {
    const { state, stationIds } = lineWithStops(3, 12, 1860);
    for (const s of state.stations) s.hasEngineShed = true;
    const [a, b, c] = stationIds.map((id) => state.stations.find((s) => s.id === id)) as Station[];
    const t = trainAt(state, a!.id, [a!.id, b!.id, c!.id, b!.id]);
    t.currentOrderIndex = 1; // next stop: the middle station
    board(state, t, c!.id, a!);
    state.pendingDeliveries.length = 0;
    for (let i = 0; i < 24 * 40 && state.pendingDeliveries.length === 0; i++) advanceOneHour(state);
    const first = state.pendingDeliveries.find((e) => e.trainId === t.id);
    expect(first?.stationId).toBe(c!.id); // not at the middle stop
    expect(first?.units).toBeCloseTo(40 / PARTY_SIZE);
    const days = (first!.tick! - 0) / 24;
    const whole = computeRevenue(
      state,
      "passengers",
      tileDist(state, a!, c!),
      days,
      locomotiveById(LOCO)?.maxSpeedKmh ?? 0,
    );
    // the time factor uses the journey from boarding (tick 0 here), so compare against the whole-distance fare
    expect(first?.revenue).toBeCloseTo(whole, 4);
    expect(
      state.pendingDeliveries.filter((e) => e.trainId === t.id && e.stationId === b!.id),
    ).toEqual([]);
  });

  it("people from one pile split over the train's stops and each group is paid at its own stop (Phase 54)", () => {
    const { state, stationIds } = lineWithStops(3, 12, 1860);
    for (const s of state.stations) s.hasEngineShed = true;
    giveStationsTowns(state);
    const [a, b, c] = stationIds.map((id) => state.stations.find((s) => s.id === id)) as Station[];
    const t = trainAt(state, a!.id, [a!.id, b!.id, c!.id, b!.id]);
    t.currentOrderIndex = 0;
    state.stationCargo.set(a!.id, { passengers: { amount: 9, waitingDays: 3 } });
    for (let i = 0; i < 24 * 5 && !t.cars.some((car) => car.lots); i++) advanceOneHour(state);
    const lots = t.cars.flatMap((car) => car.lots ?? []).filter((l) => l.originTile === a!.tile);
    const toB = lots.filter((l) => l.dest === b!.id).reduce((n, l) => n + l.amount, 0);
    const toC = lots.filter((l) => l.dest === c!.id).reduce((n, l) => n + l.amount, 0);
    // the whole pile boards (only one train serves this station) and splits over the two later stops
    expect(toB + toC).toBeCloseTo(9, 4);
    // the nearer middle town draws the bigger share
    expect(toB).toBeGreaterThan(toC);
    expect(toC).toBeGreaterThan(0);
    // and each group is paid at its own stop, once
    for (let i = 0; i < 24 * 40 && !state.pendingDeliveries.some((e) => e.stationId === c!.id); i++)
      advanceOneHour(state);
    expect(state.pendingDeliveries.some((e) => e.trainId === t.id && e.stationId === b!.id)).toBe(
      true,
    );
    expect(state.pendingDeliveries.some((e) => e.trainId === t.id && e.stationId === c!.id)).toBe(
      true,
    );
  });
});

describe("Phase 54 direct service only", () => {
  const world = (xs: number[]) => {
    const map = makeTestMap(["p".repeat(Math.max(...xs) + 4)]);
    makeTestState(map, { startYear: 1860 });
    const cities: City[] = xs.map((x, i) => {
      const tile = tileAt(map, x, 0);
      map.cityId[tile] = i;
      return {
        id: i,
        name: `C${i}`,
        tier: "town",
        population: 12000,
        anchorX: x,
        anchorY: 0,
        coastal: false,
        tiles: [tile],
      } as unknown as City;
    });
    const stations = xs.map(
      (x, i) =>
        ({
          id: i,
          tile: tileAt(map, x, 0),
          type: "station",
          name: `S${i}`,
          hasEngineShed: false,
          hasWaterTower: false,
          improvements: [],
        }) as unknown as Station,
    );
    return { map, cities, stations };
  };
  const line = (...ids: number[]): Train =>
    ({
      cars: [{ cargoType: "passengers", loadedUnits: 0 }],
      orders: ids.map((stationId) => ({ stationId, rule: "auto" })),
    }) as unknown as Train;

  it("a town reached direct draws people; the same town reached only by changing draws none (Phase 54)", () => {
    const { map, cities, stations } = world([3, 8, 11, 13, 15, 17, 18]);
    const demandTo = (trains: Train[]): number =>
      computeStationEconomies(
        map,
        cities,
        [],
        stations,
        1860,
        undefined,
        undefined,
        passengerLinks(trains),
      )
        .get(0)
        ?.passengerRoutes?.find((r) => r.cityId === 2)?.perMonth ?? 0;
    expect(demandTo([line(0, 1, 2, 1)])).toBeGreaterThan(0); // one through line
    expect(demandTo([line(0, 1), line(1, 2)])).toBe(0); // change at 1: not counted
  });
});

describe("Phase 48 long trains", () => {
  it("a longer train is slower on a grade (power over weight)", () => {
    const { state } = lineWithStops(2, 6, 1860);
    const loco = locomotiveById(LOCO)!;
    state.map.elevation[0] = 0;
    state.map.elevation[1] = 0;
    state.map.elevation[2] = 3;
    const consist = (n: number): Train =>
      ({
        cars: Array.from({ length: n }, () => ({ cargoType: "passengers", loadedUnits: 40 })),
        direction: -1,
      }) as unknown as Train;
    const speed = (n: number, a: number, b: number) =>
      computeTargetSpeed(state, loco, consist(n), a, b);
    expect(speed(8, 1, 2)).toBeLessThan(speed(4, 1, 2)); // uphill
    expect(speed(8, 0, 1)).toBeLessThanOrEqual(speed(4, 0, 1)); // level
    // the grade bites a long train harder in absolute terms
    expect(speed(4, 1, 2) - speed(8, 1, 2)).toBeGreaterThan(0);
  });

  it("the early engines can haul the historical train lengths", () => {
    expect(locomotiveById("norris-4-2-0")?.maxCars).toBeGreaterThanOrEqual(8);
    expect(locomotiveById("american-4-4-0")?.maxCars).toBeGreaterThanOrEqual(10);
  });
});

/** Phase 53B: a change of train costs the wait for the onward train (half its service interval at the era's reference
 * speed), never less than the platform walk. A town behind a long wait draws clearly less than on a through train. */
import { describe, expect, it } from "vitest";
import {
  CHANGE_MIN_TILES,
  MAX_WAIT_DAYS,
  MIN_WAIT_DAYS,
  eraReferenceTilesPerDay,
} from "../../../src/data/economy";
import { buyTrain, setOrders } from "../../../src/sim/commands";
import { passengerLinks } from "../../../src/sim/stations/destinations";
import { computeStationEconomies } from "../../../src/sim/stations/economy";
import {
  changeTilesFor,
  serviceIntervalDays,
  serviceKey,
  serviceRates,
} from "../../../src/sim/stations/waiting";
import type { City } from "../../../src/sim/economy/types";
import type { Station } from "../../../src/sim/stations/types";
import type { Train } from "../../../src/sim/trains/types";
import { makeTestMap, makeTestState, tileAt } from "../track/helpers";
import { lineWithStops } from "../trains/middleStop.test";

describe("changeTilesFor", () => {
  it("is half the onward interval x the era's tiles a day, at least the platform walk", () => {
    const { state, stationIds } = lineWithStops(3, 30, 1860);
    for (const s of state.stations) s.hasEngineShed = true;
    const [a, b] = stationIds;
    const buy = (): void => {
      expect(buyTrain(state, a!, "american-4-4-0", ["passengers"]).ok).toBe(true);
      const t = state.trains[state.trains.length - 1] as Train;
      setOrders(state, t.id, [
        { stationId: a!, rule: "auto" },
        { stationId: b!, rule: "auto" },
      ]);
    };
    buy();
    const interval = serviceIntervalDays(serviceRates(state).get(serviceKey(a!, b!)))!;
    const days = (i: number): number => 0.5 * Math.min(MAX_WAIT_DAYS, Math.max(MIN_WAIT_DAYS, i));
    const per = eraReferenceTilesPerDay(1860);
    const one = changeTilesFor(state)(a!, b!);
    expect(one).toBeCloseTo(Math.max(CHANGE_MIN_TILES, days(interval) * per), 9);
    buy();
    buy();
    buy();
    const four = changeTilesFor(state)(a!, b!);
    expect(four).toBeCloseTo(Math.max(CHANGE_MIN_TILES, days(interval / 4) * per), 9);
    expect(four).toBeLessThan(one);
    // nothing runs a to 999: the wait is the longest one counts
    expect(changeTilesFor(state)(a!, 999)).toBeCloseTo(0.5 * MAX_WAIT_DAYS * per, 9);
  });
});

describe("a destination behind a change", () => {
  const xs = [3, 8, 11, 13, 15, 17, 18];
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
  const line = (...ids: number[]): Train =>
    ({
      cars: [{ cargoType: "passengers", loadedUnits: 0 }],
      orders: ids.map((stationId) => ({ stationId, rule: "auto" })),
    }) as unknown as Train;
  const demandTo = (trains: Train[], waitDays?: number): number =>
    computeStationEconomies(
      map,
      cities,
      [],
      stations,
      1860,
      undefined,
      undefined,
      passengerLinks(
        trains,
        waitDays === undefined ? undefined : () => waitDays * eraReferenceTilesPerDay(1860),
      ),
    )
      .get(0)
      ?.passengerRoutes?.find((r) => r.cityId === 2)?.perMonth ?? 0;

  it("with a 20-day onward interval (a 10-day wait) draws clearly less than on a through train", () => {
    const through = demandTo([line(0, 1, 2, 1)]);
    const waiting = demandTo([line(0, 1), line(1, 2)], 10);
    const quick = demandTo([line(0, 1), line(1, 2)], 0.5);
    expect(through).toBeGreaterThan(0);
    expect(waiting).toBeGreaterThan(0);
    expect(waiting).toBeLessThan(through * 0.8);
    // a short wait costs only the platform walk, so a longer wait is worse
    expect(waiting).toBeLessThan(quick);
  });
});

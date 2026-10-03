/** PLAN Phase 35: passengers are split over reachable destinations by gravity and stored by first leg. */
import { describe, expect, it } from "vitest";
import { accrueDailyCargo } from "../../../src/sim/economy/cargoFlow";
import {
  boardable,
  rebucketPassengerPiles,
  takeBoarders,
} from "../../../src/sim/stations/boarding";
import { passengerLinks } from "../../../src/sim/stations/destinations";
import { computeStationEconomies } from "../../../src/sim/stations/economy";
import type { Station } from "../../../src/sim/stations/types";
import type { StationCargoPile } from "../../../src/sim/state";
import type { Train } from "../../../src/sim/trains/types";
import { makeTestMap, makeTestState, tileAt } from "../track/helpers";
import type { City } from "../../../src/sim/economy/types";

const train = (...stationIds: number[]): Train =>
  ({
    cars: [{ cargoType: "passengers", loadedUnits: 0 }],
    orders: stationIds.map((stationId) => ({ stationId, rule: "auto" })),
  }) as unknown as Train;

describe("boarding", () => {
  const pile = (bound?: Record<number, number>): StationCargoPile => ({
    amount: 100,
    waitingDays: 3,
    ...(bound ? { bound } : {}),
  });
  it("a pile without destinations boards anyone", () => {
    expect(boardable(pile(), train(1, 2), 1)).toBe(100);
  });
  it("a train boards only people bound for another stop of its orders, plus the unassigned", () => {
    const p = pile({ 2: 30, 3: 50 }); // 20 unassigned
    expect(boardable(p, train(1, 2), 1)).toBeCloseTo(50);
    expect(boardable(p, train(1, 3), 1)).toBeCloseTo(70);
    expect(boardable(p, train(1, 2, 3), 1)).toBeCloseTo(100);
    expect(boardable(p, train(1, 9), 1)).toBeCloseTo(20);
  });
  it("taking people removes them from their destinations first", () => {
    const p = pile({ 2: 30, 3: 50 });
    takeBoarders(p, train(1, 2), 1, 30);
    expect(p.amount).toBeCloseTo(70);
    expect(p.bound?.[2]).toBeCloseTo(0);
    expect(p.bound?.[3]).toBeCloseTo(50);
  });
});

describe("station economy with reachability", () => {
  /** Towns in a row, each beside its own station; `xs` are the tile columns, `pops` the populations. */
  function world(xs: number[], pops: number[] = xs.map(() => 12000)) {
    const map = makeTestMap(["p".repeat(Math.max(...xs) + 4)]);
    const state = makeTestState(map, { startYear: 1860 });
    const cities: City[] = [];
    const stations: Station[] = [];
    xs.forEach((x, i) => {
      const tile = tileAt(map, x, 0);
      map.cityId[tile] = i;
      cities.push({
        id: i,
        name: `C${i}`,
        tier: "town",
        population: pops[i],
        anchorX: x,
        anchorY: 0,
        coastal: false,
        tiles: [tile],
      } as unknown as City);
      stations.push({
        id: i,
        tile,
        type: "station",
        name: `S${i}`,
        hasEngineShed: false,
        hasWaterTower: false,
        improvements: [],
      } as unknown as Station);
    });
    const economies = (trains: Train[]) =>
      computeStationEconomies(
        map,
        cities,
        [],
        stations,
        1860,
        undefined,
        undefined,
        passengerLinks(trains),
      );
    return { state, cities, stations, economies };
  }
  const pax = (...ids: number[]): Train => train(...ids);

  it("without service nothing is bound and the supply is the plain town total", () => {
    const { economies } = world([3, 12, 21]);
    const e = economies([]).get(0);
    expect(e?.passengerBound).toBeUndefined();
    expect(e?.supply.passengers).toBeGreaterThan(0);
    expect((e?.passengerUnconnected ?? []).length).toBe(2);
  });

  it("the split never exceeds the town total, and unreachable destinations generate nothing", () => {
    const { economies } = world([3, 12, 21]);
    const none = (economies([]).get(0)?.passengerUnconnected ?? []).reduce(
      (s, u) => s + u.perMonth,
      0,
    );
    const one = economies([pax(0, 1)]).get(0);
    const both = economies([pax(0, 1), pax(1, 2)]).get(0);
    expect(one?.supply.passengers ?? 0).toBeGreaterThan(0);
    expect(one?.supply.passengers ?? 0).toBeLessThan(none);
    expect(both?.supply.passengers ?? 0).toBeGreaterThan(one?.supply.passengers ?? 0);
    expect(both?.supply.passengers ?? 0).toBeLessThanOrEqual(none + 1e-9);
    // Town 2 is not connected to station 0 by one train 0-1: not a route, listed as a hint.
    expect(one?.passengerRoutes?.map((r) => r.cityId)).toEqual([1]);
    expect(one?.passengerUnconnected?.map((u) => u.cityId)).toEqual([2]);
  });

  it("shares of all towns in range sum to the town's total demand (everything connected)", () => {
    const { economies } = world([3, 12, 21]);
    const e = economies([pax(0, 1), pax(1, 2)]).get(0);
    // Every share of the towns in the radius (the rest of the world is not a town and is never generated).
    const base = (economies([]).get(0)?.passengerUnconnected ?? []).reduce(
      (s, u) => s + u.perMonth,
      0,
    );
    const sum = (e?.passengerRoutes ?? []).reduce((s, r) => s + r.perMonth, 0);
    expect(sum).toBeCloseTo(base, 6);
    expect(e?.passengerUnconnected).toBeUndefined();
    expect(e?.supply.passengers).toBeCloseTo(base, 6);
  });

  describe("Ljubljana-like fixture (PLAN Phase 35B): the first line must not take the whole town", () => {
    // 0 Ljubljana (x=5), 1 Trieste (x=25), 2 Venice (x=45), 3 Zagreb (x=30, the other way), 4 Graz (x=20).
    const fixture = () => world([5, 25, 45, 30, 20], [12000, 12000, 12000, 12000, 12000]);

    it("one connection takes less than the whole total while other towns are in the radius", () => {
      const { economies } = fixture();
      const total = (economies([]).get(0)?.passengerUnconnected ?? []).reduce(
        (sum, u) => sum + u.perMonth,
        0,
      );
      const one = economies([pax(0, 1)]).get(0);
      expect(one?.supply.passengers ?? 0).toBeGreaterThan(0);
      expect(one?.supply.passengers ?? 0).toBeLessThan(0.9 * total);
    });

    it("connecting a second destination increases the station total", () => {
      const { economies } = fixture();
      const one = economies([pax(0, 1)]).get(0)?.supply.passengers ?? 0;
      const two = economies([pax(0, 1), pax(1, 2)]).get(0)?.supply.passengers ?? 0;
      const three = economies([pax(0, 1), pax(1, 2), pax(0, 4)]).get(0)?.supply.passengers ?? 0;
      expect(two).toBeGreaterThan(one);
      expect(three).toBeGreaterThan(two);
    });

    it("the unconnected list is populated, and reachable + unconnected = the total", () => {
      const { economies } = fixture();
      const total = (economies([]).get(0)?.passengerUnconnected ?? []).reduce(
        (sum, u) => sum + u.perMonth,
        0,
      );
      const e = economies([pax(0, 1), pax(1, 2)]).get(0);
      expect((e?.passengerUnconnected ?? []).length).toBe(2);
      const unconnected = (e?.passengerUnconnected ?? []).reduce((sum, u) => sum + u.perMonth, 0);
      const reachable = (e?.passengerRoutes ?? []).reduce((sum, r) => sum + r.perMonth, 0);
      expect(reachable + unconnected).toBeCloseTo(total, 6);
      const sorted = (e?.passengerUnconnected ?? []).map((u) => u.perMonth);
      expect(sorted).toEqual([...sorted].sort((a, b) => b - a));
    });

    it("the total demand exceeds what a single typical first line carries", () => {
      const { economies } = fixture();
      const total = (economies([]).get(0)?.passengerUnconnected ?? []).reduce(
        (sum, u) => sum + u.perMonth,
        0,
      );
      const plain = economies([]).get(0)?.supply.passengers ?? 0;
      expect(total).toBeGreaterThan(plain);
    });
  });

  it("two changes away: Belgrade-bound people wait in the Ljubljana bucket", () => {
    // 0 Venice, 1 Ljubljana, 2 Zagreb, 3 Belgrade; trains 0-1, 1-2, 2-3.
    const { economies } = world([3, 20, 38, 55]);
    const e = economies([pax(0, 1), pax(1, 2), pax(2, 3)]).get(0);
    const routes = e?.passengerRoutes ?? [];
    expect(routes.map((r) => r.destination).sort()).toEqual([1, 2, 3]);
    expect(routes.every((r) => r.firstLeg === 1)).toBe(true);
    expect(e?.passengerBound?.map((b) => b.stationId)).toEqual([1]);
    expect(e?.passengerBound?.[0]?.share).toBeCloseTo(1, 9);
  });

  it("the nearest route decides the first leg, and a tie goes to the lower station id", () => {
    // 0 at x=3; 1 at x=20; 2 at x=20; 3 at x=40. Both 1 and 2 are on a train to 3 and the same distance from 0.
    const { economies } = world([3, 20, 20, 40]);
    const e = economies([pax(0, 1), pax(0, 2), pax(1, 3), pax(2, 3)]).get(0);
    const toThree = (e?.passengerRoutes ?? []).find((r) => r.destination === 3);
    expect(toThree?.firstLeg).toBe(1);
  });

  it("beyond the reference distance a nearer town takes the larger share", () => {
    const { economies } = world([3, 12, 120], [12000, 12000, 12000]);
    const e = economies([pax(0, 1), pax(1, 2)]).get(0);
    const near = e?.passengerRoutes?.find((r) => r.cityId === 1)?.perMonth ?? 0;
    const far = e?.passengerRoutes?.find((r) => r.cityId === 2)?.perMonth ?? 0;
    expect(near).toBeGreaterThan(far);
  });

  it("a daily accrual stores people by first leg and giving up shrinks every bucket alike", () => {
    const { state, cities, stations } = world([3, 12, 21]);
    state.stations.push(...stations);
    state.cities.push(...cities);
    state.stationEconomy = computeStationEconomies(
      state.map,
      state.cities,
      [],
      state.stations,
      1860,
      undefined,
      undefined,
      passengerLinks([pax(0, 1), pax(0, 2)]),
    );
    accrueDailyCargo(state);
    const pile = state.stationCargo.get(0)?.passengers;
    expect(pile?.bound).toBeDefined();
    const sum = Object.values(pile?.bound ?? {}).reduce((s, v) => s + v, 0);
    expect(sum).toBeCloseTo(pile?.amount ?? 0, 5);
    for (let day = 0; day < 40; day++) accrueDailyCargo(state);
    const later = state.stationCargo.get(0)?.passengers;
    const sumLater = Object.values(later?.bound ?? {}).reduce((s, v) => s + v, 0);
    expect(sumLater).toBeCloseTo(later?.amount ?? 0, 3);
  });

  it("a train boards everyone waiting for its stops and is deterministic", () => {
    const { economies } = world([3, 12, 21]);
    const run = () => economies([pax(0, 1), pax(1, 2)]).get(0)?.passengerRoutes;
    expect(run()).toEqual(run());
    const p: StationCargoPile = { amount: 100, waitingDays: 0, bound: { 1: 100 } };
    expect(boardable(p, pax(0, 1), 0)).toBeCloseTo(100);
    expect(boardable(p, pax(0, 2), 0)).toBeCloseTo(0);
    expect(boardable(p, pax(0, 2, 1), 0)).toBeCloseTo(100);
  });
});

describe("migration from Phase 34 destination piles", () => {
  it("re-buckets people bound for a far destination into the first-leg bucket and drops unreachable ones", () => {
    const map = makeTestMap(["p".repeat(80)]);
    const stations = [3, 20, 38, 70].map(
      (x, i) => ({ id: i, tile: tileAt(map, x, 0) }) as unknown as Station,
    );
    const stationCargo = new Map([
      [0, { passengers: { amount: 100, waitingDays: 0, bound: { 1: 10, 2: 30, 3: 40 } } }],
    ]);
    // Trains 0-1 and 1-2; station 3 is not linked to anything.
    rebucketPassengerPiles(
      { map, stations, stationCargo } as never,
      passengerLinks([train(0, 1), train(1, 2)]),
    );
    const pile = stationCargo.get(0)?.passengers;
    expect(pile?.bound).toEqual({ 1: 40 });
    expect(pile?.amount).toBe(100); // the 60 others are unassigned and board any train
    // Idempotent.
    rebucketPassengerPiles(
      { map, stations, stationCargo } as never,
      passengerLinks([train(0, 1), train(1, 2)]),
    );
    expect(stationCargo.get(0)?.passengers?.bound).toEqual({ 1: 40 });
  });
});

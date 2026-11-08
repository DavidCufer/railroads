/** PLAN Phase 35 / 54 / 90: every town a station's trains call at directly is a route with its own demand (SPEC 9.5d), the people wait in one pile, and board by the towns of the train's stops. */
import { describe, expect, it } from "vitest";
import {
  MAX_WAIT_DAYS,
  PARTY_SIZE,
  ROUTE_DEMAND,
  tripsPerHeadPerMonth,
} from "../../../src/data/economy";
import { routeDemandPerMonth } from "../../../src/sim/stations/passengerFlows";
import { octileTileDistance } from "../../../src/sim/trains/geometry";
import { accrueDailyCargo } from "../../../src/sim/economy/cargoFlow";
import { Boarding, takePassengers } from "../../../src/sim/stations/boarding";
import { waitingCap } from "../../../src/sim/stations/waiting";
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

  it("the town's total travel demand is population x trips per head, and without service nothing is bound", () => {
    const { economies } = world([3, 12, 21], [12000, 12000, 12000]);
    const e = economies([]).get(0);
    expect(e?.passengerPool).toBeUndefined();
    expect(e?.passengerDemand).toBeCloseTo((12000 * tripsPerHeadPerMonth(1860)) / PARTY_SIZE, 6);
    expect(e?.supply.passengers).toBeCloseTo((12000 * tripsPerHeadPerMonth(1860)) / PARTY_SIZE, 6);
    expect((e?.passengerUnconnected ?? []).length).toBe(2);
  });

  const toCity = (
    e: { passengerRoutes?: Array<{ cityId: number; perMonth: number }> } | undefined,
    id: number,
  ) => e?.passengerRoutes?.find((r) => r.cityId === id)?.perMonth ?? 0;

  it("a route's demand is the formula of SPEC 9.5d and does not depend on what else is built", () => {
    const { economies, stations, state } = world([3, 12, 21]);
    const one = economies([pax(0, 1)]).get(0);
    const more = economies([pax(0, 1), pax(0, 2)]).get(0);
    const tiles = octileTileDistance(stations[0]!.tile, stations[1]!.tile, state.map.width);
    expect(toCity(one, 1)).toBeCloseTo(routeDemandPerMonth(12000, 12000, tiles, 1860), 9);
    expect(toCity(more, 1)).toBeCloseTo(toCity(one, 1), 9); // another route from here does not take its people
    // one train 0-1 does not make town 2 a route: it is listed as a hint with what it would send
    expect(one?.passengerRoutes?.map((r) => r.cityId)).toEqual([1]);
    expect(one?.passengerUnconnected?.map((u) => u.cityId)).toEqual([2]);
  });

  it("a route is the same both ways", () => {
    const { economies } = world([3, 12], [12000, 30000]);
    const e = economies([pax(0, 1)]);
    expect(toCity(e.get(0), 1)).toBeCloseTo(toCity(e.get(1), 0), 9);
  });

  it("a bigger town sends more (the square root of the product of the populations)", () => {
    const { economies } = world([3, 12, 21], [12000, 36000, 4000]);
    const e = economies([pax(0, 1, 2)]).get(0);
    expect(toCity(e, 1) / toCity(e, 2)).toBeCloseTo(Math.sqrt(36000 / 4000), 6);
  });

  it("beyond the reference distance a route loses (ref / d) ^ exponent", () => {
    const { economies, stations, state } = world([3, 33, 63]);
    const e = economies([pax(0, 1, 2)]).get(0);
    const d = (i: number) =>
      octileTileDistance(stations[0]!.tile, stations[i]!.tile, state.map.width);
    expect(d(1)).toBeGreaterThan(ROUTE_DEMAND.refTiles);
    expect(toCity(e, 1) / toCity(e, 2)).toBeCloseTo(
      Math.pow(d(2) / d(1), ROUTE_DEMAND.distExponent),
      6,
    );
  });

  it("a town never sends more than townCap times its own total, the routes scaled down alike", () => {
    const { economies } = world([3, 8, 13, 18, 23, 28], [12000, 12000, 12000, 12000, 12000, 12000]);
    const e = economies([pax(0, 1, 2, 3, 4, 5)]).get(0);
    const sum = (e?.passengerRoutes ?? []).reduce((s, r) => s + r.perMonth, 0);
    expect(sum).toBeCloseTo(ROUTE_DEMAND.townCap * (e?.passengerDemand ?? 0), 6);
    expect(toCity(e, 1)).toBeGreaterThan(toCity(e, 5)); // nearer first, still in proportion
  });

  it("each new route adds people to the station (until the town cap)", () => {
    const { economies } = world([3, 12, 21]);
    const none = economies([]).get(0);
    const one = economies([pax(0, 1)]).get(0)?.supply.passengers ?? 0;
    const two = economies([pax(0, 1), pax(0, 2)]).get(0)?.supply.passengers ?? 0;
    expect(none?.passengerPool).toBeUndefined();
    expect(one).toBeGreaterThan(0);
    expect(two).toBeGreaterThan(one);
  });

  it("panels agree: the station figure, the pile's rate and the sum of its routes are one number; unserved towns are a hint", () => {
    const { economies } = world([3, 12, 21]);
    const e = economies([pax(0, 1)]).get(0);
    const routes = (e?.passengerRoutes ?? []).reduce((s, r) => s + r.perMonth, 0);
    expect(e?.supply.passengers).toBeCloseTo(routes, 9);
    expect(e?.passengerPool).toBeCloseTo(routes, 9);
    const hint = e?.passengerUnconnected ?? [];
    expect(hint.length).toBe(1);
    expect(hint[0]?.perMonth).toBeGreaterThan(0);
    const sorted = hint.map((u) => u.perMonth);
    expect(sorted).toEqual([...sorted].sort((a, b) => b - a));
  });

  /** A running passenger train for the accrual tests: the waiting cap reads the trains' round trips. */
  const running = (...ids: number[]): Train =>
    ({
      id: 1,
      locoModelId: "norris-4-2-0",
      cars: [{ cargoType: "passengers", loadedUnits: 0 }],
      orders: ids.map((stationId) => ({ stationId, rule: "auto" })),
    }) as unknown as Train;

  it("a pile holds MAX_WAIT_DAYS of people while served and counts the rest as unserved (Phase 51, 53C, 54)", () => {
    const { state, cities, stations } = world([3, 12, 21]);
    state.stations.push(...stations);
    state.cities.push(...cities);
    const trains = [running(0, 1), running(0, 2)];
    state.trains.push(...trains);
    state.stationEconomy = computeStationEconomies(
      state.map,
      state.cities,
      [],
      state.stations,
      1860,
      undefined,
      undefined,
      passengerLinks(trains),
    );
    const pool = state.stationEconomy.get(0)?.passengerPool ?? 0;
    const cap = waitingCap(pool, true);
    expect(cap).toBeGreaterThan(0);
    for (let day = 0; day < 120; day++) {
      accrueDailyCargo(state);
      expect(state.stationCargo.get(0)?.passengers?.amount ?? 0).toBeLessThanOrEqual(cap + 1e-9);
    }
    expect(state.stationCargo.get(0)?.passengers?.amount).toBeCloseTo(cap, 6);
    expect(state.stationFlow.get(0)?.month.passengers?.lostUnits ?? 0).toBeGreaterThan(0);
  });

  it("a town reachable only by changing trains draws nothing (Phase 54: direct service only)", () => {
    // 0 Venice, 1 Ljubljana, 2 Zagreb, 3 Belgrade; trains 0-1, 1-2, 2-3.
    const { economies } = world([3, 20, 38, 55]);
    const e = economies([pax(0, 1), pax(1, 2), pax(2, 3)]).get(0);
    expect((e?.passengerRoutes ?? []).map((r) => r.destination)).toEqual([1]);
    expect((e?.passengerUnconnected ?? []).map((u) => u.cityId).sort()).toEqual([2, 3]);
    // The same trains plus a direct one to Belgrade: it now draws.
    const direct = economies([pax(0, 1), pax(1, 2), pax(2, 3), pax(0, 3)]).get(0);
    expect((direct?.passengerRoutes ?? []).map((r) => r.destination)).toEqual([1, 3]);
  });

  it("a train that calls at more towns makes every one of its stops generate more travellers", () => {
    const { economies } = world([3, 12, 21]);
    const two = economies([pax(0, 1)]).get(0)?.passengerPool ?? 0;
    const three = economies([pax(0, 1, 2, 1)]).get(0)?.passengerPool ?? 0;
    expect(three).toBeGreaterThan(two);
  });

  it("a daily accrual fills one pile with no destinations, linearly", () => {
    const { state, cities, stations } = world([3, 12, 21]);
    state.stations.push(...stations);
    state.cities.push(...cities);
    const trains = [running(0, 1), running(0, 2)];
    state.trains.push(...trains);
    state.stationEconomy = computeStationEconomies(
      state.map,
      state.cities,
      [],
      state.stations,
      1860,
      undefined,
      undefined,
      passengerLinks(trains),
    );
    accrueDailyCargo(state);
    const pool = state.stationEconomy.get(0)?.passengerPool ?? 0;
    expect(state.stationCargo.get(0)?.passengers?.amount).toBeCloseTo(pool / 30, 9);
    expect(Object.keys(state.stationCargo.get(0)?.passengers ?? {}).sort()).toEqual([
      "amount",
      "waitingDays",
    ]);
    for (let day = 0; day < 4; day++) accrueDailyCargo(state);
    expect(state.stationCargo.get(0)?.passengers?.amount).toBeCloseTo((5 * pool) / 30, 9);
  });

  it("the economy is deterministic", () => {
    const { economies } = world([3, 12, 21]);
    const run = () => economies([pax(0, 1), pax(0, 2)]).get(0)?.passengerRoutes;
    expect(run()).toEqual(run());
  });

  describe("who boards (Phase 54): a train takes the people heading for the towns it stops at", () => {
    // Three towns in a row, 12 000 each: 0 (x=3), 1 (x=12, the small town between), 2 (x=21); then the big pair in
    // the express test is simply the same row with a local train that also calls at 1.
    const setup = (trains: Train[], pops?: number[]) => {
      const { state, cities, stations } = world([3, 12, 21], pops);
      state.stations.push(...stations);
      state.cities.push(...cities);
      state.trains.push(...trains);
      state.stationEconomy = computeStationEconomies(
        state.map,
        state.cities,
        [],
        state.stations,
        1860,
        undefined,
        undefined,
        passengerLinks(trains),
      );
      return state;
    };
    const atStop = (t: Train, index: number): Train => {
      t.currentOrderIndex = index;
      return t;
    };

    it("an express (0, 2) takes only its share of the pile when a local also calls at the middle town", () => {
      const local = running(0, 1, 2, 1);
      const express = running(0, 2);
      const state = setup([local, express]);
      const station = state.stations[0] as Station;
      const viaLocal = new Boarding(state, atStop(local, 0), station, 100);
      const viaExpress = new Boarding(state, atStop(express, 0), station, 100);
      expect(viaLocal.fraction).toBeCloseTo(1, 9);
      // route demand: the express (town 2) takes its route's part of what the station sends to both towns
      const to = (id: number): number =>
        state.stationEconomy.get(0)?.passengerRoutes?.find((r) => r.cityId === id)?.perMonth ?? 0;
      const share = to(2) / (to(1) + to(2));
      expect(viaExpress.fraction).toBeCloseTo(share, 9);
      expect(viaExpress.left).toBeCloseTo(100 * share, 9);
      // the local's riders split over its two later stops in proportion to the routes' demand, and they sum to 1
      const shares = [...viaLocal.shares.values()];
      expect(shares.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
      expect((viaLocal.shares.get(1) ?? 0) / (viaLocal.shares.get(2) ?? 1)).toBeCloseTo(
        to(1) / to(2),
        6,
      );
      // the express's riders all go to town 2
      expect([...viaExpress.shares.keys()]).toEqual([2]);
    });

    it("a metropolis draws most of the pile but not all of it: an express to it cannot carry the villages' share (Phase 62)", () => {
      // 0 is next to five towns: a metropolis (1, x=40) and four villages. Gravity gives the metropolis most of the
      // pile; the villages' trips stay theirs, and the express may take no more than the metropolis's share.
      const xs = [3, 40, 12, 20, 28, 36];
      const pops = [12000, 400000, 3000, 3000, 3000, 3000];
      const local = running(0, 2, 3, 4, 5, 1);
      const express = running(0, 1);
      const { state, cities, stations } = world(xs, pops);
      state.stations.push(...stations);
      state.cities.push(...cities);
      state.trains.push(local, express);
      state.stationEconomy = computeStationEconomies(
        state.map,
        state.cities,
        [],
        state.stations,
        1860,
        undefined,
        undefined,
        passengerLinks([local, express]),
      );
      const routes = state.stationEconomy.get(0)?.passengerRoutes ?? [];
      const total = routes.reduce((n, r) => n + r.perMonth, 0);
      const toMetropolis = routes.find((r) => r.cityId === 1)?.perMonth ?? 0;
      const b = new Boarding(state, atStop(express, 0), state.stations[0] as Station, 100);
      expect(b.fraction).toBeCloseTo(toMetropolis / total, 9);
      expect(b.fraction).toBeGreaterThan(0.5);
      expect(b.fraction).toBeLessThan(0.99);
    });

    it("an express cannot carry the small town's people, however often it runs", () => {
      // Local (0, 1, 2, 1) and an express (0, 2), a call every two days: over 60 days the express takes only what the towns
      // it calls at send (town 2's share), and the people for town 1 pile up for the local.
      const local = running(0, 1, 2, 1);
      const express = running(0, 2);
      const state = setup([local, express]);
      const station = state.stations[0] as Station;
      const perMonthTo = (cityId: number): number =>
        state.stationEconomy.get(0)?.passengerRoutes?.find((r) => r.cityId === cityId)?.perMonth ??
        0;
      let taken = 0;
      for (let day = 1; day <= 60; day++) {
        state.ticks += 24;
        accrueDailyCargo(state);
        if (day % 2 !== 0) continue;
        const entry = state.stationCargo.get(0)?.passengers ?? { amount: 0, waitingDays: 0 };
        const b = new Boarding(state, atStop(express, 0), station, entry.amount);
        taken += takePassengers(entry, b, station, 1e9, state.ticks).reduce(
          (n, l) => n + l.amount,
          0,
        );
        b.recordWaiting(state, 0);
      }
      const expected = (perMonthTo(2) / 30) * 60;
      expect(taken).toBeGreaterThan(0.85 * expected);
      expect(taken).toBeLessThan(1.1 * expected);
      // the pile still holds a full wait (MAX_WAIT_DAYS) of town 1's people (nobody has called there)
      const pileLeft = state.stationCargo.get(0)?.passengers?.amount ?? 0;
      expect(pileLeft).toBeGreaterThan((perMonthTo(1) * MAX_WAIT_DAYS * 0.95) / 30);
    });

    it("people a full train left behind stay counted for the next train", () => {
      const express = running(0, 2);
      const state = setup([express]);
      const station = state.stations[0] as Station;
      for (let day = 0; day < 10; day++) {
        state.ticks += 24;
        accrueDailyCargo(state);
      }
      const entry = state.stationCargo.get(0)!.passengers!;
      const before = entry.amount;
      // a train with room for only a third of them
      const first = new Boarding(state, atStop(express, 0), station, before);
      const took = takePassengers(entry, first, station, before / 3, state.ticks).reduce(
        (n, l) => n + l.amount,
        0,
      );
      first.recordWaiting(state, 0);
      expect(took).toBeCloseTo(before / 3, 6);
      // the next train, straight after, may still take the other two thirds
      const second = new Boarding(state, atStop(express, 0), station, entry.amount);
      expect(second.left).toBeCloseTo((before * 2) / 3, 6);
    });

    it("with no other train an express takes the whole pile", () => {
      const express = running(0, 2);
      const state = setup([express]);
      const b = new Boarding(state, atStop(express, 0), state.stations[0] as Station, 100);
      expect(b.fraction).toBeCloseTo(1, 9);
    });

    it("boarding removes people from the one pile, at most the train's share, and splits them by gravity", () => {
      const local = running(0, 1, 2, 1);
      const express = running(0, 2);
      const state = setup([local, express]);
      const station = state.stations[0] as Station;
      const entry: StationCargoPile = { amount: 100, waitingDays: 3 };
      const b = new Boarding(state, atStop(express, 0), station, entry.amount);
      const taken = takePassengers(entry, b, station, 1000, 5);
      const n = taken.reduce((sum, l) => sum + l.amount, 0);
      expect(n).toBeCloseTo(100 * b.fraction, 9);
      expect(entry.amount).toBeCloseTo(100 - n, 9);
      expect(
        taken.every((l) => l.dest === 2 && l.tick === 5 && l.originTile === station.tile),
      ).toBe(true);
      // a second car of the same train finds the allowance used up
      expect(takePassengers(entry, b, station, 1000, 5)).toEqual([]);
    });

    it("a train whose later stops have no town takes nobody", () => {
      const lonely = running(0, 9);
      const state = setup([lonely]);
      const b = new Boarding(state, atStop(lonely, 0), state.stations[0] as Station, 100);
      expect(b.available(100)).toBe(0);
    });
  });
});

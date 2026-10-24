/** PLAN Phase 35 / 35C / 54: passengers are split over the towns the station's trains call at directly by gravity, wait in one pile, and board by the towns of the train's stops. */
import { describe, expect, it } from "vitest";
import { PAIR_DEMAND, PARTY_SIZE, tripsPerHeadPerMonth } from "../../../src/data/economy";
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

  it("the split never exceeds the town total, and unreachable destinations generate nothing", () => {
    const { economies } = world([3, 12, 21]);
    const none = (economies([]).get(0)?.passengerUnconnected ?? []).reduce(
      (s, u) => s + u.perMonth,
      0,
    );
    const one = economies([pax(0, 1)]).get(0);
    const both = economies([pax(0, 1), pax(0, 2)]).get(0);
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
    const e = economies([pax(0, 1), pax(0, 2)]).get(0);
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

  it("panels agree: the station figure is the sum of its routes, the connected part of the town total", () => {
    const { economies } = world([3, 12, 21]);
    const e = economies([pax(0, 1)]).get(0);
    const routes = (e?.passengerRoutes ?? []).reduce((s, r) => s + r.perMonth, 0);
    expect(e?.supply.passengers).toBeCloseTo(routes, 9);
    const unconnected = (e?.passengerUnconnected ?? []).reduce((s, u) => s + u.perMonth, 0);
    // Phase 53 volume rule, kept in Phase 62: two towns in range take at most 2 x maxShare of the total; the rest is not
    // generated.
    expect(routes + unconnected).toBeCloseTo(
      (e?.passengerDemand ?? 0) * 2 * PAIR_DEMAND.maxShare,
      6,
    );
    expect(e?.passengerPool).toBeCloseTo(routes, 9); // one pile, fed at the connected rate
  });

  it("a metropolis draws a large but not total share, and a town with few places to go makes fewer trips (Phase 62)", () => {
    // A metropolis (400 000) and four villages (3 000), the origin 12 000: gravity puts most trips on the metropolis, but
    // the villages keep theirs (the volume is the old rule's, so five towns in range add up to the whole demand).
    const { economies } = world([3, 40, 12, 20, 28, 36], [12000, 400000, 3000, 3000, 3000, 3000]);
    const e = economies([pax(0, 1, 2, 3, 4, 5)]).get(0);
    const demand = e?.passengerDemand ?? 0;
    const routes = e?.passengerRoutes ?? [];
    const sum = routes.reduce((s, r) => s + r.perMonth, 0);
    expect(sum).toBeCloseTo(demand, 6);
    // no 20 % cap on one destination any more
    expect(routes.find((r) => r.cityId === 1)?.perMonth ?? 0).toBeGreaterThan(
      demand * PAIR_DEMAND.maxShare * 2,
    );
    const toMetropolis = routes.find((r) => r.cityId === 1)?.perMonth ?? 0;
    expect(toMetropolis).toBeGreaterThan(sum * 0.5);
    expect(toMetropolis).toBeLessThan(sum * 0.99);
    for (const r of routes.filter((x) => x.cityId !== 1)) expect(r.perMonth).toBeGreaterThan(0);
    // One village in range: the volume is the old rule's 20 % of the town's trips, all of them to that village.
    const lone = world([3, 20], [12000, 3000])
      .economies([pax(0, 1)])
      .get(0);
    expect(lone?.passengerRoutes?.[0]?.perMonth).toBeCloseTo(
      (lone?.passengerDemand ?? 0) * PAIR_DEMAND.maxShare,
      9,
    );
  });

  it("a bigger town draws more than a smaller one even when it is farther (Vienna and Graz from Ljubljana, Phase 62)", () => {
    // Ljubljana-like origin 15 000; Graz-like 36 000 at 24 tiles, Vienna-like 150 000 at 54, Trieste-like 25 000 at 20.
    const { economies } = world([3, 27, 57, 23], [15000, 36000, 150000, 25000]);
    const e = economies([pax(0, 1, 2, 3)]).get(0);
    const to = (id: number) => e?.passengerRoutes?.find((r) => r.cityId === id)?.perMonth ?? 0;
    expect(to(2)).toBeGreaterThan(to(1) * 1.5); // Vienna well above Graz
    expect(to(1)).toBeGreaterThan(to(3)); // Graz above the smaller, nearer Trieste
    expect(to(2)).not.toBeCloseTo(to(1), 0); // not levelled
  });

  it("of two equal towns the nearer takes more", () => {
    // Four more towns in range keep the 20 % cap from levelling the two (it binds the nearer one; the farther gets less).
    const { economies } = world(
      [3, 28, 63, 40, 45, 50, 55],
      [12000, 12000, 12000, 12000, 12000, 12000, 12000],
    );
    const e = economies([pax(0, 1), pax(0, 2)]).get(0);
    const near = e?.passengerRoutes?.find((r) => r.cityId === 1)?.perMonth ?? 0;
    const far = e?.passengerRoutes?.find((r) => r.cityId === 2)?.perMonth ?? 0;
    expect(near).toBeGreaterThan(far * 1.5);
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
      const two = economies([pax(0, 1), pax(0, 2)]).get(0)?.supply.passengers ?? 0;
      const three = economies([pax(0, 1), pax(0, 2), pax(0, 4)]).get(0)?.supply.passengers ?? 0;
      expect(two).toBeGreaterThan(one);
      expect(three).toBeGreaterThan(two);
    });

    it("the unconnected list is populated, and reachable + unconnected = the total", () => {
      const { economies } = fixture();
      const total = (economies([]).get(0)?.passengerUnconnected ?? []).reduce(
        (sum, u) => sum + u.perMonth,
        0,
      );
      const e = economies([pax(0, 1), pax(0, 2)]).get(0);
      expect((e?.passengerUnconnected ?? []).length).toBe(2);
      const unconnected = (e?.passengerUnconnected ?? []).reduce((sum, u) => sum + u.perMonth, 0);
      const reachable = (e?.passengerRoutes ?? []).reduce((sum, r) => sum + r.perMonth, 0);
      expect(reachable + unconnected).toBeCloseTo(total, 6);
      const sorted = (e?.passengerUnconnected ?? []).map((u) => u.perMonth);
      expect(sorted).toEqual([...sorted].sort((a, b) => b - a));
    });

    it("the total is population x trips per head, a few hundred a month for a 12k town in 1860", () => {
      const { economies } = fixture();
      const e = economies([]).get(0);
      expect(e?.passengerDemand).toBeCloseTo((12000 * tripsPerHeadPerMonth(1860)) / PARTY_SIZE, 6);
      expect(e?.passengerDemand).toBeLessThan(600);
    });
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

  it("a far town beyond the radius that a train calls at takes less than a near one", () => {
    // More towns in range keep the 20 % cap from levelling the two reachable ones.
    const { economies } = world(
      [3, 12, 120, 30, 35, 40, 45],
      [12000, 12000, 12000, 12000, 12000, 12000, 12000],
    );
    const e = economies([pax(0, 1), pax(0, 2)]).get(0);
    const near = e?.passengerRoutes?.find((r) => r.cityId === 1)?.perMonth ?? 0;
    const far = e?.passengerRoutes?.find((r) => r.cityId === 2)?.perMonth ?? 0;
    expect(near).toBeGreaterThan(far);
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
      // Phase 62: equal towns at 9 and 18 tiles weigh 1/15 (the distance clamp) and 1/18, so the express (town 2) takes
      // (1/18) / (1/15 + 1/18) = 5/11 of the pile by gravity; Phase 68 mixes in `evenShare` of an equal split (1/2)
      const share = (1 - PAIR_DEMAND.evenShare) * (5 / 11) + PAIR_DEMAND.evenShare / 2;
      expect(viaExpress.fraction).toBeCloseTo(share, 9);
      expect(viaExpress.left).toBeCloseTo(100 * share, 9);
      // the local's riders split over its two later stops, and they sum to 1: the nearer town takes more
      const shares = [...viaLocal.shares.values()];
      expect(shares.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
      expect(viaLocal.shares.get(1) ?? 0).toBeGreaterThan(viaLocal.shares.get(2) ?? 1);
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
      // the pile still holds a full wait of town 1's people (nobody has called there)
      const pileLeft = state.stationCargo.get(0)?.passengers?.amount ?? 0;
      expect(pileLeft).toBeGreaterThan(perMonthTo(1) * 0.95);
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

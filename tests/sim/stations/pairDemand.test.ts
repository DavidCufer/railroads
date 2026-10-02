/** PLAN Phase 34 item 10: trip demand between a pair of places is finite and passengers are bound for a destination. */
import { describe, expect, it } from "vitest";
import { PAIR_DEMAND } from "../../../src/data/economy";
import { accrueDailyCargo } from "../../../src/sim/economy/cargoFlow";
import { boardable, takeBoarders } from "../../../src/sim/stations/boarding";
import { pairAffinity, pairDemandMultiplier } from "../../../src/sim/stations/destinations";
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

describe("gravity weights", () => {
  const ref = PAIR_DEMAND.refDistanceTiles;
  it("two equal stations at the reference distance exchange exactly their supply; nearer is capped at that", () => {
    expect(pairAffinity(100, 100, ref)).toBeCloseTo(1);
    expect(pairAffinity(100, 100, ref / 2)).toBe(1);
    expect(pairAffinity(100, 4000, ref)).toBe(1);
  });
  it("falls with distance and with a smaller partner, and never for an empty station", () => {
    expect(pairAffinity(100, 100, ref * 2)).toBeCloseTo(0.5, 1);
    expect(pairAffinity(100, 100, ref * 2)).toBeLessThan(pairAffinity(100, 100, ref * 1.2));
    expect(pairAffinity(400, 100, ref)).toBeLessThan(1);
    expect(pairAffinity(100, 0, ref)).toBe(0);
  });
  it("a hub draws more with more destinations, saturating below 1 + extraDestinationMax", () => {
    expect(pairDemandMultiplier(0.4)).toBeCloseTo(0.4);
    expect(pairDemandMultiplier(1)).toBeCloseTo(1);
    expect(pairDemandMultiplier(2)).toBeGreaterThan(1);
    expect(pairDemandMultiplier(50)).toBeLessThan(1 + PAIR_DEMAND.extraDestinationMax);
  });
});

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

describe("station economy with destinations", () => {
  function world() {
    // Three stations in a row of plain tiles, each beside its own town (city tiles supply passengers).
    const map = makeTestMap(["pppppppppppppppppppppppppppppppppppppppppppppp"]);
    const state = makeTestState(map, { startYear: 1860 });
    const cities: City[] = [];
    const stations: Station[] = [];
    [3, 25, 45].forEach((x, i) => {
      const tile = tileAt(map, x, 0);
      map.cityId[tile] = i;
      cities.push({
        id: i,
        name: `C${i}`,
        tier: "town",
        population: 12000,
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
    return { state, cities, stations };
  }

  it("without service nothing is bound; with service the shares sum to 1 and a far destination weighs less", () => {
    const { state, cities, stations } = world();
    const plain = computeStationEconomies(state.map, cities, [], stations, 1860);
    expect(plain.get(0)?.passengerBound).toBeUndefined();
    const base = plain.get(0)?.supply.passengers ?? 0;
    expect(base).toBeGreaterThan(0);

    const served = computeStationEconomies(
      state.map,
      cities,
      [],
      stations,
      1860,
      undefined,
      new Map([[0, new Set([1, 2])]]),
    );
    const bound = served.get(0)?.passengerBound ?? [];
    expect(bound.map((b) => b.stationId).sort()).toEqual([1, 2]);
    expect(bound.reduce((s, b) => s + b.share, 0)).toBeCloseTo(1);
    const near = bound.find((b) => b.stationId === 1)?.share ?? 0;
    const far = bound.find((b) => b.stationId === 2)?.share ?? 0;
    expect(near).toBeGreaterThan(far);
    // Two destinations: more than the one-destination supply, never past the cap.
    const supply = served.get(0)?.supply.passengers ?? 0;
    expect(supply).toBeGreaterThan(0);
    expect(supply).toBeLessThanOrEqual(base * (1 + PAIR_DEMAND.extraDestinationMax) + 0.2);
  });

  it("a daily accrual splits new passengers by destination and giving up shrinks every share alike", () => {
    const { state, cities, stations } = world();
    state.stations.push(...stations);
    state.cities.push(...cities);
    state.stationEconomy = computeStationEconomies(
      state.map,
      state.cities,
      [],
      state.stations,
      1860,
      undefined,
      new Map([[0, new Set([1, 2])]]),
    );
    accrueDailyCargo(state);
    const pile = state.stationCargo.get(0)?.passengers;
    expect(pile?.bound).toBeDefined();
    const sum = Object.values(pile?.bound ?? {}).reduce((s, v) => s + v, 0);
    expect(sum).toBeCloseTo(pile?.amount ?? 0, 5);
    const ratio = (pile?.bound?.[1] ?? 0) / (pile?.bound?.[2] ?? 1);
    for (let day = 0; day < 40; day++) accrueDailyCargo(state);
    const later = state.stationCargo.get(0)?.passengers;
    const sumLater = Object.values(later?.bound ?? {}).reduce((s, v) => s + v, 0);
    expect(sumLater).toBeCloseTo(later?.amount ?? 0, 3);
    expect((later?.bound?.[1] ?? 0) / (later?.bound?.[2] ?? 1)).toBeCloseTo(ratio, 3);
  });
});

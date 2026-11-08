/** PLAN Phase 53: fewer travellers each paying more; fair shares. (A direct destination drawing more than the same town
 * via a change is `throughJourneys.test.ts` "Phase 48 changes deter travel", which holds unchanged.) */
import { describe, expect, it } from "vitest";
import { PARTY_SIZE, ROUTE_DEMAND, tripsPerHeadPerMonth } from "../../../src/data/economy";
import { computePassengerFlows } from "../../../src/sim/stations/passengerFlows";
import { createGameState } from "../../../src/sim/state";

const OPTS = { seed: 1, region: "central-eu", startYear: 1842, difficulty: "normal" } as const;

describe("Phase 53 passenger demand", () => {
  const state = createGameState(OPTS);
  const city = (name: string) => state.cities.find((c) => c.name === name)!;
  const centre = (name: string) => city(name).anchorY * state.map.width + city(name).anchorX;
  const point = (id: number, name: string) => ({ id, tile: centre(name), cityId: city(name).id });

  it("Venice-type demand: one direction of Venice-Milan in 1842 is about one to two full early trains a month", () => {
    const venice = point(0, "Venice");
    const milan = point(1, "Milan");
    const demand = city("Venice").population * tripsPerHeadPerMonth(1842);
    const flows = computePassengerFlows(
      state.map,
      state.cities,
      1842,
      venice,
      demand,
      [venice, milan],
      new Map([
        [0, new Set([1])],
        [1, new Set([0])],
      ]),
    );
    const toMilan = flows?.routes.find((r) => r.cityId === milan.cityId)?.perMonth ?? 0;
    const trainSeats = (5 * 40) / PARTY_SIZE; // an 1840s train: five cars of 40 seats, in game passengers (Phase 90: the route is in game passengers)
    expect(toMilan).toBeGreaterThan(1 * trainSeats);
    // the same bounds as before, now in game passengers (3.5 early trains a month at most)
    expect(toMilan).toBeLessThan(3.5 * trainSeats);
  });

  it("routes follow size and distance, each its own number, and a hub is capped (Phase 90)", () => {
    const venice = point(0, "Venice");
    const milan = point(1, "Milan");
    const trieste = point(2, "Trieste");
    const demand = 1000;
    const flows = computePassengerFlows(
      state.map,
      state.cities,
      1842,
      venice,
      demand,
      [venice, milan, trieste],
      new Map([
        [0, new Set([1, 2])],
        [1, new Set([0])],
        [2, new Set([0])],
      ]),
    );
    const people = (id: number) => flows?.routes.find((r) => r.cityId === id)?.perMonth ?? 0;
    // Milan is more than five times Trieste's size: it sends more even if it is farther
    expect(people(milan.cityId)).toBeGreaterThan(people(trieste.cityId));
    // the routes together never exceed townCap times the town's total
    const sum = (flows?.routes ?? []).reduce((a, r) => a + r.perMonth, 0);
    expect(sum).toBeLessThanOrEqual(ROUTE_DEMAND.townCap * demand + 1e-9);
  });
});

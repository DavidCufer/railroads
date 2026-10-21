/** PLAN Phase 53: fewer travellers each paying more; fair shares. (A direct destination drawing more than the same town
 * via a change is `throughJourneys.test.ts` "Phase 48 changes deter travel", which holds unchanged.) */
import { describe, expect, it } from "vitest";
import { PAIR_DEMAND, tripsPerHeadPerMonth } from "../../../src/data/economy";
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
    const trainSeats = 5 * 40; // an 1840s train: five cars of 40 seats
    expect(toMilan).toBeGreaterThan(1 * trainSeats);
    // Phase 62 (owner OK 2026-10-21): was < 500 (2 x seats x 1.25), measured 630 once the 20 % share cap went: Milan
    // (140 000, next door) now draws its gravity share of Venice's trips. 700 = 3.5 early trains a month.
    expect(toMilan).toBeLessThan(3.5 * trainSeats);
  });

  it("shares follow size and distance, uncapped, and the town's total is the old volume (Phase 62)", () => {
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
    const all = [...(flows?.routes ?? []), ...(flows?.unconnected ?? [])];
    const people = (id: number) => all.find((r) => r.cityId === id)?.perMonth ?? 0;
    // Milan is more than five times Trieste's size: it draws more even if it is farther
    expect(people(milan.cityId)).toBeGreaterThan(people(trieste.cityId));
    // the biggest destination is not held at the old 20 % cap
    expect(people(milan.cityId)).toBeGreaterThan(demand * PAIR_DEMAND.maxShare);
    // the total is what the capped shares added up to: never above n x maxShare, never all of the demand with few towns
    const sum = all.reduce((a, r) => a + r.perMonth, 0);
    expect(sum).toBeLessThanOrEqual(all.length * PAIR_DEMAND.maxShare * demand + 1e-9);
    expect(sum).toBeLessThan(demand);
  });
});

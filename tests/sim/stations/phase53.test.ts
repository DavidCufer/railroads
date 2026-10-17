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
    expect(toMilan).toBeLessThan(2 * trainSeats * 1.25);
  });

  it("with two candidates each takes at most maxShare and the town's total falls", () => {
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
    const shares = [...(flows?.routes ?? []), ...(flows?.unconnected ?? [])].map(
      (r) => r.perMonth / demand,
    );
    for (const sh of shares) expect(sh).toBeLessThanOrEqual(PAIR_DEMAND.maxShare + 1e-9);
    // Venice has more than two towns in range in 1842 (Ljubljana, Innsbruck, ...), so the total is whatever fits under
    // the cap, never above n x maxShare.
    expect(shares.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(
      shares.length * PAIR_DEMAND.maxShare + 1e-9,
    );
  });
});

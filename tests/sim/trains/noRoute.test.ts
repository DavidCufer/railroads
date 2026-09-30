/** PLAN Phase 28A (PLAYTEST-1 Bug 2): a `noRoute` train holds no platform, blocks nobody, and is flagged after 30 days. */
import { describe, expect, it } from "vitest";
import { buildStation, buildTrack, buyTrain, setOrders } from "../../../src/sim/commands";
import { advanceOneHour } from "../../../src/sim/tick";
import { stuckTrains } from "../../../src/sim/trains";
import { makeTestMap, makeTestState, tileAt } from "../track/helpers";

describe("noRoute trains", () => {
  it("park without holding a platform; the working shuttle keeps loading and they are flagged after 30 days", () => {
    const map = makeTestMap(Array.from({ length: 6 }, () => "p".repeat(24)));
    const state = makeTestState(map, { seed: 3, startYear: 1900, cash: 1e12 });
    const main = Array.from({ length: 12 }, (_, x) => tileAt(map, x + 1, 1));
    expect(buildTrack(state, main).ok).toBe(true);
    expect(buildStation(state, main[0] as number, "depot").ok).toBe(true);
    expect(buildStation(state, main[11] as number, "depot").ok).toBe(true);
    const island = Array.from({ length: 4 }, (_, x) => tileAt(map, x + 1, 4));
    expect(buildTrack(state, island).ok).toBe(true);
    expect(buildStation(state, island[0] as number, "depot").ok).toBe(true);
    const [a, b, c] = state.stations.map((s) => s.id) as [number, number, number];

    // Two trains whose second order can never be reached park at B.
    for (let i = 0; i < 2; i++) {
      expect(buyTrain(state, a, "atlantic-4-4-2", ["passengers"]).ok).toBe(true);
      const t = state.trains[state.trains.length - 1]!;
      setOrders(
        state,
        t.id,
        [b, c].map((stationId) => ({ stationId, rule: "auto" as const })),
      );
    }
    const parked = state.trains.map((t) => t.id);
    // Three shuttles on the same pair share B's two platforms.
    for (let i = 0; i < 3; i++) {
      expect(buyTrain(state, a, "atlantic-4-4-2", ["passengers"]).ok).toBe(true);
      const t = state.trains[state.trains.length - 1]!;
      setOrders(
        state,
        t.id,
        [a, b].map((stationId) => ({ stationId, rule: "auto" as const })),
      );
    }
    for (let t = 0; t < 60 * 24; t++) advanceOneHour(state);

    const noRoute = state.trains.filter((t) => parked.includes(t.id));
    expect(noRoute.every((t) => t.status === "noRoute")).toBe(true);
    const shuttles = state.trains.filter((t) => !parked.includes(t.id));
    const before = shuttles.map((t) => t.distanceTraveled);
    for (let t = 0; t < 60 * 24; t++) {
      advanceOneHour(state);
      // Bug 4: a parked train never shuffles along the dead end beside the station looking `moving`.
      expect(noRoute.every((p) => p.status === "noRoute")).toBe(true);
    }
    shuttles.forEach((t, i) =>
      expect(t.distanceTraveled - (before[i] as number)).toBeGreaterThan(40),
    );
    expect(shuttles.some((t) => t.status === "noRoute" || t.status === "stuck")).toBe(false);
    const flagged = stuckTrains(state).filter((f) => f.reason === "noRoute");
    expect(flagged.map((f) => f.train.id).sort()).toEqual(parked.sort());
  }, 60_000);
});

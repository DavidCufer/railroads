/** Phase 24A: a fast train closing on a slow one matches its speed smoothly and keeps a visible gap. */
import { describe, expect, it } from "vitest";
import { FOLLOW_MIN_GAP_TILES } from "../../../src/data/trains";
import { buildStation, buildTrack, buyTrain, setOrders } from "../../../src/sim/commands";
import { stepTrains } from "../../../src/sim/trains";
import { nearestLeader } from "../../../src/sim/trains/movement";
import { makeTestMap, makeTestState, tileAt } from "../track/helpers";

const LENGTH = 90;

describe("smooth following", () => {
  it("a fast train behind a slow one settles at the leader's speed without oscillating or closing below the gap", () => {
    const map = makeTestMap([Array.from({ length: LENGTH }, () => "p").join("")]);
    const state = makeTestState(map, { startYear: 1900 });
    expect(
      buildTrack(
        state,
        Array.from({ length: LENGTH }, (_, x) => tileAt(map, x, 0)),
      ).ok,
    ).toBe(true);
    expect(buildStation(state, tileAt(map, 0, 0), "depot").ok).toBe(true);
    expect(buildStation(state, tileAt(map, LENGTH - 1, 0), "terminal").ok).toBe(true);
    const [a, b] = state.stations;

    const launch = (loco: string): number => {
      expect(buyTrain(state, a!.id, loco, ["coal", "coal"]).ok).toBe(true);
      const id = state.trains[state.trains.length - 1]!.id;
      setOrders(state, id, [
        { stationId: a!.id, rule: "passThrough" },
        { stationId: b!.id, rule: "passThrough" },
      ]);
      return id;
    };
    const slowId = launch("grasshopper-0-4-0");
    for (let i = 0; i < 150; i++) stepTrains(state);
    const fastId = launch("american-4-4-0");
    const slow = state.trains.find((t) => t.id === slowId)!;
    const fast = state.trains.find((t) => t.id === fastId)!;

    const speeds: number[] = [];
    let minGap = Infinity;
    let following = 0;
    for (let i = 0; i < 400 && slow.status !== "loading"; i++) {
      stepTrains(state);
      const found = nearestLeader(fast, state.trains);
      if (found && found.leader === slow) {
        minGap = Math.min(minGap, found.gap);
        following++;
        speeds.push(fast.speed);
      }
    }
    expect(following).toBeGreaterThan(40);
    expect(minGap).toBeGreaterThanOrEqual(FOLLOW_MIN_GAP_TILES - 0.05);

    // After it has caught up (speed within 2 km/h of the leader's), acceleration never flips sign
    // by more than a whisker.
    const settledAt = speeds.findIndex((v) => Math.abs(v - slow.speed) < 2);
    expect(settledAt).toBeGreaterThanOrEqual(0);
    let flips = 0;
    let prev = 0;
    for (let i = settledAt + 1; i < speeds.length; i++) {
      const acc = speeds[i]! - speeds[i - 1]!;
      if (Math.abs(acc) < 0.5) continue;
      if (prev !== 0 && Math.sign(acc) !== Math.sign(prev)) flips++;
      prev = acc;
    }
    expect(flips).toBe(0);
  });
});

/** PLAN Phase 18 A: a new edge must be able to connect legally (≤45°) to track already at its ends. */
import { describe, expect, it } from "vitest";
import {
  buildStation,
  buildTrack,
  computeBuildPlan,
  upgradeTrack,
} from "../../../src/sim/commands";
import { findBuildPath } from "../../../src/sim/track/pathfind";
import { makeTestMap, makeTestState, tileAt } from "./helpers";

function setup() {
  const map = makeTestMap(Array.from({ length: 12 }, () => "p".repeat(14)));
  const state = makeTestState(map, { startYear: 1900, cash: 1e12 });
  const at = (x: number, y: number) => tileAt(map, x, y);
  return { map, state, at };
}

describe("sharp turns across existing track", () => {
  it("rejects a hairpin built in three parts", () => {
    const { state, at } = setup();
    // Part 1: east. Part 2: a 90° corner at the end of part 1. Both are legal-looking on their own.
    expect(buildTrack(state, [at(1, 5), at(2, 5), at(3, 5), at(4, 5)]).ok).toBe(true);
    const corner = buildTrack(state, [at(4, 5), at(4, 4), at(4, 3)]);
    expect(corner).toEqual({ ok: false, reason: "sharpTurn" });
    // A hairpin back on itself (135°+ reversal) is just as sharp.
    expect(buildTrack(state, [at(4, 5), at(3, 4), at(2, 3)])).toEqual({
      ok: false,
      reason: "sharpTurn",
    });
    // Nothing was added.
    expect(state.trackGraph.hasEdge(at(4, 5), at(4, 4))).toBe(false);
  });

  it("rejects a sharp corner inside a single drag", () => {
    const { state, at } = setup();
    expect(buildTrack(state, [at(1, 5), at(2, 5), at(3, 5), at(3, 4), at(3, 3)])).toEqual({
      ok: false,
      reason: "sharpTurn",
    });
  });

  it("still builds curves made of 45° bends", () => {
    const { state, at } = setup();
    expect(buildTrack(state, [at(1, 5), at(2, 5), at(3, 5)]).ok).toBe(true);
    expect(buildTrack(state, [at(3, 5), at(4, 4), at(4, 3), at(4, 2)]).ok).toBe(true);
  });

  it("allows a normal Y-junction: sharp against one leg, legal against the other", () => {
    const { state, at } = setup();
    expect(buildTrack(state, [at(1, 5), at(2, 5), at(3, 5), at(4, 5), at(5, 5)]).ok).toBe(true);
    // Branch off the middle at 45°.
    expect(buildTrack(state, [at(3, 5), at(4, 4), at(5, 3)]).ok).toBe(true);
    // And the mirror image, leaving the other way.
    expect(buildTrack(state, [at(3, 5), at(2, 6), at(1, 7)]).ok).toBe(true);
  });

  it("allows a turnout off double track", () => {
    const { state, at } = setup();
    const main = [at(1, 5), at(2, 5), at(3, 5), at(4, 5), at(5, 5)];
    expect(buildTrack(state, main).ok).toBe(true);
    expect(upgradeTrack(state, main).ok).toBe(true);
    expect(buildTrack(state, [at(3, 5), at(4, 4), at(5, 3)]).ok).toBe(true);
  });

  it("rejects a 90° branch off a straight line", () => {
    const { state, at } = setup();
    expect(buildTrack(state, [at(1, 5), at(2, 5), at(3, 5)]).ok).toBe(true);
    expect(buildTrack(state, [at(2, 5), at(2, 4)])).toEqual({ ok: false, reason: "sharpTurn" });
  });

  it("lets a station tile keep allowing reversal", () => {
    const { state, at } = setup();
    expect(buildTrack(state, [at(1, 5), at(2, 5), at(3, 5), at(4, 5)]).ok).toBe(true);
    expect(buildStation(state, at(4, 5), "station").ok).toBe(true);
    // A 90° and a hairpin spur at a station tile: trains reverse there anyway.
    expect(buildTrack(state, [at(4, 5), at(4, 4), at(4, 3)]).ok).toBe(true);
  });

  it("the plan names the offending step for the preview", () => {
    const { state, at } = setup();
    buildTrack(state, [at(1, 5), at(2, 5), at(3, 5)]);
    const plan = computeBuildPlan(state, [at(3, 5), at(3, 4), at(3, 3)]);
    expect(plan.valid).toBe(false);
    expect(plan.sharpSteps.map((s) => [s.a, s.b])).toContainEqual([at(3, 5), at(3, 4)]);
  });

  it("the build pathfinder routes around a sharp join when asked to respect turns", () => {
    const { state, map, at } = setup();
    buildTrack(state, [at(1, 5), at(2, 5), at(3, 5)]);
    const respectTurns = { graph: state.trackGraph, stationTiles: new Set<number>() };
    const path = findBuildPath(map, at(3, 5), at(3, 2), 1900, { respectTurns });
    expect(path).not.toBeNull();
    expect(computeBuildPlan(state, path as number[]).valid).toBe(true);
  });
});

/** PLAN Phase 33 item 2: an illegal drag gets the smallest legal connection proposed. */
import { describe, expect, it } from "vitest";
import { buildTrack, computeBuildPlan } from "../../../src/sim/commands";
import { suggestLegalConnection } from "../../../src/sim/trackSuggest";
import { findBuildPath } from "../../../src/sim/track/pathfind";
import { makeTestMap, makeTestState, tileAt } from "./helpers";

type Pt = [number, number];
const N = 40;

function setup() {
  const map = makeTestMap(Array.from({ length: N }, () => "p".repeat(N)));
  const state = makeTestState(map);
  const t = (p: Pt): number => tileAt(map, p[0], p[1]);
  const build = (pts: Pt[]): void => {
    expect(buildTrack(state, pts.map(t)).ok).toBe(true);
  };
  return { state, map, t, build };
}

const row = (y: number, x0: number, x1: number): Pt[] =>
  Array.from({ length: x1 - x0 + 1 }, (_, i) => [x0 + i, y]);

describe("suggestLegalConnection", () => {
  it("moves the join off a turnout that is too close, and the result builds", () => {
    const { state, t, build } = setup();
    build(row(10, 0, 39));
    // A turnout already leaves the main at (15,10) towards the south-east.
    build([
      [15, 10],
      [16, 11],
      [17, 12],
      [18, 13],
      [19, 14],
    ]);
    // The player drags south from the tile right beside it: a second junction one tile away breaks the spacing rule.
    const start = t([16, 10]);
    const goal = t([16, 24]);
    const direct = findBuildPath(state.map, start, goal, 1840, {
      respectTurns: { graph: state.trackGraph, stationTiles: new Set() },
    });
    expect(direct).not.toBeNull();
    expect(computeBuildPlan(state, direct as number[]).valid).toBe(false);

    const s = suggestLegalConnection(state, start, goal, 1840);
    expect(s).not.toBeNull();
    expect(s?.plan.valid).toBe(true);
    // "Smallest": it is not a detour — it ends within a few tiles of the goal.
    expect(s?.plan.toBuild.length).toBeLessThan(25);
    expect(buildTrack(state, s?.path as number[]).ok).toBe(true);
  });

  it("lets a drag end on an existing track tile and picks the legal join nearby", () => {
    const { state, t, build } = setup();
    build(row(10, 0, 39));
    build([
      [15, 10],
      [16, 11],
      [17, 12],
      [18, 13],
      [19, 14],
    ]);
    const start = t([30, 30]);
    const goal = t([16, 10]); // on the main, right beside the turnout
    const direct = findBuildPath(state.map, start, goal, 1840, {
      respectTurns: { graph: state.trackGraph, stationTiles: new Set() },
    });
    expect(computeBuildPlan(state, direct as number[]).valid).toBe(false);
    const s = suggestLegalConnection(state, start, goal, 1840);
    expect(s).not.toBeNull();
    expect(s?.plan.valid).toBe(true);
    const end = s?.path[s.path.length - 1] as number;
    expect(state.trackGraph.edgesAt(end).length).toBeGreaterThan(0);
    expect(buildTrack(state, s?.path as number[]).ok).toBe(true);
  });

  it("proposes nothing for a tap", () => {
    const { state, t } = setup();
    expect(suggestLegalConnection(state, t([5, 5]), t([5, 5]), 1840)).toBeNull();
  });
});

/** PLAN Phase 59 item 1: the owner's play-test 6 layout. Two diagonal lines cross in a V and a branch leaves the
 * NW-SE line; an E-W drag that joins the NW-SE line one diagonal step from that branch is refused by the junction
 * spacing rule (2 tiles between junctions) — a rule, not a bug: a 45° join itself is fine one step further along. */
import { describe, expect, it } from "vitest";
import { buildTrack, computeBuildPlan } from "../../../src/sim/commands";
import { suggestLegalConnection } from "../../../src/sim/trackSuggest";
import { makeTestMap, makeTestState, tileAt } from "./helpers";

type Pt = [number, number];
const N = 60;

function setup() {
  const map = makeTestMap(Array.from({ length: N }, () => "p".repeat(N)));
  const state = makeTestState(map);
  const t = (p: Pt): number => tileAt(map, p[0], p[1]);
  const build = (pts: Pt[]): void => {
    expect(buildTrack(state, pts.map(t)).ok).toBe(true);
  };
  // NW-SE line from (10,10), NE-SW line from (50,10); they cross at (30,30). A branch leaves the NW-SE line south at (20,20).
  build(Array.from({ length: 40 }, (_, i): Pt => [10 + i, 10 + i]));
  build(Array.from({ length: 40 }, (_, i): Pt => [50 - i, 10 + i]));
  build([
    [20, 20],
    [20, 21],
    [20, 22],
    [20, 23],
    [20, 24],
  ]);
  const drag = (y: number): number[] =>
    Array.from({ length: 60 - 2 * y + 1 }, (_, i) => t([y + i, y]));
  return { state, t, drag };
}

describe("a straight E-W join between two diagonal lines", () => {
  it("is legal where the join keeps 2 tiles from the branch junction", () => {
    const { state, drag } = setup();
    for (const y of [16, 17, 18, 22, 23]) {
      const plan = computeBuildPlan(state, drag(y));
      expect(plan.sharpSteps).toHaveLength(0);
      expect(plan.valid).toBe(true);
    }
  });

  it("is refused with the spacing reason one diagonal step from the junction", () => {
    const { state, drag } = setup();
    const plan = computeBuildPlan(state, drag(19));
    expect(plan.valid).toBe(false);
    expect(plan.sharpSteps).toHaveLength(0);
    expect(plan.layoutViolations[0]?.kind).toBe("junctionsTooClose");
  });

  it("suggests sliding the join along the same line, not another line", () => {
    const { state, drag } = setup();
    const path = drag(19);
    const s = suggestLegalConnection(
      state,
      path[0] as number,
      path[path.length - 1] as number,
      1840,
    );
    expect(s).not.toBeNull();
    expect(s?.plan.valid).toBe(true);
    const first = s?.path[0] as number;
    // It starts on the NW-SE line (x === y) within 2 tiles of the drag's own end, not on the S branch.
    expect(first % N).toBe(Math.floor(first / N));
    expect(Math.abs((first % N) - 19)).toBeLessThanOrEqual(2);
    expect(s?.plan.toBuild.length).toBeLessThanOrEqual(drag(19).length + 4);
  });
});

import { describe, expect, it } from "vitest";
import { buildTrack, upgradeTrack } from "../../../src/sim/commands";
import { computeConflictMap, legClearance } from "../../../src/sim/track/conflicts";
import { edgeKey } from "../../../src/sim/track/graph";
import { forceTrack, makeTestMap, makeTestState, tileAt } from "./helpers";

function world() {
  const map = makeTestMap(Array.from({ length: 12 }, () => "p".repeat(12)));
  return makeTestState(map, { startYear: 1900, cash: 1e9 });
}

describe("geometric conflict map (PLAN Phase 27 B)", () => {
  it("finds the mid-tile crossing of two diagonals with no shared node", () => {
    const s2 = world();
    const u = (x: number, y: number): number => tileAt(s2.map, x, y);
    expect(buildTrack(s2, [u(2, 2), u(3, 3)]).ok).toBe(true);
    forceTrack(s2, [
      [3, 2],
      [2, 3],
    ]);
    const map = computeConflictMap(s2.trackGraph, new Set(), 12, 12);
    expect(map.crossings.size).toBe(1);
    const e = s2.trackGraph.getEdge(u(2, 2), u(3, 3))!;
    expect(map.crossingsOnEdge.get(edgeKey(e.a, e.b))).toEqual([
      { id: 144 + 2 * 12 + 2, frac: 0.5 },
    ]);
  });

  it("needs more clearance for sharper legs and for double track", () => {
    expect(legClearance(1, 0)).toBeGreaterThan(legClearance(2, 0));
    expect(legClearance(2, 0)).toBeGreaterThan(0.3);
    expect(legClearance(1, 1)).toBeGreaterThan(legClearance(1, 0));
    expect(legClearance(4, 0)).toBeLessThanOrEqual(legClearance(2, 0));
  });

  it("gives a junction on a double diagonal main more clearance than one on single track", () => {
    const single = world();
    const dbl = world();
    for (const s of [single, dbl]) {
      const t = (x: number, y: number): number => tileAt(s.map, x, y);
      const main = [2, 3, 4, 5, 6].map((i) => t(i, i));
      expect(buildTrack(s, main).ok).toBe(true);
      expect(buildTrack(s, [t(4, 4), t(5, 4), t(6, 4)]).ok).toBe(true);
    }
    const dm = [2, 3, 4, 5, 6].map((i) => tileAt(dbl.map, i, i));
    expect(upgradeTrack(dbl, dm).ok).toBe(true);
    const node = tileAt(single.map, 4, 4);
    const a = computeConflictMap(single.trackGraph, new Set(), 12, 12).clearance.get(node)!;
    const b = computeConflictMap(dbl.trackGraph, new Set(), 12, 12).clearance.get(node)!;
    expect(b).toBeGreaterThan(a);
  });
});

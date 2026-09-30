/** PLAN Phase 27 A: build-time junction layout rules, with the player's Ljubljana layout reproduced. */
import { describe, expect, it } from "vitest";
import {
  buildStation,
  buildTrack,
  computeBuildPlan,
  upgradeTrack,
} from "../../../src/sim/commands";
import {
  junctionShape,
  findExistingLayoutIssues,
  findStationBends,
} from "../../../src/sim/track/layout";
import type { GameState } from "../../../src/sim/state";
import { makeTestMap, makeTestState, tileAt } from "./helpers";

const N = 24;

function world(): GameState {
  const map = makeTestMap(Array.from({ length: N }, () => "p".repeat(N)));
  return makeTestState(map, { startYear: 1900, cash: 1e9 });
}
const P = (s: GameState, pts: Array<[number, number]>): number[] =>
  pts.map(([x, y]) => tileAt(s.map, x, y));
const antiDiag = (x0: number, y0: number, n: number): Array<[number, number]> =>
  Array.from({ length: n }, (_, i) => [x0 - i, y0 + i] as [number, number]);
const diag = (x0: number, y0: number, n: number, dy = 1): Array<[number, number]> =>
  Array.from({ length: n }, (_, i) => [x0 + i, y0 + dy * i] as [number, number]);
const row = (y: number, x0: number, x1: number): Array<[number, number]> =>
  Array.from({ length: x1 - x0 + 1 }, (_, i) => [x0 + i, y] as [number, number]);

/** The player's diagonal double main (2,2)…(14,14) with a single branch joining at (5,5). */
function playerMain(): GameState {
  const s = world();
  const main = P(s, diag(2, 2, 13));
  expect(buildTrack(s, main).ok).toBe(true);
  expect(upgradeTrack(s, main).ok).toBe(true);
  expect(buildTrack(s, P(s, row(5, 5, 9))).ok).toBe(true);
  return s;
}

describe("station bends (PLAN Phase 28B, PLAYTEST-1 Bug 3)", () => {
  function terminus(): { s: GameState; st: ReadonlySet<number> } {
    const s = world();
    expect(buildTrack(s, P(s, row(10, 2, 10))).ok).toBe(true);
    expect(buildStation(s, tileAt(s.map, 10, 10), "station").ok).toBe(true);
    return { s, st: new Set([tileAt(s.map, 10, 10)]) };
  }

  it("flags an extension out of a station at more than 45° to how the line arrived", () => {
    const { s, st } = terminus();
    const sharp = P(s, [
      [10, 10],
      [10, 11],
      [10, 12],
    ]);
    const plan = computeBuildPlan(s, sharp);
    expect(findStationBends(s.trackGraph, N, st, plan.toBuild)).toEqual([tileAt(s.map, 10, 10)]);
    // Still buildable (trains can stop and reverse there) — a warning, not a refusal.
    expect(buildTrack(s, sharp).ok).toBe(true);
    expect(findExistingLayoutIssues(s.trackGraph, N, st)).toContainEqual({
      kind: "stationBend",
      tile: tileAt(s.map, 10, 10),
    });
  });

  it("straight and 45° extensions are fine", () => {
    const a = terminus();
    const straight = computeBuildPlan(a.s, P(a.s, row(10, 10, 14)));
    expect(findStationBends(a.s.trackGraph, N, a.st, straight.toBuild)).toEqual([]);
    const b = terminus();
    const diagonal = computeBuildPlan(b.s, P(b.s, diag(10, 10, 4)));
    expect(findStationBends(b.s.trackGraph, N, b.st, diagonal.toBuild)).toEqual([]);
  });
});

describe("layout rules (PLAN Phase 27 A)", () => {
  it("refuses a diagonal line crossing the diagonal main mid-tile, next to the branch", () => {
    const s = playerMain();
    const cross = P(s, antiDiag(13, 2, 12)); // x + y = 15
    const plan = computeBuildPlan(s, cross);
    expect(plan.valid).toBe(false);
    expect(plan.layoutViolations.some((v) => v.kind === "midTileCrossing")).toBe(true);
    expect(buildTrack(s, cross)).toEqual({ ok: false, reason: "midTileCrossing" });
    // Nothing was built.
    expect(s.trackGraph.hasEdge(cross[0]!, cross[1]!)).toBe(false);
  });

  it("builds the same line one tile over, crossing the main at a node (diamond X)", () => {
    const s = playerMain();
    const cross = P(s, antiDiag(14, 2, 12)); // x + y = 16, through (8,8)
    expect(computeBuildPlan(s, cross).layoutViolations).toEqual([]);
    expect(buildTrack(s, cross).ok).toBe(true);
    expect(s.trackGraph.neighborsOf(tileAt(s.map, 8, 8)).length).toBe(4);
  });

  it("refuses a branch joining the main one tile from an existing junction, allows two tiles away", () => {
    const s = playerMain(); // junction at (5,5)
    const tooClose = P(s, row(6, 6, 9));
    // (6,6) is one diagonal step from (5,5) on the main: joining there is < 2 tiles from the junction.
    expect(buildTrack(s, tooClose)).toEqual({ ok: false, reason: "junctionsTooClose" });
    const fine = P(s, row(7, 7, 11)); // joins at (7,7), 2.83 tiles from (5,5)
    expect(buildTrack(s, fine).ok).toBe(true);
  });

  it("refuses two branches on one side of a junction node, allows one per side", () => {
    const s = world();
    expect(buildTrack(s, P(s, row(8, 3, 14))).ok).toBe(true);
    // A NE branch off (7,8), then a NW branch off the same node: both on the north side.
    expect(
      buildTrack(
        s,
        P(s, [
          [7, 8],
          [8, 7],
          [9, 6],
          [10, 5],
        ]),
      ).ok,
    ).toBe(true);
    expect(
      buildTrack(
        s,
        P(s, [
          [7, 8],
          [6, 7],
          [5, 6],
          [4, 5],
        ]),
      ),
    ).toEqual({
      ok: false,
      reason: "tooManyBranches",
    });
    // One on the south side is fine (a 45° X over the straight line).
    expect(
      buildTrack(
        s,
        P(s, [
          [7, 8],
          [8, 9],
          [9, 10],
          [10, 11],
        ]),
      ).ok,
    ).toBe(true);
  });

  it("allows a symmetric Y fork and turnouts off a straight line", () => {
    expect(junctionShape([4, 1, 7])).toBe("ok"); // stem west, forks NE / SE... 4 = W, 1 = SE, 7 = NE
    expect(junctionShape([0, 4, 2])).toBe("ok"); // T
    expect(junctionShape([0, 4, 1, 7])).toBe("ok"); // turnout each side
    expect(junctionShape([0, 4, 2, 6])).toBe("ok"); // diamond
    expect(junctionShape([0, 4, 1, 2])).toBe("branches");
    expect(junctionShape([0, 3, 2])).toBe("bend");
  });

  it("applies to the quick path too: a legal branch builds, an illegal one changes nothing", () => {
    const s = playerMain();
    const before = s.trackGraph.edgeCount;
    const bad = P(s, antiDiag(13, 2, 12));
    expect(buildTrack(s, bad).ok).toBe(false);
    expect(s.trackGraph.edgeCount).toBe(before);
    expect(s.cash).toBeGreaterThan(0);
  });

  it("lists rule breaks already in the graph (old saves) without refusing unrelated builds", () => {
    const s = playerMain();
    // Force the player's crossing in directly, as an old save would contain it.
    for (let i = 0; i < 11; i++) {
      const a = tileAt(s.map, 13 - i, 2 + i);
      const b = tileAt(s.map, 12 - i, 3 + i);
      const lo = Math.min(a, b);
      const hi = Math.max(a, b);
      s.trackGraph.addEdge({
        a: lo,
        b: hi,
        direction: 3,
        double: false,
        electrified: false,
        bridge: null,
        bridgeSpan: [],
        cost: 0,
      });
    }
    const issues = findExistingLayoutIssues(s.trackGraph, N, new Set());
    expect(issues.some((i) => i.kind === "midTileCrossing")).toBe(true);
    // An unrelated build far away still works.
    expect(buildTrack(s, P(s, row(20, 2, 10))).ok).toBe(true);
  });
});

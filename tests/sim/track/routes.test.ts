import { describe, expect, it } from "vitest";
import { buildTrack } from "../../../src/sim/commands";
import { findTrainRoute } from "../../../src/sim/trains/route";
import { hasRoute, routesAt } from "../../../src/sim/track/routes";
import { makeTestMap, makeTestState, tileAt } from "./helpers";

function world() {
  const map = makeTestMap(Array.from({ length: 14 }, () => "p".repeat(14)));
  return makeTestState(map, { startYear: 1900, cash: 1e9 });
}

describe("explicit node routes (PLAN Phase 29 A)", () => {
  it("keeps the turnout when a line from the other side joins the node (the player's case)", () => {
    const s = world();
    const t = (x: number, y: number): number => tileAt(s.map, x, y);
    // Diagonal main, node at (6,6); branch to the right (east).
    expect(buildTrack(s, [t(3, 3), t(4, 4), t(5, 5), t(6, 6), t(7, 7), t(8, 8), t(9, 9)]).ok).toBe(
      true,
    );
    expect(buildTrack(s, [t(6, 6), t(7, 6), t(8, 6)]).ok).toBe(true);
    const g = s.trackGraph;
    expect(hasRoute(g, t(6, 6), t(5, 5), t(7, 6))).toBe(true);
    // A line from the left joins the same node.
    expect(buildTrack(s, [t(4, 6), t(5, 6), t(6, 6)]).ok).toBe(true);
    expect(hasRoute(g, t(6, 6), t(5, 6), t(7, 6))).toBe(true); // left -> right straight
    expect(hasRoute(g, t(6, 6), t(5, 5), t(7, 7))).toBe(true); // diagonal through
    expect(hasRoute(g, t(6, 6), t(5, 5), t(7, 6))).toBe(true); // the turnout survives (single slip)
    expect(hasRoute(g, t(6, 6), t(5, 6), t(7, 7))).toBe(false); // but no second slip
    expect(routesAt(g, t(6, 6))).toHaveLength(3);
    const opts = {
      stationTiles: new Set<number>(),
      incomingDirection: -1,
      weightClass: "heavy" as const,
    };
    const r = findTrainRoute(14, g, t(3, 3), t(8, 6), opts as never);
    expect(r).not.toBeNull();
    expect(r).toContain(t(7, 6));
  });
});

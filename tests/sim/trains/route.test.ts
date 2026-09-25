import { describe, expect, it } from "vitest";
import { TrackGraph } from "../../../src/sim/track/graph";
import { findTrainRoute, isElectrificationOnlyBlocker } from "../../../src/sim/trains/route";
import { addEdge, addStraightLine, tile } from "./helpers";

const WIDTH = 20;

function baseOptions(overrides: Partial<Parameters<typeof findTrainRoute>[4]> = {}) {
  return {
    weightClass: "medium" as const,
    electric: false,
    incomingDirection: -1,
    stationTiles: new Set<number>(),
    ...overrides,
  };
}

describe("findTrainRoute", () => {
  it("finds a straight route along plain track", () => {
    const g = new TrackGraph();
    addStraightLine(g, WIDTH, 0, 5, 3);
    const route = findTrainRoute(WIDTH, g, tile(WIDTH, 0, 3), tile(WIDTH, 5, 3), baseOptions());
    expect(route).toEqual([0, 1, 2, 3, 4, 5].map((x) => tile(WIDTH, x, 3)));
  });

  it("rejects a 90° turn (the 45° rule), routing around it instead", () => {
    const g = new TrackGraph();
    // A straight line east, then a hard 90° turn south at x=3 — not traversable — but a
    // diagonal-then-straight detour is available and should be preferred.
    addStraightLine(g, WIDTH, 0, 3, 3);
    addEdge(g, WIDTH, 3, 3, 3, 4); // 90° turn from east-heading — illegal through-route
    // Legal alternative: diagonal at x=2 down to (3,4) directly (45°), then continue.
    addEdge(g, WIDTH, 2, 3, 3, 4);
    addEdge(g, WIDTH, 3, 4, 3, 5);

    const route = findTrainRoute(WIDTH, g, tile(WIDTH, 0, 3), tile(WIDTH, 3, 5), baseOptions());
    expect(route).not.toBeNull();
    expect(route).toEqual([
      tile(WIDTH, 0, 3),
      tile(WIDTH, 1, 3),
      tile(WIDTH, 2, 3),
      tile(WIDTH, 3, 4),
      tile(WIDTH, 3, 5),
    ]);
  });

  it("returns null when only an illegal 90° turn connects start and goal", () => {
    const g = new TrackGraph();
    addStraightLine(g, WIDTH, 0, 3, 3);
    addEdge(g, WIDTH, 3, 3, 3, 4);
    const route = findTrainRoute(WIDTH, g, tile(WIDTH, 0, 3), tile(WIDTH, 3, 4), baseOptions());
    expect(route).toBeNull();
  });

  it("allows a 180° reversal at a station tile but not at a plain node", () => {
    const g = new TrackGraph();
    // A dead-end spur: 0 - 1 - 2 (station at 1), reachable only by going in and reversing.
    addStraightLine(g, WIDTH, 0, 2, 5);
    const stationTile = tile(WIDTH, 1, 5);

    // Starting already moving east (dir 0) and needing to reach tile 0 (west of start) requires a
    // reversal. Not allowed to reverse at the plain node (tile 2)...
    const throughPlainNode = findTrainRoute(
      WIDTH,
      g,
      tile(WIDTH, 2, 5),
      tile(WIDTH, 0, 5),
      baseOptions({ incomingDirection: 0 }),
    );
    expect(throughPlainNode).toBeNull();

    // ...but reversing right at the station tile itself is fine.
    const viaStation = findTrainRoute(
      WIDTH,
      g,
      stationTile,
      tile(WIDTH, 0, 5),
      baseOptions({ incomingDirection: 0, stationTiles: new Set([stationTile]) }),
    );
    expect(viaStation).toEqual([stationTile, tile(WIDTH, 0, 5)]);
  });

  it("a fresh route from a station may leave in either direction (unconstrained start)", () => {
    const g = new TrackGraph();
    addStraightLine(g, WIDTH, 0, 4, 2);
    const route = findTrainRoute(
      WIDTH,
      g,
      tile(WIDTH, 2, 2),
      tile(WIDTH, 0, 2),
      baseOptions({ incomingDirection: -1 }),
    );
    expect(route).toEqual([tile(WIDTH, 2, 2), tile(WIDTH, 1, 2), tile(WIDTH, 0, 2)]);
  });

  it("blocks a heavy loco from a wooden bridge", () => {
    const g = new TrackGraph();
    addEdge(g, WIDTH, 2, 2, 2, 4, { bridge: "wood", bridgeSpan: [tile(WIDTH, 2, 3)] });
    const heavy = findTrainRoute(
      WIDTH,
      g,
      tile(WIDTH, 2, 2),
      tile(WIDTH, 2, 4),
      baseOptions({ weightClass: "heavy" }),
    );
    expect(heavy).toBeNull();

    const medium = findTrainRoute(
      WIDTH,
      g,
      tile(WIDTH, 2, 2),
      tile(WIDTH, 2, 4),
      baseOptions({ weightClass: "medium" }),
    );
    expect(medium).toEqual([tile(WIDTH, 2, 2), tile(WIDTH, 2, 4)]);
  });

  it("requires every edge electrified for an electric loco", () => {
    const g = new TrackGraph();
    const e1 = addEdge(g, WIDTH, 0, 0, 1, 0);
    addEdge(g, WIDTH, 1, 0, 2, 0);
    e1.electrified = true;
    const route = findTrainRoute(
      WIDTH,
      g,
      tile(WIDTH, 0, 0),
      tile(WIDTH, 2, 0),
      baseOptions({ electric: true }),
    );
    expect(route).toBeNull();

    // Electrify the second edge too — now it should succeed.
    const secondEdge = g.getEdge(tile(WIDTH, 1, 0), tile(WIDTH, 2, 0));
    if (secondEdge) secondEdge.electrified = true;
    const route2 = findTrainRoute(
      WIDTH,
      g,
      tile(WIDTH, 0, 0),
      tile(WIDTH, 2, 0),
      baseOptions({ electric: true }),
    );
    expect(route2).toEqual([tile(WIDTH, 0, 0), tile(WIDTH, 1, 0), tile(WIDTH, 2, 0)]);
  });

  it("returns null when start and goal are disconnected", () => {
    const g = new TrackGraph();
    addStraightLine(g, WIDTH, 0, 2, 0);
    addStraightLine(g, WIDTH, 5, 7, 5);
    const route = findTrainRoute(WIDTH, g, tile(WIDTH, 0, 0), tile(WIDTH, 5, 5), baseOptions());
    expect(route).toBeNull();
  });
});

describe("isElectrificationOnlyBlocker", () => {
  it("is true when a route exists once electrification is dropped (PLAN Phase 8)", () => {
    const g = new TrackGraph();
    addStraightLine(g, WIDTH, 0, 3, 0); // none of it electrified
    const blocked = isElectrificationOnlyBlocker(
      WIDTH,
      g,
      tile(WIDTH, 0, 0),
      tile(WIDTH, 3, 0),
      baseOptions({ electric: true }),
    );
    expect(blocked).toBe(true);
  });

  it("is false once the route is fully electrified (no longer blocked at all)", () => {
    const g = new TrackGraph();
    addStraightLine(g, WIDTH, 0, 3, 0, {});
    for (let x = 0; x < 3; x++) {
      const edge = g.getEdge(tile(WIDTH, x, 0), tile(WIDTH, x + 1, 0));
      if (edge) edge.electrified = true;
    }
    const blocked = isElectrificationOnlyBlocker(
      WIDTH,
      g,
      tile(WIDTH, 0, 0),
      tile(WIDTH, 3, 0),
      baseOptions({ electric: true }),
    );
    expect(blocked).toBe(false);
  });

  it("is false when the network is genuinely disconnected (not just unelectrified)", () => {
    const g = new TrackGraph();
    addStraightLine(g, WIDTH, 0, 2, 0);
    addStraightLine(g, WIDTH, 5, 7, 5);
    const blocked = isElectrificationOnlyBlocker(
      WIDTH,
      g,
      tile(WIDTH, 0, 0),
      tile(WIDTH, 5, 5),
      baseOptions({ electric: true }),
    );
    expect(blocked).toBe(false);
  });

  it("is false for a non-electric loco (nothing to blame on electrification)", () => {
    const g = new TrackGraph();
    addStraightLine(g, WIDTH, 0, 3, 0);
    const blocked = isElectrificationOnlyBlocker(
      WIDTH,
      g,
      tile(WIDTH, 0, 0),
      tile(WIDTH, 3, 0),
      baseOptions({ electric: false }),
    );
    expect(blocked).toBe(false);
  });
});

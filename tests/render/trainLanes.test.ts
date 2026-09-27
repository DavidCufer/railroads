/**
 * PLAN Phase 16 (Play-test 2, Part A): "double-track lane offset puts two opposing trains'
 * vehicles >= 0.2 tile apart when passing" — a render-geometry unit test, no DOM/canvas needed
 * since `curvedRouteSample` (src/render/trains.ts) returns plain tile-space coordinates.
 */
import { describe, expect, it } from "vitest";
import { curvedRouteSample } from "../../src/render/trains";
import { DOUBLE_TRACK_SPACING_TILES } from "../../src/render/trackPath";
import { TrackGraph } from "../../src/sim/track/graph";
import type { TrackEdge } from "../../src/sim/track/types";

const EAST = 0;

/** A straight row of `length` tiles (0..length-1), every edge double — chained so the middle
 * edges have a double neighbor on both sides (no single<->double taper reducing the separation). */
function straightDoubleTrack(length: number): TrackGraph {
  const graph = new TrackGraph();
  for (let x = 0; x < length - 1; x++) {
    const edge: TrackEdge = {
      a: x,
      b: x + 1,
      direction: EAST,
      double: true,
      electrified: false,
      bridge: null,
      bridgeSpan: [],
      cost: 0,
    };
    graph.addEdge(edge);
  }
  return graph;
}

describe("curvedRouteSample: double-track lane offset", () => {
  it("puts two opposing trains at the same physical spot >= 0.2 tile apart", () => {
    const mapWidth = 5;
    const graph = straightDoubleTrack(mapWidth);

    // Both trains "meet" at the same point on edge 2->3 (a middle edge, double neighbors on both
    // sides so the lane offset is fully eased in, not tapering toward 0).
    const forward = curvedRouteSample(mapWidth, graph, [2, 3], 0, 0.5);
    const reverse = curvedRouteSample(mapWidth, graph, [3, 2], 0, 0.5);

    const distance = Math.hypot(forward.x - reverse.x, forward.y - reverse.y);
    expect(distance).toBeGreaterThanOrEqual(0.2);
    expect(distance).toBeCloseTo(DOUBLE_TRACK_SPACING_TILES, 6);
  });

  it("single track (edge.double = false) keeps both directions on the same centerline", () => {
    const mapWidth = 3;
    const graph = new TrackGraph();
    graph.addEdge({
      a: 0,
      b: 1,
      direction: EAST,
      double: false,
      electrified: false,
      bridge: null,
      bridgeSpan: [],
      cost: 0,
    });

    const forward = curvedRouteSample(mapWidth, graph, [0, 1], 0, 0.5);
    const reverse = curvedRouteSample(mapWidth, graph, [1, 0], 0, 0.5);

    expect(Math.hypot(forward.x - reverse.x, forward.y - reverse.y)).toBeCloseTo(0, 6);
  });

  it("eases the lane offset down to 0 right at a single<->double transition", () => {
    const mapWidth = 3;
    const graph = new TrackGraph();
    graph.addEdge({
      a: 0,
      b: 1,
      direction: EAST,
      double: false,
      electrified: false,
      bridge: null,
      bridgeSpan: [],
      cost: 0,
    });
    graph.addEdge({
      a: 1,
      b: 2,
      direction: EAST,
      double: true,
      electrified: false,
      bridge: null,
      bridgeSpan: [],
      cost: 0,
    });

    // Right at the transition node (progress 0 on the double edge, starting from the single side),
    // the reverse-direction train's lane offset should have eased down to ~0 (merged with the
    // through track), not jumped straight to the full separation.
    const atTransition = curvedRouteSample(mapWidth, graph, [2, 1], 0, 1);
    const throughAtSameSpot = curvedRouteSample(mapWidth, graph, [1, 2], 0, 0);
    expect(
      Math.hypot(atTransition.x - throughAtSameSpot.x, atTransition.y - throughAtSameSpot.y),
    ).toBeCloseTo(0, 3);

    // A tile further into the double section (away from the transition), the separation should be
    // meaningfully open again.
    const midway = curvedRouteSample(mapWidth, graph, [2, 1], 0, 0.5);
    const throughMidway = curvedRouteSample(mapWidth, graph, [1, 2], 0, 0.5);
    expect(Math.hypot(midway.x - throughMidway.x, midway.y - throughMidway.y)).toBeGreaterThan(0.1);
  });
});

/** PLAN Phase 16.1 (play-test 3: "the two tracks pinch together in a sharp kink right at the
 * station tile"): a double edge ending at a station must NOT taper down to 0 at the station —
 * unlike the plain mid-line transition case above, which pinches to 0 exactly at the shared node. */
describe("curvedRouteSample: passing-loop stations (Phase 16.1)", () => {
  it("keeps full lane separation right at a station, instead of pinching to 0 there", () => {
    const mapWidth = 5;
    const graph = new TrackGraph();
    // D(0) =double= S(1) -single- N(2); S is a station with double track on one side.
    graph.addEdge({
      a: 0,
      b: 1,
      direction: EAST,
      double: true,
      electrified: false,
      bridge: null,
      bridgeSpan: [],
      cost: 0,
    });
    graph.addEdge({
      a: 1,
      b: 2,
      direction: EAST,
      double: false,
      electrified: false,
      bridge: null,
      bridgeSpan: [],
      cost: 0,
    });
    const stationTiles = new Set([1]);

    // The reverse-direction (diverging-lane) train arriving at the station, on the double edge.
    const atStation = curvedRouteSample(mapWidth, graph, [1, 0], 0, 0, stationTiles);
    const throughAtStation = curvedRouteSample(mapWidth, graph, [0, 1], 0, 1, stationTiles);
    const separation = Math.hypot(
      atStation.x - throughAtStation.x,
      atStation.y - throughAtStation.y,
    );
    expect(separation).toBeCloseTo(DOUBLE_TRACK_SPACING_TILES, 6);

    // Without station awareness (the pre-16.1 behavior, an empty station set), the same point
    // pinches to 0 — demonstrating this is actually the station, not just a generally-wider taper.
    const atStationNoStation = curvedRouteSample(mapWidth, graph, [1, 0], 0, 0);
    const throughNoStation = curvedRouteSample(mapWidth, graph, [0, 1], 0, 1);
    expect(
      Math.hypot(
        atStationNoStation.x - throughNoStation.x,
        atStationNoStation.y - throughNoStation.y,
      ),
    ).toBeCloseTo(0, 6);
  });
});

describe("curvedRouteSample: no fillet through a station tile (Phase 16.1)", () => {
  it("draws straight through a station even at what would otherwise be a 45° fillet bend", () => {
    // Same junction geometry as trackPath.test.ts's own chaining test: edge (5,6) direction E,
    // edge (6,27) direction SE, W=20 — a valid 45°-bend partner at node 6.
    const mapWidth = 20;
    const graph = new TrackGraph();
    graph.addEdge({
      a: 5,
      b: 6,
      direction: EAST,
      double: false,
      electrified: false,
      bridge: null,
      bridgeSpan: [],
      cost: 0,
    });
    graph.addEdge({
      a: 6,
      b: 27,
      direction: 1, // SE
      double: false,
      electrified: false,
      bridge: null,
      bridgeSpan: [],
      cost: 0,
    });

    const bent = curvedRouteSample(mapWidth, graph, [5, 6, 27], 0, 1);
    const straightThroughStation = curvedRouteSample(
      mapWidth,
      graph,
      [5, 6, 27],
      0,
      1,
      new Set([6]),
    );

    // Without the station, the route fillets and arrives short of tile 6's exact center.
    expect(Math.hypot(bent.x - 6.5, bent.y - 0.5)).toBeGreaterThan(0.01);
    // With node 6 marked a station, no fillet is drawn there — the route reaches the tile center.
    expect(straightThroughStation.x).toBeCloseTo(6.5, 6);
    expect(straightThroughStation.y).toBeCloseTo(0.5, 6);
  });
});

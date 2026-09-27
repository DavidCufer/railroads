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

import { describe, expect, it } from "vitest";
import { findBuildPath } from "../../../src/sim/track/pathfind";
import { TrackGraph } from "../../../src/sim/track/graph";
import type { TrackEdge } from "../../../src/sim/track/types";
import { makeTestMap, tileAt } from "./helpers";

describe("findBuildPath", () => {
  it("finds a direct straight path across open plain", () => {
    const map = makeTestMap(["ppppp"]);
    const path = findBuildPath(map, tileAt(map, 0, 0), tileAt(map, 4, 0), 1830);
    expect(path).toEqual([0, 1, 2, 3, 4].map((x) => tileAt(map, x, 0)));
  });

  it("can't build straight onto water without a bridge, but a river bridge lets it cross", () => {
    const map = makeTestMap(["pprpp"]);
    const path = findBuildPath(map, tileAt(map, 0, 0), tileAt(map, 4, 0), 1830);
    expect(path).not.toBeNull();
    // The river tile itself is never a node — the bridge jumps straight from shore to shore.
    expect(path).not.toContain(tileAt(map, 2, 0));
    expect(path?.[0]).toBe(tileAt(map, 0, 0));
    expect(path?.[path.length - 1]).toBe(tileAt(map, 4, 0));
  });

  it("returns null when the water crossing exceeds every bridge type's max span for the era", () => {
    const map = makeTestMap(["pwwwwwwwwp"]); // 8 water tiles — too long for steel before 1870
    const path = findBuildPath(map, tileAt(map, 0, 0), tileAt(map, 9, 0), 1860);
    expect(path).toBeNull();
  });

  it("finds a bridge once steel (era 1870, max 8 tiles) makes a long water span legal", () => {
    const map = makeTestMap(["pwwwwwwwwp"]);
    const path = findBuildPath(map, tileAt(map, 0, 0), tileAt(map, 9, 0), 1870);
    expect(path).toEqual([tileAt(map, 0, 0), tileAt(map, 9, 0)]);
  });

  it("prefers a cheap land detour over an expensive bridge when one exists", () => {
    // A direct route north crosses a river; going around via the south row is all plain and
    // cheaper overall despite being longer, so the pathfinder should prefer it.
    const map = makeTestMap(["prp", "ppp"]);
    const path = findBuildPath(map, tileAt(map, 0, 0), tileAt(map, 2, 0), 1830);
    expect(path).not.toBeNull();
    expect(path).not.toContain(tileAt(map, 1, 0)); // doesn't route through the river tile's row
  });

  it("Double mode: follows only existing single track, ignoring cheaper terrain shortcuts", () => {
    const map = makeTestMap(["ppppp"]);
    const graph = new TrackGraph();
    const mkEdge = (ax: number, bx: number): TrackEdge => ({
      a: tileAt(map, ax, 0),
      b: tileAt(map, bx, 0),
      direction: 0,
      double: false,
      electrified: false,
      bridge: null,
      bridgeSpan: [],
      cost: 1000,
    });
    graph.addEdge(mkEdge(0, 1));
    graph.addEdge(mkEdge(1, 2));
    graph.addEdge(mkEdge(2, 3));
    // No edge (3,4) exists — Double mode must not "discover" a new one even on flat plain.
    const path = findBuildPath(map, tileAt(map, 0, 0), tileAt(map, 4, 0), 1830, {
      existingTrackOnly: graph,
    });
    expect(path).toBeNull();
  });

  it("Double mode: reaches the far end of an existing chain of single track", () => {
    const map = makeTestMap(["ppppp"]);
    const graph = new TrackGraph();
    const mkEdge = (ax: number, bx: number): TrackEdge => ({
      a: tileAt(map, ax, 0),
      b: tileAt(map, bx, 0),
      direction: 0,
      double: false,
      electrified: false,
      bridge: null,
      bridgeSpan: [],
      cost: 1000,
    });
    graph.addEdge(mkEdge(0, 1));
    graph.addEdge(mkEdge(1, 2));
    const path = findBuildPath(map, tileAt(map, 0, 0), tileAt(map, 2, 0), 1830, {
      existingTrackOnly: graph,
    });
    expect(path).toEqual([tileAt(map, 0, 0), tileAt(map, 1, 0), tileAt(map, 2, 0)]);
  });

  it("Double mode: an already-double edge isn't offered again", () => {
    const map = makeTestMap(["ppp"]);
    const graph = new TrackGraph();
    graph.addEdge({
      a: tileAt(map, 0, 0),
      b: tileAt(map, 1, 0),
      direction: 0,
      double: true,
      electrified: false,
      bridge: null,
      bridgeSpan: [],
      cost: 1000,
    });
    const path = findBuildPath(map, tileAt(map, 0, 0), tileAt(map, 1, 0), 1830, {
      existingTrackOnly: graph,
    });
    expect(path).toBeNull();
  });
});

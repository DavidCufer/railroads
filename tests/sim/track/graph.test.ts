import { describe, expect, it } from "vitest";
import { directionIndex, directionSteps, edgeKey, TrackGraph } from "../../../src/sim/track/graph";
import type { TrackEdge } from "../../../src/sim/track/types";

function edge(a: number, b: number, overrides: Partial<TrackEdge> = {}): TrackEdge {
  return {
    a: Math.min(a, b),
    b: Math.max(a, b),
    direction: 0,
    double: false,
    electrified: false,
    bridge: null,
    bridgeSpan: [],
    cost: 1000,
    ...overrides,
  };
}

describe("edgeKey", () => {
  it("is order-independent", () => {
    expect(edgeKey(3, 9)).toBe(edgeKey(9, 3));
  });
});

describe("directionIndex / directionSteps", () => {
  it("maps unit vectors to the matching DIRS8 index", () => {
    expect(directionIndex(1, 0)).toBe(0); // E
    expect(directionIndex(0, 1)).toBe(2); // S
    expect(directionIndex(-1, 0)).toBe(4); // W
    expect(directionIndex(0, -1)).toBe(6); // N
  });

  it("reduces a longer bridge-length step to its unit direction", () => {
    expect(directionIndex(5, 0)).toBe(0);
    expect(directionIndex(0, -3)).toBe(6);
  });

  it("throws for a zero step (no direction)", () => {
    expect(() => directionIndex(0, 0)).toThrow();
  });

  it("directionSteps is the shortest angular distance in 45° steps", () => {
    expect(directionSteps(0, 0)).toBe(0);
    expect(directionSteps(0, 1)).toBe(1);
    expect(directionSteps(0, 4)).toBe(4); // opposite
    expect(directionSteps(0, 7)).toBe(1); // wraps around
    expect(directionSteps(1, 6)).toBe(3);
  });
});

describe("TrackGraph", () => {
  it("adds and queries an edge from either endpoint", () => {
    const g = new TrackGraph();
    g.addEdge(edge(1, 2));
    expect(g.hasEdge(1, 2)).toBe(true);
    expect(g.hasEdge(2, 1)).toBe(true);
    expect(g.getEdge(2, 1)?.a).toBe(1);
    expect(g.neighborsOf(1)).toEqual([2]);
    expect(g.neighborsOf(2)).toEqual([1]);
  });

  it("removes an edge and cleans up empty adjacency entries", () => {
    const g = new TrackGraph();
    g.addEdge(edge(1, 2));
    const removed = g.removeEdge(1, 2);
    expect(removed?.a).toBe(1);
    expect(g.hasEdge(1, 2)).toBe(false);
    expect(g.hasTrack(1)).toBe(false);
    expect(g.hasTrack(2)).toBe(false);
  });

  it("removing a non-existent edge is a no-op that returns undefined", () => {
    const g = new TrackGraph();
    expect(g.removeEdge(1, 2)).toBeUndefined();
  });

  it("edgesAt returns every edge incident to a junction node", () => {
    const g = new TrackGraph();
    g.addEdge(edge(1, 2));
    g.addEdge(edge(2, 3));
    g.addEdge(edge(2, 9));
    expect(g.edgesAt(2)).toHaveLength(3);
    expect(g.edgesAt(1)).toHaveLength(1);
  });

  it("allNodes / allEdges / edgeCount reflect current contents", () => {
    const g = new TrackGraph();
    g.addEdge(edge(1, 2));
    g.addEdge(edge(2, 3));
    expect(g.edgeCount).toBe(2);
    expect(g.allEdges()).toHaveLength(2);
    expect(new Set(g.allNodes())).toEqual(new Set([1, 2, 3]));
  });

  it("a tile with no track is not a node", () => {
    const g = new TrackGraph();
    g.addEdge(edge(1, 2));
    expect(g.hasTrack(5)).toBe(false);
  });
});

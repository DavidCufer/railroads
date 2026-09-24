import { describe, expect, it } from "vitest";
import { TrackGraph } from "../../../src/sim/track/graph";
import { canTraverse, hasSharpJunction, turnAllowed } from "../../../src/sim/track/turn";
import type { TrackEdge } from "../../../src/sim/track/types";

function edge(a: number, b: number, direction: number): TrackEdge {
  return {
    a: Math.min(a, b),
    b: Math.max(a, b),
    direction,
    double: false,
    electrified: false,
    bridge: null,
    bridgeSpan: [],
    cost: 1000,
  };
}

describe("turnAllowed", () => {
  it("allows a straight continuation (0°) and a 45° turn", () => {
    expect(turnAllowed(0, 0)).toBe(true);
    expect(turnAllowed(0, 1)).toBe(true);
    expect(turnAllowed(0, 7)).toBe(true); // 45° the other way
  });

  it("rejects 90° and sharper turns", () => {
    expect(turnAllowed(0, 2)).toBe(false);
    expect(turnAllowed(0, 3)).toBe(false);
    expect(turnAllowed(0, 4)).toBe(false); // reversal
  });
});

describe("canTraverse", () => {
  const width = 5;
  const tile = (x: number, y: number): number => y * width + x;

  it("a straight east-then-east path is traversable", () => {
    expect(canTraverse(tile(0, 2), tile(1, 2), tile(2, 2), width)).toBe(true);
  });

  it("a gentle 45° bend is traversable", () => {
    expect(canTraverse(tile(0, 2), tile(1, 2), tile(2, 1), width)).toBe(true);
  });

  it("a 90° turn is not traversable", () => {
    expect(canTraverse(tile(0, 2), tile(1, 2), tile(1, 1), width)).toBe(false);
  });

  it("reversing back the way you came is not traversable", () => {
    expect(canTraverse(tile(0, 2), tile(1, 2), tile(0, 2), width)).toBe(false);
  });
});

describe("hasSharpJunction", () => {
  // `direction` on an edge is the absolute compass direction from its `a` end to its `b` end
  // (see track/graph.ts); imagine node 1 west of node 2, node 3 east of node 2, node 9 south.

  it("a straight-through node (two opposite legs) has no sharp junction", () => {
    const g = new TrackGraph();
    g.addEdge(edge(1, 2, 0)); // 1 -> 2 heads east
    g.addEdge(edge(2, 3, 0)); // 2 -> 3 heads east
    expect(hasSharpJunction(g, 2)).toBe(false);
  });

  it("a gentle 45° through-node has no sharp junction", () => {
    const g = new TrackGraph();
    g.addEdge(edge(1, 2, 0)); // 1 -> 2 heads east
    g.addEdge(edge(2, 3, 7)); // 2 -> 3 heads northeast: a 135° bend at node 2, still a valid through-route
    expect(hasSharpJunction(g, 2)).toBe(false);
  });

  it("a 90° branch off a straight line is a sharp junction", () => {
    const g = new TrackGraph();
    g.addEdge(edge(1, 2, 0)); // 1 -> 2 heads east
    g.addEdge(edge(2, 3, 0)); // 2 -> 3 heads east
    g.addEdge(edge(2, 9, 2)); // 2 -> 9 heads south — 90° from both legs above
    expect(hasSharpJunction(g, 2)).toBe(true);
  });

  it("a dead end (single edge) is never a sharp junction", () => {
    const g = new TrackGraph();
    g.addEdge(edge(1, 2, 0));
    expect(hasSharpJunction(g, 1)).toBe(false);
  });
});

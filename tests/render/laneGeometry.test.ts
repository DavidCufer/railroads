/**
 * PLAN Phase 17 B: the general lane model (`src/render/laneGeometry.ts`) — one centerline per
 * strand, lane half-width `w(s)` eased over TURNOUT_EASE_TILES, junction connectors, and route
 * paths that match the drawn rails.
 */
import { describe, expect, it } from "vitest";
import {
  LANE_HALF_TILES,
  buildLanePath,
  buildRouteLanePath,
  buildTrackStrands,
  type GeomEnv,
} from "../../src/render/laneGeometry";
import { DOUBLE_TRACK_SPACING_TILES, TURNOUT_EASE_TILES } from "../../src/render/trackPath";
import { TrackGraph, directionIndex } from "../../src/sim/track/graph";

const W = 40;
const t = (x: number, y: number): number => y * W + x;

function addEdge(graph: TrackGraph, p: number, q: number, double = false): void {
  const a = Math.min(p, q);
  const b = Math.max(p, q);
  graph.addEdge({
    a,
    b,
    direction: directionIndex((b % W) - (a % W), Math.floor(b / W) - Math.floor(a / W)),
    double,
    electrified: false,
    bridge: null,
    bridgeSpan: [],
    cost: 0,
  });
}

function chainGraph(nodes: number[], doubleFlags: boolean[] = []): TrackGraph {
  const graph = new TrackGraph();
  for (let i = 0; i + 1 < nodes.length; i++) {
    addEdge(graph, nodes[i] as number, nodes[i + 1] as number, doubleFlags[i] ?? false);
  }
  return graph;
}

const env = (graph: TrackGraph, stations: number[] = []): GeomEnv => ({
  mapWidth: W,
  graph,
  stationTiles: new Set(stations),
});

describe("LanePath.halfWidthAt", () => {
  const straight = (n: number): number[] => Array.from({ length: n }, (_, i) => t(3 + i, 10));

  it("is 0 on single track", () => {
    const nodes = straight(6);
    const lane = buildLanePath(env(chainGraph(nodes)), { nodes });
    expect(lane.halfWidthAt(1.7)).toBe(0);
  });

  it("eases a double run smoothly to a single track over TURNOUT_EASE_TILES, spanning edges", () => {
    // single, single, then double x6: transition node at index 2.
    const nodes = straight(9);
    const flags = [false, false, true, true, true, true, true, true];
    const lane = buildLanePath(env(chainGraph(nodes, flags)), { nodes });
    const at = (d: number): number => lane.halfWidthAt((lane.nodeS[2] as number) + d);
    expect(at(0)).toBe(0);
    expect(at(TURNOUT_EASE_TILES / 2)).toBeCloseTo(LANE_HALF_TILES / 2, 9);
    expect(at(TURNOUT_EASE_TILES)).toBeCloseTo(LANE_HALF_TILES, 9);
    expect(at(TURNOUT_EASE_TILES + 1)).toBeCloseTo(LANE_HALF_TILES, 9);
    // The ease is longer than one 1-tile edge: still partial at the far node of the first edge.
    expect(at(1)).toBeGreaterThan(0);
    expect(at(1)).toBeLessThan(LANE_HALF_TILES);
  });

  it("a short double stub between single track peaks lower instead of overshooting", () => {
    const nodes = straight(7);
    const flags = [false, false, true, false, false, false];
    const lane = buildLanePath(env(chainGraph(nodes, flags)), { nodes });
    let max = 0;
    for (let s = 0; s <= lane.length; s += 0.02) max = Math.max(max, lane.halfWidthAt(s));
    expect(max).toBeLessThanOrEqual(LANE_HALF_TILES);
    expect(lane.halfWidthAt(lane.nodeS[2] as number)).toBe(0);
    expect(lane.halfWidthAt(lane.nodeS[3] as number)).toBe(0);
  });
});

describe("buildLanePath", () => {
  // East along y=10, then a 45° bend down-right, then east-southeast... (E, E, SE, SE, E)
  const nodes = [t(5, 10), t(6, 10), t(7, 10), t(8, 11), t(9, 12), t(10, 12), t(11, 12)];
  const graph = chainGraph(nodes);
  const lane = buildLanePath(env(graph), { nodes });

  it("is continuous in position and heading", () => {
    const step = 0.02;
    let prev = lane.centerAt(0);
    for (let s = step; s <= lane.length; s += step) {
      const p = lane.centerAt(s);
      expect(Math.hypot(p.x - prev.x, p.y - prev.y)).toBeLessThan(step * 1.05);
      let dAngle = Math.abs(p.angle - prev.angle);
      if (dAngle > Math.PI) dAngle = Math.PI * 2 - dAngle;
      expect(dAngle).toBeLessThan(0.05);
      prev = p;
    }
  });

  it("node positions lie on the path (fillet midpoint within 0.11 tile, straight nodes exact)", () => {
    nodes.forEach((n, k) => {
      const p = lane.centerAt(lane.nodeS[k] as number);
      const dist = Math.hypot(p.x - ((n % W) + 0.5), p.y - (Math.floor(n / W) + 0.5));
      expect(dist).toBeLessThan(0.11);
    });
    expect(lane.centerAt(lane.nodeS[1] as number).x).toBeCloseTo(6.5, 9);
    expect(lane.nodeS[nodes.length - 1]).toBeCloseTo(lane.length, 9);
  });

  it("extends straight beyond either end", () => {
    const before = lane.centerAt(-1);
    expect(before.x).toBeCloseTo(4.5, 9);
    expect(before.y).toBeCloseTo(10.5, 9);
  });
});

describe("double track on a curve", () => {
  const nodes = [t(5, 10), t(6, 10), t(7, 10), t(8, 11), t(9, 12), t(10, 12), t(11, 12), t(12, 12)];
  // Double on the two edges around the bend, single at both ends: the transitions overlap arcs.
  const graph = chainGraph(nodes, [false, true, true, true, true, true, false]);
  const lane = buildLanePath(env(graph), { nodes });

  it("lane half-width is continuous, bounded and never exceeds the lane half-spacing", () => {
    let prev = lane.halfWidthAt(0);
    for (let s = 0.01; s <= lane.length; s += 0.01) {
      const w = lane.halfWidthAt(s);
      expect(w).toBeGreaterThanOrEqual(0);
      expect(w).toBeLessThanOrEqual(LANE_HALF_TILES + 1e-9);
      expect(Math.abs(w - prev)).toBeLessThan(0.01); // smooth: no jumps
      prev = w;
    }
  });

  it("the two lanes never cross or swap sides (no tie fans / X)", () => {
    for (let s = 0; s <= lane.length; s += 0.02) {
      const c = lane.centerAt(s);
      const a = lane.laneAt(s, 1);
      const b = lane.laneAt(s, -1);
      // Signed distance along the centerline's left normal.
      const na = -(a.x - c.x) * Math.sin(c.angle) + (a.y - c.y) * Math.cos(c.angle);
      const nb = -(b.x - c.x) * Math.sin(c.angle) + (b.y - c.y) * Math.cos(c.angle);
      expect(na).toBeGreaterThanOrEqual(-1e-9);
      expect(nb).toBeLessThanOrEqual(1e-9);
    }
  });

  it("opposing trains are exactly DOUBLE_TRACK_SPACING_TILES apart where fully double", () => {
    const fwd = buildRouteLanePath(env(graph), nodes);
    const rev = buildRouteLanePath(env(graph), [...nodes].reverse());
    // The point at the same physical spot: s on the forward path <-> length - s on the reverse.
    const s = fwd.nodeS[4] as number;
    const pf = fwd.laneAt(s, 1);
    const pr = rev.laneAt(fwd.length - s, 1);
    expect(Math.hypot(pf.x - pr.x, pf.y - pr.y)).toBeCloseTo(DOUBLE_TRACK_SPACING_TILES, 2);
  });
});

describe("single track", () => {
  it("both directions share the centerline", () => {
    const nodes = [t(5, 10), t(6, 10), t(7, 10), t(8, 10)];
    const graph = chainGraph(nodes);
    const fwd = buildRouteLanePath(env(graph), nodes);
    const rev = buildRouteLanePath(env(graph), [...nodes].reverse());
    const pf = fwd.laneAt(1.5, 1);
    const pr = rev.laneAt(fwd.length - 1.5, 1);
    expect(Math.hypot(pf.x - pr.x, pf.y - pr.y)).toBeCloseTo(0, 9);
  });
});

describe("passing-loop station (PLAN Phase 16.1 / 17)", () => {
  // double: 5-6 ; station at 6 ; single 6-7-8-9
  const nodes = [t(5, 10), t(6, 10), t(7, 10), t(8, 10), t(9, 10)];
  const graph = chainGraph(nodes, [true, false, false, false]);
  const e = env(graph, [t(6, 10)]);
  const lane = buildLanePath(e, { nodes });

  it("is full width at the station tile and eases to a single track on the single side", () => {
    expect(lane.halfWidthAt(lane.nodeS[1] as number)).toBeCloseTo(LANE_HALF_TILES, 9);
    const at = (d: number) => lane.halfWidthAt((lane.nodeS[1] as number) + d);
    expect(at(0.75)).toBeGreaterThan(0);
    expect(at(0.75)).toBeLessThan(LANE_HALF_TILES);
    expect(at(1.2)).toBeGreaterThan(0); // spans past the first one-tile edge
    expect(at(TURNOUT_EASE_TILES)).toBeCloseTo(0, 9);
    expect(at(2.5)).toBe(0);
  });
});

describe("junction connectors", () => {
  // Through line along y=10 from x=5..12 with a branch leaving node (8,10) toward SE (9,11)...
  const graph = new TrackGraph();
  for (let x = 5; x < 12; x++) addEdge(graph, t(x, 10), t(x + 1, 10));
  addEdge(graph, t(8, 10), t(9, 11));
  addEdge(graph, t(9, 11), t(10, 12));
  const e = env(graph);

  it("draws one connector arc matching the path a bending train follows", () => {
    const strands = buildTrackStrands(e);
    const connectors = strands.filter((s) => s.connector);
    expect(connectors).toHaveLength(1);
    const connector = connectors[0]!;
    const route = buildRouteLanePath(e, [t(7, 10), t(8, 10), t(9, 11)]);
    // The route's fillet arc is the same curve as the connector: compare mid-arc points.
    const rMid = route.centerAt(route.nodeS[1] as number);
    const cMid = connector.lane.centerAt(connector.lane.nodeS[1] as number);
    expect(Math.hypot(rMid.x - cMid.x, rMid.y - cMid.y)).toBeLessThan(1e-9);
  });

  it("trims the branch strand to the connector's tangent point and keeps the through line whole", () => {
    const strands = buildTrackStrands(e);
    const branch = strands.find((s) => !s.connector && s.nodes.includes(t(10, 12)))!;
    const start = branch.lane.centerAt(0);
    const connector = strands.find((s) => s.connector)!;
    const end = connector.lane.centerAt(connector.lane.length);
    expect(Math.hypot(start.x - end.x, start.y - end.y)).toBeLessThan(1e-9);
    // The through line stays straight and untrimmed right up to the junction node (8,10) and on
    // out of it — the branch, not the through track, is what bends.
    const left = strands.find((s) => !s.connector && s.nodes.includes(t(5, 10)))!;
    const right = strands.find((s) => !s.connector && s.nodes.includes(t(12, 10)))!;
    expect(left.lane.centerAt(left.lane.length).x).toBeCloseTo(8.5, 9);
    expect(left.lane.centerAt(left.lane.length).y).toBeCloseTo(10.5, 9);
    expect(right.lane.centerAt(0).x).toBeCloseTo(8.5, 9);
  });
});

describe("turnout off double track", () => {
  const graph = new TrackGraph();
  for (let x = 5; x < 12; x++) addEdge(graph, t(x, 10), t(x + 1, 10), true);
  addEdge(graph, t(8, 10), t(9, 11));
  addEdge(graph, t(9, 11), t(10, 12));
  const strands = buildTrackStrands(env(graph));

  it("leaves from the outer lane: the arc starts on the lane line and never crosses the other lane", () => {
    const connector = strands.find((s) => s.connector)!;
    expect(connector.turnoutAt).toBe(t(8, 10));
    const start = connector.lane.centerAt(0);
    // Main runs along y = 10.5; the branch is on the +y side, so the arc starts on lane y = 10.5 + w.
    expect(start.y).toBeCloseTo(10.5 + LANE_HALF_TILES, 9);
    for (let s = 0; s <= connector.lane.length; s += 0.02) {
      expect(connector.lane.centerAt(s).y).toBeGreaterThanOrEqual(10.5 + LANE_HALF_TILES - 1e-9);
      expect(connector.lane.halfWidthAt(s)).toBe(0);
    }
  });

  it("keeps the branch single (no ghost funnel) and starts it where the arc ends", () => {
    const connector = strands.find((s) => s.connector)!;
    const branch = strands.find((s) => !s.connector && s.nodes.includes(t(10, 12)))!;
    const a = connector.lane.centerAt(connector.lane.length);
    const b = branch.lane.centerAt(0);
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(1e-9);
    for (let s = 0; s <= branch.lane.length; s += 0.05) {
      expect(branch.lane.halfWidthAt(s)).toBe(0);
    }
  });

  it("draws a crossing (two straight pairs, any angle, single or double) with no connector arcs (PLAN Phase 27)", () => {
    for (const double of [false, true]) {
      const graph = new TrackGraph();
      for (let x = 10; x < 20; x++) addEdge(graph, t(x, 20), t(x + 1, 20), double);
      for (let i = 0; i < 10; i++) addEdge(graph, t(10 + i, 15 + i), t(11 + i, 16 + i));
      expect(graph.neighborsOf(t(15, 20)).length).toBe(4);
      const strands = buildTrackStrands({ mapWidth: W, graph, stationTiles: new Set() });
      expect(strands.filter((s) => s.connector)).toEqual([]);
    }
    // A turnout (one straight pair plus one branch) still gets its connector.
    const y = new TrackGraph();
    for (let x = 10; x < 20; x++) addEdge(y, t(x, 20), t(x + 1, 20));
    for (let i = 0; i < 4; i++) addEdge(y, t(15 + i, 20 + i), t(16 + i, 21 + i));
    const strands = buildTrackStrands({ mapWidth: W, graph: y, stationTiles: new Set() });
    expect(strands.some((s) => s.connector)).toBe(true);
  });
});

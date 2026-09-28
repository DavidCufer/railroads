/**
 * PLAN Phase 17 A: coupler gaps between consecutive vehicles are constant in screen pixels at a
 * given zoom, identical on straight, diagonal and curved track. Measured between the facing end
 * faces of consecutive vehicles (center ± half length along the drawn heading).
 */
import { describe, expect, it } from "vitest";
import { layoutConsist, VEHICLE_GAP_TILES, type LayoutTrain } from "../../src/render/trains";
import { TrackGraph, directionIndex } from "../../src/sim/track/graph";
import { TILE_SIZE } from "../../src/render/camera";

const MAP_W = 40;
const tile = (x: number, y: number): number => y * MAP_W + x;

function graphFor(path: number[]): TrackGraph {
  const graph = new TrackGraph();
  for (let i = 0; i + 1 < path.length; i++) {
    const a = path[i] as number;
    const b = path[i + 1] as number;
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    graph.addEdge({
      a: lo,
      b: hi,
      direction: directionIndex(
        (hi % MAP_W) - (lo % MAP_W),
        Math.floor(hi / MAP_W) - Math.floor(lo / MAP_W),
      ),
      double: false,
      electrified: false,
      bridge: null,
      bridgeSpan: [],
      cost: 0,
    });
  }
  return graph;
}

function trainOn(route: number[], routeIndex: number, progress: number, cars: number): LayoutTrain {
  const a = route[routeIndex] as number;
  const b = route[routeIndex + 1] as number;
  const x = (a % MAP_W) + 0.5 + ((b % MAP_W) - (a % MAP_W)) * progress;
  const y =
    Math.floor(a / MAP_W) + 0.5 + (Math.floor(b / MAP_W) - Math.floor(a / MAP_W)) * progress;
  return {
    route,
    routeIndex,
    edgeProgress: progress,
    renderFromX: x,
    renderFromY: y,
    renderToX: x,
    renderToY: y,
    direction: 0,
    cars: Array.from({ length: cars }, () => ({})),
  };
}

const CASES: Record<string, { route: number[]; routeIndex: number; progress: number }> = {
  horizontal: {
    route: Array.from({ length: 14 }, (_, i) => tile(5 + i, 10)),
    routeIndex: 9,
    progress: 0.4,
  },
  diagonal: {
    route: Array.from({ length: 14 }, (_, i) => tile(5 + i, 5 + i)),
    routeIndex: 9,
    progress: 0.4,
  },
  // Horizontal run, then a 45° bend to a diagonal: the head is on the diagonal so the consist
  // straddles the fillet arc.
  "45° curve": {
    route: [
      ...Array.from({ length: 8 }, (_, i) => tile(5 + i, 10)),
      ...Array.from({ length: 6 }, (_, i) => tile(13 + i, 11 + i)),
    ],
    routeIndex: 9,
    progress: 0.3,
  },
};

describe("consist coupler gaps (PLAN Phase 17 A)", () => {
  for (const [name, c] of Object.entries(CASES)) {
    for (const zoom of [1, 2]) {
      it(`${name} at zoom ${zoom}: every gap is the configured coupler gap ±0.5px`, () => {
        const route = c.route;
        const graph = graphFor(route);
        const train = trainOn(route, c.routeIndex, c.progress, 5);
        const vehicles = layoutConsist(MAP_W, graph, train, 1, new Set());
        expect(vehicles.length).toBe(6);
        const wantPx = VEHICLE_GAP_TILES * TILE_SIZE * zoom;
        for (let i = 0; i + 1 < vehicles.length; i++) {
          const front = vehicles[i]!;
          const back = vehicles[i + 1]!;
          const rearX = front.x - Math.cos(front.angle) * (front.length / 2);
          const rearY = front.y - Math.sin(front.angle) * (front.length / 2);
          const nextFrontX = back.x + Math.cos(back.angle) * (back.length / 2);
          const nextFrontY = back.y + Math.sin(back.angle) * (back.length / 2);
          const gapPx = Math.hypot(rearX - nextFrontX, rearY - nextFrontY) * TILE_SIZE * zoom;
          expect(
            Math.abs(gapPx - wantPx),
            `gap ${i}: ${gapPx}px vs ${wantPx}px`,
          ).toBeLessThanOrEqual(0.5);
        }
      });
    }
  }
});

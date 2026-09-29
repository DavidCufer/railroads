import { describe, expect, it } from "vitest";
import {
  boxHitsObstacles,
  footprintTiles,
  layoutStation,
  localObstacles,
  toArtFrame,
  type LayoutParams,
  type Obstacles,
  type StationMarkerType,
} from "../../src/render/stationLayout";

const ALL: StationMarkerType[] = [
  "engineShed",
  "waterTower",
  "hotel",
  "warehouse",
  "postOffice",
  "coldStorage",
  "freightYard",
  "livestockPens",
];

type Track = [number, number, number, number];
const CX = 10.5;
const CY = 10.5;

/** Straight run of track edges from (x0,y0) to (x1,y1), one tile step at a time (tile coordinates). */
function run(x0: number, y0: number, x1: number, y1: number): Track[] {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  const sx = Math.sign(x1 - x0);
  const sy = Math.sign(y1 - y0);
  const out: Track[] = [];
  for (let i = 0; i < n; i++)
    out.push([
      x0 + sx * i + 0.5,
      y0 + sy * i + 0.5,
      x0 + sx * (i + 1) + 0.5,
      y0 + sy * (i + 1) + 0.5,
    ]);
  return out;
}

function params(type: LayoutParams["type"], improvements: StationMarkerType[]): LayoutParams {
  return { type, near: 0.17, loop: false, reach: [1.5, 1.5], improvements };
}

/** Number of things the layout draws that touch an obstacle or each other's site. */
function collisions(layout: ReturnType<typeof layoutStation>, obs: Obstacles): number {
  const art = toArtFrame(obs, layout.side);
  return layout.boxes.filter((b) => boxHitsObstacles(b, art)).length;
}

const SCENARIOS: Record<
  string,
  { angle: number; tracks: Track[]; squares: [number, number, number][] }
> = {
  straight: { angle: 0, tracks: run(5, 10, 16, 10), squares: [] },
  "straight, parallel track above": {
    angle: 0,
    tracks: [...run(5, 10, 16, 10), ...run(5, 9, 16, 9)],
    squares: [],
  },
  "straight, industry below": {
    angle: 0,
    tracks: run(5, 10, 16, 10),
    squares: [
      [9, 11, 0],
      [10, 11, 0],
      [11, 11, 0],
      [12, 11, 0],
    ],
  },
  diagonal: { angle: Math.PI / 4, tracks: run(5, 5, 16, 16), squares: [] },
  "diagonal with a curve beyond": {
    angle: Math.PI / 4,
    tracks: [...run(6, 6, 13, 13), ...run(13, 13, 20, 13)],
    squares: [],
  },
  "junction on the station tile": {
    angle: 0,
    tracks: [...run(5, 10, 16, 10), ...run(10, 10, 15, 5), ...run(11, 10, 16, 15)],
    squares: [],
  },
  "junction both sides, adjacent tile": {
    angle: 0,
    tracks: [...run(5, 10, 16, 10), ...run(9, 10, 4, 5), ...run(11, 10, 16, 15)],
    squares: [],
  },
  "other station next door": { angle: 0, tracks: run(5, 10, 16, 10), squares: [[13, 10, 0.6]] },
};

describe("station layout", () => {
  for (const [name, sc] of Object.entries(SCENARIOS)) {
    for (const type of ["depot", "station", "terminal"] as const) {
      it(`${type}: nothing drawn over track or industry — ${name}`, () => {
        const obs = localObstacles(CX, CY, sc.angle, sc.tracks, sc.squares);
        const layout = layoutStation(params(type, ALL), obs);
        expect(collisions(layout, obs)).toBe(0);
        expect(layout.clear).toBe(true);
      });
    }
  }

  it("puts the building on the side with more free space", () => {
    const tracks = run(5, 10, 16, 10);
    const above = localObstacles(CX, CY, 0, tracks, [
      [9, 9, 0],
      [10, 9, 0],
      [11, 9, 0],
    ]);
    expect(layoutStation(params("station", []), above).side).toBe(1);
    const below = localObstacles(CX, CY, 0, tracks, [
      [9, 11, 0],
      [10, 11, 0],
      [11, 11, 0],
    ]);
    expect(layoutStation(params("station", []), below).side).toBe(-1);
  });

  it("places every improvement on open ground and keeps them apart", () => {
    const obs = localObstacles(CX, CY, 0, run(5, 10, 16, 10), []);
    const layout = layoutStation(params("station", ALL), obs);
    expect(layout.slots).toHaveLength(ALL.length);
    const boxes = layout.boxes;
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i]!;
        const b = boxes[j]!;
        const overlap = a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
        expect(overlap, `${i} vs ${j}`).toBe(false);
      }
    }
  });

  it("is deterministic", () => {
    const obs = localObstacles(CX, CY, 0, run(5, 10, 16, 10), [[12, 11, 0]]);
    expect(layoutStation(params("station", ALL), obs).key).toBe(
      layoutStation(params("station", ALL), obs).key,
    );
  });

  it("clips a platform that would run into a branch line", () => {
    const obs = localObstacles(CX, CY, 0, [...run(5, 10, 16, 10), ...run(11, 10, 11, 5)], []);
    const layout = layoutStation(params("station", []), obs);
    const range = layout.side === -1 ? layout.nearRange : layout.farRange;
    expect(range === null || range[1] < 1).toBe(true);
  });

  it("footprint tiles cover the tile under the building and platforms but not distant ones", () => {
    const obs = localObstacles(CX, CY, 0, run(5, 10, 16, 10), []);
    const layout = layoutStation(params("station", []), obs);
    const tiles = footprintTiles(layout, 0, CX, CY).map(([x, y]) => `${x},${y}`);
    expect(tiles).toContain("10,10");
    expect(tiles).not.toContain("10,5");
    expect(tiles).not.toContain("3,10");
  });
});

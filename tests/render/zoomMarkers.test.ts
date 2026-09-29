import { describe, expect, it } from "vitest";
import {
  MARKER_FADE_START,
  MARKER_FULL_ZOOM,
  industryMarkerColor,
  mainCargoOf,
  markerAlpha,
} from "../../src/render/zoomMarkers";
import { shoreDistanceField, waterColorAtDistance } from "../../src/render/terrain";
import { CARGO } from "../../src/data/cargo";
import { INDUSTRY_TYPES } from "../../src/data/industries";
import { terrainId } from "../../src/sim/map/terrain";
import type { GameMap } from "../../src/sim/map/types";

describe("zoom markers", () => {
  it("fade in between the art zoom and the overview zoom", () => {
    expect(markerAlpha(1)).toBe(0);
    expect(markerAlpha(MARKER_FADE_START)).toBe(0);
    expect(markerAlpha(MARKER_FULL_ZOOM)).toBe(1);
    expect(markerAlpha(0.25)).toBe(1);
    const mid = markerAlpha((MARKER_FADE_START + MARKER_FULL_ZOOM) / 2);
    expect(mid).toBeGreaterThan(0.4);
    expect(mid).toBeLessThan(0.6);
  });

  it("colours every industry by a cargo colour", () => {
    for (const type of INDUSTRY_TYPES) {
      expect(mainCargoOf(type), type).not.toBeNull();
    }
    expect(industryMarkerColor("coalMine")).toBe(CARGO.coal.color);
  });
});

describe("shore distance field", () => {
  const W = 12;
  const H = 25;
  const map = { width: W, height: H, terrain: new Uint8Array(W * H) } as unknown as GameMap;
  // Water everywhere except column 0 and 11 land.
  for (let y = 0; y < H; y++)
    for (let x = 1; x < W - 1; x++) map.terrain[y * W + x] = terrainId("water");

  it("is exact Euclidean distance between tile centres", () => {
    const d = shoreDistanceField(map);
    expect(d[12 * W + 0]).toBe(0);
    expect(d[12 * W + 1]).toBeCloseTo(1);
    expect(d[12 * W + 4]).toBeCloseTo(4);
    expect(d[12 * W + 5]).toBeCloseTo(5);
    expect(d[12 * W + 6]).toBeCloseTo(5);
  });

  it("counts the map edge as shore", () => {
    const open = {
      width: 4,
      height: 4,
      terrain: new Uint8Array(16).fill(terrainId("water")),
    } as unknown as GameMap;
    const d = shoreDistanceField(open);
    expect(d[0]).toBeCloseTo(1);
    expect(d[1 * 4 + 1]).toBeCloseTo(2);
  });

  it("ramps colour continuously from shallow to deep", () => {
    expect(waterColorAtDistance(0)).not.toBe(waterColorAtDistance(100));
    expect(waterColorAtDistance(-3)).toBe(waterColorAtDistance(0));
  });
});

import { describe, expect, it } from "vitest";
import { buildTrack } from "../../../src/sim/commands";
import {
  canPlaceStationAt,
  stationAtTile,
  stationCatchmentTiles,
} from "../../../src/sim/stations/placement";
import type { Station } from "../../../src/sim/stations/types";
import { makeTestMap, makeTestState, tileAt } from "../track/helpers";

describe("canPlaceStationAt", () => {
  it("rejects a tile with no track", () => {
    const map = makeTestMap(["ppppp"]);
    const state = makeTestState(map);
    expect(canPlaceStationAt(map, state.trackGraph, tileAt(map, 2, 0))).toBe(false);
  });

  it("accepts a dead end (one edge)", () => {
    const map = makeTestMap(["ppppp"]);
    const state = makeTestState(map);
    buildTrack(state, [tileAt(map, 0, 0), tileAt(map, 1, 0)]);
    expect(canPlaceStationAt(map, state.trackGraph, tileAt(map, 0, 0))).toBe(true);
    expect(canPlaceStationAt(map, state.trackGraph, tileAt(map, 1, 0))).toBe(true);
  });

  it("accepts a straight through-track tile", () => {
    const map = makeTestMap(["ppppp"]);
    const state = makeTestState(map);
    buildTrack(state, [tileAt(map, 0, 0), tileAt(map, 1, 0), tileAt(map, 2, 0), tileAt(map, 3, 0)]);
    expect(canPlaceStationAt(map, state.trackGraph, tileAt(map, 1, 0))).toBe(true);
    expect(canPlaceStationAt(map, state.trackGraph, tileAt(map, 2, 0))).toBe(true);
  });

  it("accepts a diagonal through-track tile", () => {
    const map = makeTestMap(["ppppp", "ppppp", "ppppp", "ppppp", "ppppp"]);
    const state = makeTestState(map);
    buildTrack(state, [tileAt(map, 0, 0), tileAt(map, 1, 1), tileAt(map, 2, 2), tileAt(map, 3, 3)]);
    expect(canPlaceStationAt(map, state.trackGraph, tileAt(map, 1, 1))).toBe(true);
    expect(canPlaceStationAt(map, state.trackGraph, tileAt(map, 2, 2))).toBe(true);
  });

  it("rejects a junction (3+ edges)", () => {
    const map = makeTestMap(["ppppp", "ppppp", "ppppp"]);
    const state = makeTestState(map);
    buildTrack(state, [tileAt(map, 0, 1), tileAt(map, 1, 1), tileAt(map, 2, 1)]);
    buildTrack(state, [tileAt(map, 1, 1), tileAt(map, 1, 0)]);
    expect(canPlaceStationAt(map, state.trackGraph, tileAt(map, 1, 1))).toBe(false);
  });

  it("rejects a bend (two edges not opposite)", () => {
    const map = makeTestMap(["ppppp", "ppppp", "ppppp"]);
    const state = makeTestState(map);
    buildTrack(state, [tileAt(map, 0, 1), tileAt(map, 1, 1), tileAt(map, 1, 0)]);
    expect(canPlaceStationAt(map, state.trackGraph, tileAt(map, 1, 1))).toBe(false);
  });
});

describe("stationAtTile", () => {
  it("finds the station occupying a tile, if any", () => {
    const stations: Station[] = [{ id: 0, tile: 5, type: "depot", name: "A", hasEngineShed: true }];
    expect(stationAtTile(stations, 5)?.name).toBe("A");
    expect(stationAtTile(stations, 6)).toBeUndefined();
  });
});

describe("stationCatchmentTiles", () => {
  it("returns a (2r+1)x(2r+1) square for a tile away from the map edge", () => {
    const map = makeTestMap(Array.from({ length: 11 }, () => "ppppppppppp"));
    const tiles = stationCatchmentTiles(map, tileAt(map, 5, 5), 2);
    expect(tiles.length).toBe(5 * 5);
  });

  it("clips to the map bounds near an edge", () => {
    const map = makeTestMap(Array.from({ length: 5 }, () => "ppppp"));
    const tiles = stationCatchmentTiles(map, tileAt(map, 0, 0), 1);
    // Only the 2x2 quadrant inside the map remains.
    expect(tiles.length).toBe(4);
  });

  it("radius 1/2/3 match the Depot/Station/Terminal 3x3/5x5/7x7 catchments", () => {
    const map = makeTestMap(Array.from({ length: 15 }, () => "p".repeat(15)));
    const center = tileAt(map, 7, 7);
    expect(stationCatchmentTiles(map, center, 1).length).toBe(3 * 3);
    expect(stationCatchmentTiles(map, center, 2).length).toBe(5 * 5);
    expect(stationCatchmentTiles(map, center, 3).length).toBe(7 * 7);
  });
});

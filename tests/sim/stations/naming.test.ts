import { describe, expect, it } from "vitest";
import { buildTrack } from "../../../src/sim/commands";
import { defaultStationName } from "../../../src/sim/stations/naming";
import type { City, Industry } from "../../../src/sim/economy/types";
import { makeTestMap, makeTestState, tileAt } from "../track/helpers";

function makeCity(overrides: Partial<City> = {}): City {
  return {
    id: 0,
    name: "Harlow",
    tier: "town",
    population: 8_000,
    anchorX: 0,
    anchorY: 0,
    tiles: [],
    coastal: false,
    ...overrides,
  };
}

describe("defaultStationName", () => {
  it("uses the city name alone when the station tile is inside a city footprint", () => {
    const map = makeTestMap(["ppppp"]);
    const state = makeTestState(map);
    const city = makeCity({ tiles: [tileAt(map, 2, 0)] });
    map.cityId[tileAt(map, 2, 0)] = 0;
    buildTrack(
      state,
      [0, 1, 2, 3, 4].map((x) => tileAt(map, x, 0)),
    );

    const name = defaultStationName(
      map,
      state.trackGraph,
      [city],
      [],
      tileAt(map, 2, 0),
      "depot",
      new Set(),
    );
    expect(name).toBe("Harlow");
  });

  it("appends the nearest industry's name when one is inside the station's catchment", () => {
    const map = makeTestMap(["ppppppp"]);
    const state = makeTestState(map);
    const city = makeCity({ tiles: [tileAt(map, 0, 0)] });
    map.cityId[tileAt(map, 0, 0)] = 0;
    const industry: Industry = { id: 0, type: "coalMine", x: 5, y: 0 };
    map.industryId[tileAt(map, 5, 0)] = 0;
    // Dead-end station tile at (4,0); the depot's radius-1 catchment reaches the mine at (5,0).
    buildTrack(state, [tileAt(map, 3, 0), tileAt(map, 4, 0)]);

    const name = defaultStationName(
      map,
      state.trackGraph,
      [city],
      [industry],
      tileAt(map, 4, 0),
      "depot",
      new Set(),
    );
    expect(name).toBe("Harlow Coal Mine");
  });

  it("appends 'Junction' when the station sits next to an existing track junction", () => {
    const map = makeTestMap(["ppppp", "ppppp", "ppppp"]);
    const state = makeTestState(map);
    const city = makeCity({ tiles: [tileAt(map, 0, 1)] });
    map.cityId[tileAt(map, 0, 1)] = 0;
    // Junction at (2,1): branch north from the mainline.
    buildTrack(state, [tileAt(map, 1, 1), tileAt(map, 2, 1), tileAt(map, 3, 1)]);
    buildTrack(state, [tileAt(map, 2, 1), tileAt(map, 2, 0)]);
    // Dead-end station tile adjacent to the junction.
    buildTrack(state, [tileAt(map, 3, 1), tileAt(map, 4, 1)]);

    const name = defaultStationName(
      map,
      state.trackGraph,
      [city],
      [],
      tileAt(map, 3, 1),
      "depot",
      new Set(),
    );
    expect(name).toBe("Harlow Junction");
  });

  it("falls back to 'Crossing' with no city tile, industry, or nearby junction", () => {
    const map = makeTestMap(["ppppppppp"]);
    const state = makeTestState(map);
    const city = makeCity({ tiles: [tileAt(map, 0, 0)] });
    map.cityId[tileAt(map, 0, 0)] = 0;
    buildTrack(state, [tileAt(map, 6, 0), tileAt(map, 7, 0), tileAt(map, 8, 0)]);

    const name = defaultStationName(
      map,
      state.trackGraph,
      [city],
      [],
      tileAt(map, 7, 0),
      "depot",
      new Set(),
    );
    expect(name).toBe("Harlow Crossing");
  });

  it("disambiguates a repeated default name with a trailing number", () => {
    const map = makeTestMap(["ppppp"]);
    const state = makeTestState(map);
    const city = makeCity({ tiles: [tileAt(map, 2, 0)] });
    map.cityId[tileAt(map, 2, 0)] = 0;
    buildTrack(
      state,
      [0, 1, 2, 3, 4].map((x) => tileAt(map, x, 0)),
    );

    const name = defaultStationName(
      map,
      state.trackGraph,
      [city],
      [],
      tileAt(map, 2, 0),
      "depot",
      new Set(["Harlow"]),
    );
    expect(name).toBe("Harlow 2");
  });

  it("falls back to the station type name when there are no cities at all", () => {
    const map = makeTestMap(["ppppp"]);
    const state = makeTestState(map);
    buildTrack(state, [tileAt(map, 0, 0), tileAt(map, 1, 0)]);

    const name = defaultStationName(
      map,
      state.trackGraph,
      [],
      [],
      tileAt(map, 0, 0),
      "depot",
      new Set(),
    );
    expect(name).toBe("Depot");
  });
});

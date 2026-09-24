import { describe, expect, it } from "vitest";
import { INDUSTRIES } from "../../../src/data/industries";
import { STATION_ACCEPTANCE_THRESHOLD } from "../../../src/data/stations";
import { computeStationEconomies, previewStationEconomy } from "../../../src/sim/stations/economy";
import type { City, Industry } from "../../../src/sim/economy/types";
import type { Station } from "../../../src/sim/stations/types";
import { makeTestMap, tileAt } from "../track/helpers";

function makeCity(overrides: Partial<City> = {}): City {
  return {
    id: 0,
    name: "Testville",
    tier: "town",
    population: 8_000,
    anchorX: 0,
    anchorY: 0,
    tiles: [],
    coastal: false,
    ...overrides,
  };
}

describe("computeStationEconomies — acceptance", () => {
  it("accepts a cargo once its catchment's points reach the threshold", () => {
    const map = makeTestMap(Array.from({ length: 5 }, () => "ppppp"));
    const mill: Industry = { id: 0, type: "steelMill", x: 2, y: 2 };
    map.industryId[tileAt(map, 2, 2)] = 0;
    const station: Station = {
      id: 0,
      tile: tileAt(map, 1, 2), // depot (radius 1) catchment reaches the mill at (2,2)
      type: "depot",
      name: "S1",
      hasEngineShed: false,
    };

    const result = computeStationEconomies(map, [], [mill], [station], 1830);
    const economy = result.get(0)!;
    expect(economy.acceptPoints.coal).toBe(INDUSTRIES.steelMill.acceptancePoints.coal);
    expect(economy.acceptPoints.ironOre).toBe(INDUSTRIES.steelMill.acceptancePoints.ironOre);
    expect(economy.accepts).toContain("coal");
    expect(economy.accepts).toContain("ironOre");
    expect((economy.acceptPoints.coal as number) >= STATION_ACCEPTANCE_THRESHOLD).toBe(true);
  });

  it("doesn't accept a cargo below the threshold", () => {
    const map = makeTestMap(Array.from({ length: 7 }, () => "ppppppp"));
    // A lone city tile contributes 2 points for food/goods (below threshold 8).
    const city = makeCity({ tiles: [tileAt(map, 3, 3)] });
    map.cityId[tileAt(map, 3, 3)] = 0;
    const station: Station = {
      id: 0,
      tile: tileAt(map, 3, 3),
      type: "depot",
      name: "S1",
      hasEngineShed: false,
    };

    const result = computeStationEconomies(map, [city], [], [station], 1830);
    const economy = result.get(0)!;
    expect(economy.acceptPoints.food).toBe(2);
    expect(economy.accepts).not.toContain("food");
  });

  it("only counts tiles within the station's own catchment radius", () => {
    const map = makeTestMap(Array.from({ length: 11 }, () => "p".repeat(11)));
    const mill: Industry = { id: 0, type: "steelMill", x: 8, y: 5 };
    map.industryId[tileAt(map, 8, 5)] = 0;
    // Depot (radius 1) at (5,5) is far from the mill at (8,5) — out of catchment.
    const station: Station = {
      id: 0,
      tile: tileAt(map, 5, 5),
      type: "depot",
      name: "S1",
      hasEngineShed: false,
    };

    const result = computeStationEconomies(map, [], [mill], [station], 1830);
    expect(result.get(0)!.acceptPoints.coal ?? 0).toBe(0);
  });
});

describe("computeStationEconomies — supply", () => {
  it("gives a lone station the industry's full monthly production", () => {
    const map = makeTestMap(Array.from({ length: 5 }, () => "ppppp"));
    const mine: Industry = { id: 0, type: "coalMine", x: 2, y: 2 };
    map.industryId[tileAt(map, 2, 2)] = 0;
    const station: Station = {
      id: 0,
      tile: tileAt(map, 2, 2),
      type: "depot",
      name: "S1",
      hasEngineShed: false,
    };

    const result = computeStationEconomies(map, [], [mine], [station], 1830);
    expect(result.get(0)!.supply.coal).toBe(INDUSTRIES.coalMine.produces.coal);
  });

  it("splits an overlapping producer's output evenly between the covering stations", () => {
    const map = makeTestMap(Array.from({ length: 7 }, () => "ppppppp"));
    const mine: Industry = { id: 0, type: "coalMine", x: 3, y: 3 };
    map.industryId[tileAt(map, 3, 3)] = 0;
    // Two Station-type (radius 2) stations, both close enough to cover the mine tile.
    const stationA: Station = {
      id: 0,
      tile: tileAt(map, 2, 3),
      type: "station",
      name: "A",
      hasEngineShed: false,
    };
    const stationB: Station = {
      id: 1,
      tile: tileAt(map, 4, 3),
      type: "station",
      name: "B",
      hasEngineShed: false,
    };

    const result = computeStationEconomies(map, [], [mine], [stationA, stationB], 1830);
    const expectedShare = (INDUSTRIES.coalMine.produces.coal as number) / 2;
    expect(result.get(0)!.supply.coal).toBeCloseTo(expectedShare, 6);
    expect(result.get(1)!.supply.coal).toBeCloseTo(expectedShare, 6);
  });

  it("splits a city's passenger/mail supply by the fraction of tiles each station covers", () => {
    const map = makeTestMap(Array.from({ length: 7 }, () => "ppppppp"));
    const city = makeCity({
      population: 25_000,
      tiles: [tileAt(map, 2, 3), tileAt(map, 4, 3)],
    });
    map.cityId[tileAt(map, 2, 3)] = 0;
    map.cityId[tileAt(map, 4, 3)] = 0;
    // Each depot (radius 1) only reaches one of the two city tiles.
    const stationA: Station = {
      id: 0,
      tile: tileAt(map, 2, 3),
      type: "depot",
      name: "A",
      hasEngineShed: false,
    };
    const stationB: Station = {
      id: 1,
      tile: tileAt(map, 4, 3),
      type: "depot",
      name: "B",
      hasEngineShed: false,
    };

    const result = computeStationEconomies(map, [city], [], [stationA, stationB], 1830);
    const expectedEach = city.population / 250 / 2;
    expect(result.get(0)!.supply.passengers).toBeCloseTo(expectedEach, 1);
    expect(result.get(1)!.supply.passengers).toBeCloseTo(expectedEach, 1);
  });
});

describe("previewStationEconomy", () => {
  it("accounts for overlap with already-built stations", () => {
    const map = makeTestMap(Array.from({ length: 7 }, () => "ppppppp"));
    const mine: Industry = { id: 0, type: "coalMine", x: 3, y: 3 };
    map.industryId[tileAt(map, 3, 3)] = 0;
    const existing: Station = {
      id: 0,
      tile: tileAt(map, 2, 3),
      type: "station",
      name: "A",
      hasEngineShed: false,
    };

    const preview = previewStationEconomy(
      map,
      [],
      [mine],
      [existing],
      tileAt(map, 4, 3),
      "station",
      1830,
    );
    const expectedShare = (INDUSTRIES.coalMine.produces.coal as number) / 2;
    expect(preview.supply.coal).toBeCloseTo(expectedShare, 6);
  });
});

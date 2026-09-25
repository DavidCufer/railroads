/** Region loader (SPEC §4.3): committed JSON → GameState, founding-year cities start absent. */
import { describe, expect, it } from "vitest";
import { createGameState } from "../../../src/sim/state";
import { getRegion, loadRegion } from "../../../src/sim/regions";

describe("loadRegion(us-east)", () => {
  it("produces a GameMap sized to the region", () => {
    const region = getRegion("us-east");
    const loaded = loadRegion(region);
    expect(loaded.map.width).toBe(region.width);
    expect(loaded.map.height).toBe(region.height);
    expect(loaded.map.terrain.length).toBe(region.width * region.height);
  });

  it("gives every city a name and, if founded at start, a non-empty footprint", () => {
    const region = getRegion("us-east");
    const loaded = loadRegion(region);
    expect(loaded.cities.length).toBe(region.cities.length);
    for (const city of loaded.cities) {
      expect(city.name.length).toBeGreaterThan(0);
      if (city.foundingYear === undefined || city.foundingYear <= region.startYear) {
        expect(city.tiles.length).toBeGreaterThan(0);
        expect(city.population).toBeGreaterThan(0);
      } else {
        expect(city.tiles.length).toBe(0);
        expect(city.population).toBe(0);
      }
    }
  });

  it("queues future-founding cities (Chicago, 1833) as pending, not yet on the map", () => {
    const region = getRegion("us-east");
    const loaded = loadRegion(region);
    const chicago = loaded.cities.find((c) => c.name === "Chicago");
    expect(chicago).toBeDefined();
    expect(chicago?.foundingYear).toBe(1833);
    expect(chicago?.tiles).toEqual([]);
    const pending = loaded.pendingCityFoundings.find((p) => p.cityId === chicago?.id);
    expect(pending).toBeDefined();
    expect(pending?.year).toBe(1833);
    expect(pending?.tiles.length).toBeGreaterThan(0);
    for (const idx of pending?.tiles ?? []) {
      expect(loaded.map.cityId[idx]).toBe(-1);
    }
  });
});

describe("loadRegion(gb)", () => {
  it("produces a GameMap sized to the region with no founding-year cities", () => {
    const region = getRegion("gb");
    const loaded = loadRegion(region);
    expect(loaded.map.width).toBe(region.width);
    expect(loaded.map.height).toBe(region.height);
    expect(loaded.cities.length).toBe(region.cities.length);
    expect(loaded.pendingCityFoundings).toEqual([]);
    for (const city of loaded.cities) {
      expect(city.tiles.length).toBeGreaterThan(0);
    }
  });
});

describe("loadRegion(central-eu)", () => {
  it("produces a GameMap sized to the region with no founding-year cities", () => {
    const region = getRegion("central-eu");
    const loaded = loadRegion(region);
    expect(loaded.map.width).toBe(region.width);
    expect(loaded.map.height).toBe(region.height);
    expect(loaded.cities.length).toBe(region.cities.length);
    expect(loaded.pendingCityFoundings).toEqual([]);
  });
});

describe("createGameState with a region", () => {
  it("builds a playable GameState from us-east", () => {
    const state = createGameState({ seed: 1, region: "us-east" });
    expect(state.regionId).toBe("us-east");
    expect(state.startYear).toBe(1830);
    expect(state.cities.length).toBeGreaterThan(0);
    expect(state.pendingCityFoundings.length).toBeGreaterThan(0);
    expect(state.map.width).toBeGreaterThan(0);
  });

  it("builds a playable GameState from gb", () => {
    const state = createGameState({ seed: 1, region: "gb" });
    expect(state.regionId).toBe("gb");
    expect(state.startYear).toBe(1830);
    expect(state.cities.length).toBeGreaterThan(0);
  });

  it("still builds a random GameState with no region set", () => {
    const state = createGameState({
      seed: 1,
      size: "small",
      waterLevel: "normal",
      roughness: "normal",
    });
    expect(state.regionId).toBeUndefined();
    expect(state.pendingCityFoundings).toEqual([]);
  });
});

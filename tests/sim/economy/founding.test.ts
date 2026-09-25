/** PLAN Phase 10: founding-year cities (SPEC §4.3) actually appear once the in-game year arrives,
 * with a news toast, and are left alone before then. */
import { describe, expect, it } from "vitest";
import { yearlyCityFoundingStep } from "../../../src/sim/economy/founding";
import { DAYS_PER_YEAR, HOURS_PER_DAY } from "../../../src/sim/time";
import { makeTestMap, makeTestState, tileAt } from "../track/helpers";
import type { City } from "../../../src/sim/economy/types";
import type { PendingCityFounding } from "../../../src/sim/regions/load";

function stateWithPendingCity(): ReturnType<typeof makeTestState> {
  const map = makeTestMap(Array.from({ length: 4 }, () => "p".repeat(4)));
  const city: City = {
    id: 0,
    name: "Futureville",
    tier: "village",
    population: 0,
    anchorX: 0,
    anchorY: 0,
    tiles: [],
    coastal: false,
    foundingYear: 1835,
  };
  const pending: PendingCityFounding = {
    cityId: 0,
    year: 1835,
    tiles: [tileAt(map, 0, 0), tileAt(map, 1, 0)],
    population: 1000,
    coastal: true,
  };
  return makeTestState(map, {
    startYear: 1830,
    cities: [city],
    pendingCityFoundings: [pending],
  });
}

function yearsOfTicks(years: number): number {
  return Math.round(years * DAYS_PER_YEAR * HOURS_PER_DAY);
}

describe("yearlyCityFoundingStep", () => {
  it("does nothing before the founding year", () => {
    const state = stateWithPendingCity();
    state.ticks = yearsOfTicks(2); // 1832
    yearlyCityFoundingStep(state);
    expect(state.cities[0]?.tiles).toEqual([]);
    expect(state.pendingCityFoundings.length).toBe(1);
    expect(state.news.length).toBe(0);
  });

  it("applies population/tiles/coastal and stamps map.cityId once the year arrives", () => {
    const state = stateWithPendingCity();
    state.ticks = yearsOfTicks(5); // 1835
    const versionBefore = state.mapContentVersion;
    yearlyCityFoundingStep(state);

    const city = state.cities[0] as City;
    expect(city.tiles).toEqual([tileAt(state.map, 0, 0), tileAt(state.map, 1, 0)]);
    expect(city.population).toBe(1000);
    expect(city.coastal).toBe(true);
    expect(state.map.cityId[tileAt(state.map, 0, 0)]).toBe(0);
    expect(state.map.cityId[tileAt(state.map, 1, 0)]).toBe(0);
    expect(state.mapContentVersion).toBeGreaterThan(versionBefore);
    expect(state.pendingCityFoundings.length).toBe(0);
  });

  it("pushes a cityFounded news item", () => {
    const state = stateWithPendingCity();
    state.ticks = yearsOfTicks(5);
    yearlyCityFoundingStep(state);
    expect(state.news.some((n) => n.kind === "cityFounded" && n.cityId === 0)).toBe(true);
    expect(state.pendingNews.some((n) => n.kind === "cityFounded")).toBe(true);
  });

  it("is a no-op on a state with no pending foundings", () => {
    const state = stateWithPendingCity();
    state.pendingCityFoundings = [];
    expect(() => yearlyCityFoundingStep(state)).not.toThrow();
    expect(state.news.length).toBe(0);
  });
});

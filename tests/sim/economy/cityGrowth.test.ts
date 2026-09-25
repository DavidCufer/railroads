/**
 * PLAN Phase 9 acceptance tests: city growth threshold crossing (population step, footprint tile,
 * tier change + news) and Civic Investment (cooldown, connected-by-rail gate, immediate effect).
 */
import { describe, expect, it } from "vitest";
import {
  buildStation,
  buildTrack,
  civicInvestment,
  computeCivicInvestmentPlan,
} from "../../../src/sim/commands";
import {
  accrueCityGrowthScore,
  getOrCreateCityGrowth,
  monthlyCityGrowthStep,
} from "../../../src/sim/economy/cityGrowth";
import { CITY_TIER_DEFS, CIVIC_INVESTMENT_COOLDOWN_YEARS } from "../../../src/data/cities";
import { DAYS_PER_YEAR, HOURS_PER_DAY } from "../../../src/sim/time";
import { makeTestMap, makeTestState, tileAt } from "../track/helpers";
import type { City } from "../../../src/sim/economy/types";
import type { GameState } from "../../../src/sim/state";

function stateWithCity(population: number): { state: GameState; city: City } {
  const map = makeTestMap(Array.from({ length: 12 }, () => "p".repeat(12)));
  const state = makeTestState(map);
  const city: City = {
    id: 0,
    name: "Testville",
    tier: "village",
    population,
    anchorX: 5,
    anchorY: 5,
    tiles: [tileAt(map, 5, 5)],
    coastal: false,
  };
  map.cityId[tileAt(map, 5, 5)] = 0;
  state.cities.push(city);
  return { state, city };
}

describe("city growth (SPEC §8.3)", () => {
  it("stays flat with no score and no baseline accrual issue (0 population change with 0 points)", () => {
    const { state, city } = stateWithCity(2_000);
    monthlyCityGrowthStep(state);
    // Unserved baseline still nudges population very slightly upward, but nowhere near a tier jump.
    expect(city.population).toBeGreaterThanOrEqual(2_000);
    expect(city.tier).toBe("village");
  });

  it("crosses a population threshold, grows the footprint by one tile, and changes tier with news", () => {
    const { state, city } = stateWithCity(4_800); // just under town's 5,000 minPop
    const tilesBefore = city.tiles.length;

    // Dump a huge score directly (simulating many months of heavy delivery) to force a step.
    const growth = getOrCreateCityGrowth(state, city.id);
    growth.monthlyScore = city.population * 100; // comfortably over threshold
    monthlyCityGrowthStep(state);

    expect(city.population).toBeGreaterThan(4_800);
    expect(city.tiles.length).toBeGreaterThan(tilesBefore);
    expect(city.tier).toBe("town");
    const news = state.news.find((n) => n.kind === "cityGrowth");
    expect(news).toBeDefined();
    if (news?.kind === "cityGrowth") {
      expect(news.cityId).toBe(city.id);
      expect(news.tier).toBe("town");
    }
  });

  it("never exceeds the metropolis population cap even with an enormous score", () => {
    const { state, city } = stateWithCity(CITY_TIER_DEFS.metropolis.maxPop - 10);
    const growth = getOrCreateCityGrowth(state, city.id);
    growth.monthlyScore = 1e12;
    for (let i = 0; i < 20; i++) monthlyCityGrowthStep(state);
    expect(city.population).toBeLessThanOrEqual(CITY_TIER_DEFS.metropolis.maxPop);
  });

  it("accrueCityGrowthScore splits score across cities covering the delivering station's catchment", () => {
    const map = makeTestMap(Array.from({ length: 6 }, () => "pppppp"));
    const state = makeTestState(map);
    const path = [tileAt(map, 0, 0), tileAt(map, 1, 0)];
    expect(buildTrack(state, path).ok).toBe(true);
    expect(buildStation(state, tileAt(map, 0, 0), "depot").ok).toBe(true);
    const station = state.stations[0]!;
    const city: City = {
      id: 0,
      name: "A",
      tier: "village",
      population: 1_000,
      anchorX: 0,
      anchorY: 0,
      tiles: [tileAt(map, 0, 0)],
      coastal: false,
    };
    map.cityId[tileAt(map, 0, 0)] = 0;
    state.cities.push(city);

    accrueCityGrowthScore(state, station, "passengers", 20);
    expect(getOrCreateCityGrowth(state, 0).monthlyScore).toBeCloseTo(20, 6);

    accrueCityGrowthScore(state, station, "coal", 20); // doesn't count toward growth
    expect(getOrCreateCityGrowth(state, 0).monthlyScore).toBeCloseTo(20, 6);
  });

  it("Civic Investment: requires rail connection, costs $100k x tier, and boosts population once", () => {
    const map = makeTestMap(Array.from({ length: 6 }, () => "pppppp"));
    const state = makeTestState(map);
    const city: City = {
      id: 0,
      name: "Unconnected",
      tier: "city",
      population: 50_000,
      anchorX: 3,
      anchorY: 3,
      tiles: [tileAt(map, 3, 3)],
      coastal: false,
    };
    map.cityId[tileAt(map, 3, 3)] = 0;
    state.cities.push(city);

    expect(computeCivicInvestmentPlan(state, 0).valid).toBe(false); // no station nearby
    const notConnected = civicInvestment(state, 0);
    expect(notConnected.ok).toBe(false);

    expect(buildTrack(state, [tileAt(map, 3, 3), tileAt(map, 4, 3)]).ok).toBe(true);
    expect(buildStation(state, tileAt(map, 3, 3), "depot").ok).toBe(true);

    const plan = computeCivicInvestmentPlan(state, 0);
    expect(plan.valid).toBe(true);
    expect(plan.cost).toBeCloseTo(100_000 * 3, 0); // tier "city" = rank 3

    const before = city.population;
    const result = civicInvestment(state, 0);
    expect(result.ok).toBe(true);
    expect(city.population).toBeGreaterThan(before);
    expect(state.news.some((n) => n.kind === "civicInvestment")).toBe(true);

    // Cooldown: can't invest again immediately.
    expect(computeCivicInvestmentPlan(state, 0).valid).toBe(false);
    const again = civicInvestment(state, 0);
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.reason).toBe("civic-investment-cooldown");

    // After the cooldown elapses, it's available again.
    state.ticks += Math.ceil(CIVIC_INVESTMENT_COOLDOWN_YEARS * DAYS_PER_YEAR * HOURS_PER_DAY) + 1;
    expect(computeCivicInvestmentPlan(state, 0).valid).toBe(true);
  });
});

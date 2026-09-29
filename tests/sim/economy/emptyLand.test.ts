/** Phase 26A: resource discoveries and frontier towns. */
import { describe, expect, it } from "vitest";
import { DISCOVERY_CHANCE_PER_MONTH, INDUSTRIES } from "../../../src/data/industries";
import { FRONTIER_SERVED_MONTHS } from "../../../src/data/cities";
import { monthlyDiscoveryStep } from "../../../src/sim/economy/discoveries";
import { monthlyFrontierStep } from "../../../src/sim/economy/frontier";
import { makeTestMap, makeTestState, tileAt } from "../track/helpers";
import { buildRoute } from "../balanceRoutes";

describe("resource discoveries", () => {
  it("place a raw producer far from existing industries and announce it", () => {
    const rows = Array.from({ length: 40 }, () => "h".repeat(60));
    const map = makeTestMap(rows);
    const state = makeTestState(map, { startYear: 1900 });
    state.industries.push({ id: 0, type: "coalMine", x: 2, y: 2 });
    map.industryId[tileAt(map, 2, 2)] = 0;
    state.industryEconomy.set(0, { inputStock: {}, monthlyOutput: { coal: 60 } });
    const before = state.mapContentVersion;
    for (let i = 0; i < 12 / DISCOVERY_CHANCE_PER_MONTH && state.industries.length < 2; i++) {
      state.ticks += 720; // one month: the roll is derived from (seed, tick)
      monthlyDiscoveryStep(state);
    }
    expect(state.industries.length).toBeGreaterThanOrEqual(2);
    const found = state.industries[state.industries.length - 1]!;
    expect(INDUSTRIES[found.type].placement.kind).toBe("terrain");
    // Far corner of a 60x40 map: it prefers the emptiest land, not the neighbourhood of the mine.
    expect(Math.hypot(found.x - 2, found.y - 2)).toBeGreaterThan(30);
    expect(state.mapContentVersion).toBeGreaterThan(before);
    expect(state.news.some((n) => n.kind === "discovery")).toBe(true);
  });

  it("are deterministic for a seed", () => {
    const run = (): string => {
      const map = makeTestMap(Array.from({ length: 30 }, () => "h".repeat(40)));
      const state = makeTestState(map, { startYear: 1900 });
      for (let i = 0; i < 200; i++) {
        state.ticks += 720;
        monthlyDiscoveryStep(state);
      }
      return JSON.stringify(state.industries);
    };
    expect(run()).toBe(run());
  });
});

describe("frontier towns", () => {
  it("found one village beside a long-served station with no city in reach", () => {
    const { state } = buildRoute({
      cargo: "coal",
      km: 100,
      loco: "american-4-4-0",
      year: 1860,
      producer: "coalMine",
      acceptor: "steelMill",
    });
    const month = (): void => {
      state.ticks += 720;
      monthlyFrontierStep(state);
    };
    for (let i = 0; i < FRONTIER_SERVED_MONTHS - 1; i++) month();
    expect(state.cities).toHaveLength(0);
    for (let i = 0; i < 300; i++) month();
    expect(state.cities.length).toBeGreaterThanOrEqual(1);
    expect(state.cities.length).toBeLessThanOrEqual(2); // at most one per station
    const village = state.cities[0]!;
    expect(village.tier).toBe("village");
    expect(state.map.cityId[village.tiles[0]!]).toBe(village.id);
    expect(state.news.some((n) => n.kind === "cityFounded")).toBe(true);
  });
});

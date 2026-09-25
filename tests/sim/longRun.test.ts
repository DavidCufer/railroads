/**
 * PLAN Phase 8 acceptance test: runs a whole game from 1830 to 1961 hour-by-hour (the sim's only
 * granularity — "8x speed" just means many ticks per real second, not a different tick unit) with
 * a couple of trains actually running, and asserts:
 * - it never throws;
 * - diesel and electric locomotive models become available in the right years;
 * - steam locomotives can't be bought once past 1960 (checked live, on the actually-evolved
 *   state, not just the pure `buyableLocomotivesIn` helper);
 * - state that accumulates over time (news history, net-worth samples) stays capped rather than
 *   growing without bound across 131 years of play.
 */
import { describe, expect, it } from "vitest";
import { INDUSTRIES } from "../../src/data/industries";
import { buyableLocomotivesIn, LOCOMOTIVES, STEAM_PHASE_OUT_YEAR } from "../../src/data/trains";
import { NEWS_HISTORY_MAX } from "../../src/data/news";
import { CITY_TIER_DEFS } from "../../src/data/cities";
import { NET_WORTH_HISTORY_MAX_SAMPLES } from "../../src/sim/finance/types";
import {
  buildStation,
  buildTrack,
  buyTrain,
  computeBuyTrainPlan,
  setOrders,
} from "../../src/sim/commands";
import type { NewsItem } from "../../src/sim/news";
import type { GameState } from "../../src/sim/state";
import { advanceOneHour } from "../../src/sim/tick";
import { calendarFromTicks, DAYS_PER_YEAR, HOURS_PER_DAY } from "../../src/sim/time";
import type { City, Industry } from "../../src/sim/economy/types";
import { makeTestMap, makeTestState, tileAt } from "./track/helpers";

const START_YEAR = 1830;
const END_YEAR = 1961; // one past the SPEC §7.6 steam phase-out year

/** A simple coal mine -> steel mill freight route with two trains, plus a small two-city passenger
 * shuttle (Phase 9: exercises city growth over the same 131-year span), on a synthetic map (no
 * map-gen RNG needed — this test cares about the sim's time axis, not economy balance). */
function buildLongRunState(): { state: GameState; cityA: City; cityB: City } {
  const width = 20;
  const row = Array.from({ length: width }, () => "p").join("");
  const map = makeTestMap([row, row, row, row, row, row]);
  const state = makeTestState(map, { startYear: START_YEAR });

  const mineTile = tileAt(map, 0, 0);
  map.industryId[mineTile] = 0;
  const millTile = tileAt(map, width - 1, 0);
  map.industryId[millTile] = 1;
  const industries: Industry[] = [
    { id: 0, type: "coalMine", x: 0, y: 0 },
    { id: 1, type: "steelMill", x: width - 1, y: 0 },
  ];
  state.industries.push(...industries);
  state.industryEconomy.set(0, {
    inputStock: {},
    monthlyOutput: { ...INDUSTRIES.coalMine.produces },
  });
  state.industryEconomy.set(1, { inputStock: {}, monthlyOutput: {} });

  const path = Array.from({ length: width }, (_, x) => tileAt(map, x, 1));
  expect(buildTrack(state, path).ok).toBe(true);
  expect(buildStation(state, tileAt(map, 0, 1), "depot").ok).toBe(true);
  expect(buildStation(state, tileAt(map, width - 1, 1), "depot").ok).toBe(true);
  const stationA = state.stations[0]!;
  const stationB = state.stations[1]!;

  for (let i = 0; i < 2; i++) {
    // grasshopper-0-4-0 (1830, max 3 cars) is available from the scenario's own start year.
    const bought = buyTrain(state, stationA.id, "grasshopper-0-4-0", ["coal", "coal"]);
    expect(bought.ok).toBe(true);
    const train = state.trains[state.trains.length - 1]!;
    expect(
      setOrders(state, train.id, [
        { stationId: stationA.id, rule: "auto" },
        { stationId: stationB.id, rule: "auto" },
      ]).ok,
    ).toBe(true);
  }

  // A small served two-city passenger shuttle on rows 3-5, well clear of the freight route.
  function cityTiles(originX: number): number[] {
    return [
      tileAt(map, originX, 3),
      tileAt(map, originX + 1, 3),
      tileAt(map, originX, 4),
      tileAt(map, originX + 1, 4),
    ];
  }
  // 40k (not a village-scale population) so its passenger supply comfortably fills a carload
  // before SPEC §6.3's 10-day passenger decay threshold kicks in — a genuinely-served city, the
  // scenario this assertion cares about (an unserved village growing at the slow baseline rate is
  // already covered by tests/sim/economy/cityGrowth.test.ts's own unit test).
  const cityA: City = {
    id: 0,
    name: "Ashtown",
    tier: "city",
    population: 40_000,
    anchorX: 0,
    anchorY: 3,
    tiles: cityTiles(0),
    coastal: false,
  };
  const cityB: City = {
    id: 1,
    name: "Bramford",
    tier: "city",
    population: 40_000,
    anchorX: width - 2,
    anchorY: 3,
    tiles: cityTiles(width - 2),
    coastal: false,
  };
  for (const t of cityA.tiles) map.cityId[t] = 0;
  for (const t of cityB.tiles) map.cityId[t] = 1;
  state.cities.push(cityA, cityB);

  const paxPath = Array.from({ length: width - 2 }, (_, x) => tileAt(map, x + 1, 5));
  expect(buildTrack(state, paxPath).ok).toBe(true);
  expect(buildStation(state, tileAt(map, 1, 5), "station").ok).toBe(true);
  expect(buildStation(state, tileAt(map, width - 2, 5), "station").ok).toBe(true);
  const stationC = state.stations[2]!;
  const stationD = state.stations[3]!;
  stationC.hasEngineShed = true; // only the very first station built ever gets one for free

  const paxBought = buyTrain(state, stationC.id, "grasshopper-0-4-0", ["passengers"]);
  expect(paxBought.ok).toBe(true);
  const paxTrain = state.trains[state.trains.length - 1]!;
  expect(
    setOrders(state, paxTrain.id, [
      { stationId: stationC.id, rule: "auto" },
      { stationId: stationD.id, rule: "auto" },
    ]).ok,
  ).toBe(true);

  return { state, cityA, cityB };
}

describe("long-run simulation (1830 to 1961)", () => {
  it("runs the whole span without throwing, unlocks tech on schedule, blocks steam after 1960, keeps state bounded", () => {
    const { state, cityA, cityB } = buildLongRunState();
    const totalTicks = (END_YEAR - START_YEAR) * DAYS_PER_YEAR * HOURS_PER_DAY;
    const startingPopulation = cityA.population;

    // Drain pendingNews ourselves (same pattern as main.ts) into an unbounded test-side log, so
    // "the right years" can be checked against every item ever pushed — not just whatever
    // survived the capped `state.news` history by the end of a 131-year run.
    const allNews: NewsItem[] = [];

    expect(() => {
      for (let i = 0; i < totalTicks; i++) {
        advanceOneHour(state);
        if (state.pendingNews.length > 0) {
          allNews.push(...state.pendingNews);
          state.pendingNews.length = 0;
        }
      }
    }).not.toThrow();

    expect(calendarFromTicks(state.startYear, state.ticks).year).toBe(END_YEAR);

    // Every train is still a well-formed, finite number — no NaN/Infinity crept in over 131
    // years of movement/loading/breakdown state transitions.
    for (const train of state.trains) {
      expect(Number.isFinite(train.speed)).toBe(true);
      expect(Number.isFinite(train.edgeProgress)).toBe(true);
      expect(Number.isFinite(train.purchasePrice)).toBe(true);
    }
    expect(Number.isFinite(state.cash)).toBe(true);

    // --- Diesel and electric became available in the right years (SPEC §7.7) -----------------
    const newLocoNews = allNews.filter((n) => n.kind === "newLocomotive");
    function yearOf(item: NewsItem): number {
      return calendarFromTicks(START_YEAR, item.tick).year;
    }
    function announcedYear(locoId: string): number | undefined {
      const item = newLocoNews.find((n) => n.kind === "newLocomotive" && n.locoId === locoId);
      return item ? yearOf(item) : undefined;
    }

    expect(announcedYear("early-electric")).toBe(1905); // first Electric
    expect(announcedYear("streamliner-diesel")).toBe(1934); // first Diesel
    expect(announcedYear("modern-electric")).toBe(1960);

    // Every model introduced strictly after the scenario's start year got exactly one
    // announcement, in its SPEC §7.7 intro year.
    for (const loco of LOCOMOTIVES) {
      if (loco.introYear <= START_YEAR || loco.introYear > END_YEAR) continue;
      const matches = newLocoNews.filter((n) => n.kind === "newLocomotive" && n.locoId === loco.id);
      expect(matches.length).toBe(1);
      expect(yearOf(matches[0] as NewsItem)).toBe(loco.introYear);
    }

    // buyableLocomotivesIn agrees, purely from the data table (decoupled from the news log).
    expect(buyableLocomotivesIn(1904).some((l) => l.id === "early-electric")).toBe(false);
    expect(buyableLocomotivesIn(1905).some((l) => l.id === "early-electric")).toBe(true);
    expect(buyableLocomotivesIn(1933).some((l) => l.id === "streamliner-diesel")).toBe(false);
    expect(buyableLocomotivesIn(1934).some((l) => l.id === "streamliner-diesel")).toBe(true);

    // --- Steam can't be bought in 1961 (SPEC §7.6) -------------------------------------------
    expect(calendarFromTicks(state.startYear, state.ticks).year).toBeGreaterThan(
      STEAM_PHASE_OUT_YEAR,
    );
    expect(computeBuyTrainPlan(state, "american-4-4-0", []).valid).toBe(false);
    const steamAttempt = buyTrain(state, state.stations[0]!.id, "american-4-4-0", []);
    expect(steamAttempt.ok).toBe(false);
    if (steamAttempt.ok) throw new Error("unreachable");
    expect(steamAttempt.reason).toBe("steam-phased-out");
    // Diesel/electric are unaffected by the steam-only phase-out.
    expect(computeBuyTrainPlan(state, "road-switcher-diesel", []).valid).toBe(true);

    // --- Memory/state size stayed bounded ------------------------------------------------------
    expect(state.news.length).toBeLessThanOrEqual(NEWS_HISTORY_MAX);
    expect(state.finance.netWorthHistory.length).toBeLessThanOrEqual(NET_WORTH_HISTORY_MAX_SAMPLES);

    // --- City growth (SPEC §8.3, Phase 9): grows when served, stays bounded ------------------
    // A served two-city passenger shuttle running for 131 years grew well past its starting
    // population...
    expect(cityA.population).toBeGreaterThan(startingPopulation * 1.15);
    expect(cityB.population).toBeGreaterThan(startingPopulation * 1.15);
    // ...its footprint visibly grew, not just its population number...
    expect(cityA.tiles.length).toBeGreaterThan(4);
    // ...and none of that runs away unbounded even over 131 years of continuous service.
    expect(cityA.population).toBeLessThanOrEqual(CITY_TIER_DEFS.metropolis.maxPop);
    expect(cityB.population).toBeLessThanOrEqual(CITY_TIER_DEFS.metropolis.maxPop);
    expect(cityA.tiles.length).toBeLessThanOrEqual(80);
    expect(state.cityGrowth.size).toBeLessThanOrEqual(state.cities.length);
  }, 120_000);
});

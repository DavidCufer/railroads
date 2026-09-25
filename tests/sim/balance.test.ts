/**
 * PLAN Phase 7 / 7.1 acceptance tests: hand-built freight and passenger routes must land within
 * specific profit-per-train ranges at Normal difficulty (not just "any profit at all" — Phase 7's
 * review found a passenger shuttle earning ~8x a freight route, per PROGRESS.md's Phase 7.1 entry),
 * a full processing chain must out-earn a passenger shuttle per train, and a diversified small
 * network shouldn't double the player's cash in a single year. Everything here is hand-built via
 * commands on a synthetic map (no map-gen RNG) so the numbers are exactly reproducible; if a check
 * fails, CLAUDE.md/PLAN says to tune src/data/* tables (never the formulas) and record it as a SPEC
 * Deviation in PROGRESS.md.
 */
import { describe, expect, it } from "vitest";
import { buildStation, buildTrack, buyTrain, setOrders } from "../../src/sim/commands";
import { DIFFICULTY, ledgerNetProfit } from "../../src/data/finance";
import { INDUSTRIES } from "../../src/data/industries";
import { advanceOneHour } from "../../src/sim/tick";
import { makeTestMap, makeTestState, tileAt } from "./track/helpers";
import type { City, Industry } from "../../src/sim/economy/types";
import type { GameState } from "../../src/sim/state";

const TWO_YEARS_DAYS = 720;
const LOCO = "american-4-4-0"; // 1848, $45k, 6 cars max, cheap and widely available

function tickDays(state: GameState, days: number): void {
  for (let i = 0; i < days * 24; i++) advanceOneHour(state);
}

/** Ticks a full in-game year at a time and returns each year's *completed* ledger net profit
 * (via `finance.lastYear`, rolled over at each year boundary — see src/sim/tick.ts) — this is
 * what excludes one-time purchase costs from "steady-state" years after the first. */
function yearlyProfits(state: GameState, years: number): number[] {
  const profits: number[] = [];
  for (let y = 0; y < years; y++) {
    tickDays(state, 360);
    profits.push(ledgerNetProfit(state.finance.lastYear));
  }
  return profits;
}

/** Coal mine at (0,0), depot A at (0,1); steel mill at (distance,0), depot B at (distance,1) —
 * both industries sit just off their station (Chebyshev distance 1, inside a depot's 3×3
 * catchment). Steel mill's `coal: 8` acceptance point alone clears the ≥8 threshold, so station B
 * accepts coal without needing an iron mine too (this route only hauls coal). */
function buildCoalToSteelRoute(distanceTiles: number, cars: number): GameState {
  const width = distanceTiles + 1;
  const row = Array.from({ length: width }, () => "p").join("");
  const map = makeTestMap([row, row, row]);
  const state = makeTestState(map, { startYear: 1848 });

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
  const stationA = state.stations[0] as { id: number };
  const stationB = state.stations[1] as { id: number };

  const cargo: Array<"coal"> = Array.from({ length: cars }, () => "coal");
  const bought = buyTrain(state, stationA.id, LOCO, cargo);
  expect(bought.ok).toBe(true);
  const train = state.trains[0] as { id: number };
  const orders = setOrders(state, train.id, [
    { stationId: stationA.id, rule: "auto" },
    { stationId: stationB.id, rule: "auto" },
  ]);
  expect(orders.ok).toBe(true);

  return state;
}

/** Two 2×2 "cities" each fully inside the other end's `station`-type catchment (radius 2, so a
 * 5×5 area — easily covers a 2×2 block placed one tile off the station). Each city both supplies
 * and accepts passengers, so the shuttle earns revenue in both directions. */
function buildPassengerRoute(distanceTiles: number, population: number, cars: number): GameState {
  const width = distanceTiles + 3; // 1 extra tile of margin on each end for the city block
  const height = 4;
  const rows = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => "p").join(""),
  );
  const map = makeTestMap(rows);
  const state = makeTestState(map, { startYear: 1848 });

  function cityTiles(originX: number): number[] {
    return [
      tileAt(map, originX, 0),
      tileAt(map, originX + 1, 0),
      tileAt(map, originX, 1),
      tileAt(map, originX + 1, 1),
    ];
  }
  const cityAOrigin = 0;
  const cityBOrigin = width - 2;
  const cityA: City = {
    id: 0,
    name: "A-ville",
    tier: "city",
    population,
    anchorX: cityAOrigin,
    anchorY: 0,
    tiles: cityTiles(cityAOrigin),
    coastal: false,
  };
  const cityB: City = {
    id: 1,
    name: "B-ville",
    tier: "city",
    population,
    anchorX: cityBOrigin,
    anchorY: 0,
    tiles: cityTiles(cityBOrigin),
    coastal: false,
  };
  for (const t of cityA.tiles) map.cityId[t] = 0;
  for (const t of cityB.tiles) map.cityId[t] = 1;
  state.cities.push(cityA, cityB);

  const trackY = 2;
  const stationAX = 1;
  const stationBX = width - 2;
  const path = Array.from({ length: stationBX - stationAX + 1 }, (_, i) =>
    tileAt(map, stationAX + i, trackY),
  );
  expect(buildTrack(state, path).ok).toBe(true);
  expect(buildStation(state, tileAt(map, stationAX, trackY), "station").ok).toBe(true);
  expect(buildStation(state, tileAt(map, stationBX, trackY), "station").ok).toBe(true);
  const stationA = state.stations[0] as { id: number };
  const stationB = state.stations[1] as { id: number };

  const cargo: Array<"passengers"> = Array.from({ length: cars }, () => "passengers");
  const bought = buyTrain(state, stationA.id, LOCO, cargo);
  expect(bought.ok).toBe(true);
  const train = state.trains[0] as { id: number };
  const orders = setOrders(state, train.id, [
    { stationId: stationA.id, rule: "auto" },
    { stationId: stationB.id, rule: "auto" },
  ]);
  expect(orders.ok).toBe(true);

  return state;
}

/** A full processing chain, one straight line, `leg` tiles between each stage: coal+iron mine
 * hub (depot A) → steel mill (depot B, hauls coal+ore in) → factory (depot C, hauls steel in) →
 * a city (station D, hauls goods in) — SPEC §8.2's chain, 3 trains. Each industry sits one tile
 * off its own hub (same Chebyshev-1-inside-a-3×3-catchment trick as `buildCoalToSteelRoute`).
 * Only the *first* station built in a fresh `GameState` gets a free Engine Shed (SPEC §7 — buying
 * more is a Phase 9 station-improvement feature that doesn't exist yet); B and C are given one
 * directly here so each leg can buy its own train, the same test-only shortcut used below for the
 * 5-train network. */
function buildChain(leg: number): GameState {
  const width = leg * 3 + 1;
  const height = 3;
  const rows = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => "p").join(""),
  );
  const map = makeTestMap(rows);
  const state = makeTestState(map, { startYear: 1848 });

  const coalTile = tileAt(map, 0, 0);
  const ironTile = tileAt(map, 1, 0);
  const millTile = tileAt(map, leg, 0);
  const factoryTile = tileAt(map, leg * 2, 0);
  map.industryId[coalTile] = 0;
  map.industryId[ironTile] = 1;
  map.industryId[millTile] = 2;
  map.industryId[factoryTile] = 3;
  const industries: Industry[] = [
    { id: 0, type: "coalMine", x: 0, y: 0 },
    { id: 1, type: "ironMine", x: 1, y: 0 },
    { id: 2, type: "steelMill", x: leg, y: 0 },
    { id: 3, type: "factory", x: leg * 2, y: 0 },
  ];
  state.industries.push(...industries);
  state.industryEconomy.set(0, {
    inputStock: {},
    monthlyOutput: { ...INDUSTRIES.coalMine.produces },
  });
  state.industryEconomy.set(1, {
    inputStock: {},
    monthlyOutput: { ...INDUSTRIES.ironMine.produces },
  });
  state.industryEconomy.set(2, { inputStock: {}, monthlyOutput: {} });
  state.industryEconomy.set(3, { inputStock: {}, monthlyOutput: {} });

  const cityOrigin = leg * 3 - 1;
  const city: City = {
    id: 0,
    name: "Marketville",
    tier: "city",
    population: 40_000,
    anchorX: cityOrigin,
    anchorY: 0,
    tiles: [
      tileAt(map, cityOrigin, 0),
      tileAt(map, cityOrigin + 1, 0),
      tileAt(map, cityOrigin, 1),
      tileAt(map, cityOrigin + 1, 1),
    ],
    coastal: false,
  };
  for (const t of city.tiles) map.cityId[t] = 0;
  state.cities.push(city);

  const path = Array.from({ length: width }, (_, x) => tileAt(map, x, 1));
  expect(buildTrack(state, path).ok).toBe(true);
  expect(buildStation(state, tileAt(map, 0, 1), "depot").ok).toBe(true);
  expect(buildStation(state, tileAt(map, leg, 1), "depot").ok).toBe(true);
  expect(buildStation(state, tileAt(map, leg * 2, 1), "depot").ok).toBe(true);
  expect(buildStation(state, tileAt(map, leg * 3, 1), "station").ok).toBe(true);
  const stationA = state.stations[0] as { id: number };
  const stationB = state.stations[1] as { id: number; hasEngineShed: boolean };
  const stationC = state.stations[2] as { id: number; hasEngineShed: boolean };
  const stationD = state.stations[3] as { id: number };
  stationB.hasEngineShed = true;
  stationC.hasEngineShed = true;

  const t1 = buyTrain(state, stationA.id, LOCO, ["coal", "coal", "ironOre", "ironOre"]);
  expect(t1.ok).toBe(true);
  expect(
    setOrders(state, state.trains[0]!.id, [
      { stationId: stationA.id, rule: "auto" },
      { stationId: stationB.id, rule: "auto" },
    ]).ok,
  ).toBe(true);

  const t2 = buyTrain(state, stationB.id, LOCO, ["steel", "steel", "steel", "steel"]);
  expect(t2.ok).toBe(true);
  expect(
    setOrders(state, state.trains[1]!.id, [
      { stationId: stationB.id, rule: "auto" },
      { stationId: stationC.id, rule: "auto" },
    ]).ok,
  ).toBe(true);

  const t3 = buyTrain(state, stationC.id, LOCO, ["goods", "goods", "goods", "goods"]);
  expect(t3.ok).toBe(true);
  expect(
    setOrders(state, state.trains[2]!.id, [
      { stationId: stationC.id, rule: "auto" },
      { stationId: stationD.id, rule: "auto" },
    ]).ok,
  ).toBe(true);

  return state;
}

/** A single coal-mine → steel-mill route (`addRoute`'s train departs from `stationA`, which gets
 * a forced Engine Shed the same way `buildChain` does), placed at row-band `yBase` on a shared big
 * map so several independent routes — none sharing a mine, city, or catchment — can coexist in one
 * `GameState` and its one `cash` balance, for the "diversified small network" test below. */
function addNetworkCoalRoute(
  state: GameState,
  map: ReturnType<typeof makeTestMap>,
  yBase: number,
  distanceTiles: number,
): void {
  const width = distanceTiles + 1;
  const mineId = state.industries.length;
  const millId = mineId + 1;
  map.industryId[tileAt(map, 0, yBase)] = mineId;
  map.industryId[tileAt(map, width - 1, yBase)] = millId;
  state.industries.push(
    { id: mineId, type: "coalMine", x: 0, y: yBase },
    { id: millId, type: "steelMill", x: width - 1, y: yBase },
  );
  state.industryEconomy.set(mineId, {
    inputStock: {},
    monthlyOutput: { ...INDUSTRIES.coalMine.produces },
  });
  state.industryEconomy.set(millId, { inputStock: {}, monthlyOutput: {} });

  const path = Array.from({ length: width }, (_, x) => tileAt(map, x, yBase + 1));
  expect(buildTrack(state, path).ok).toBe(true);
  expect(buildStation(state, tileAt(map, 0, yBase + 1), "depot").ok).toBe(true);
  expect(buildStation(state, tileAt(map, width - 1, yBase + 1), "depot").ok).toBe(true);
  const stationA = state.stations[state.stations.length - 2] as {
    id: number;
    hasEngineShed: boolean;
  };
  const stationB = state.stations[state.stations.length - 1] as { id: number };
  stationA.hasEngineShed = true;

  const bought = buyTrain(state, stationA.id, LOCO, ["coal", "coal", "coal", "coal"]);
  expect(bought.ok).toBe(true);
  expect(
    setOrders(state, state.trains[state.trains.length - 1]!.id, [
      { stationId: stationA.id, rule: "auto" },
      { stationId: stationB.id, rule: "auto" },
    ]).ok,
  ).toBe(true);
}

function addNetworkPassengerRoute(
  state: GameState,
  map: ReturnType<typeof makeTestMap>,
  yBase: number,
  distanceTiles: number,
  population: number,
  trains: number,
): void {
  const width = distanceTiles + 3;
  function cityTiles(originX: number): number[] {
    return [
      tileAt(map, originX, yBase),
      tileAt(map, originX + 1, yBase),
      tileAt(map, originX, yBase + 1),
      tileAt(map, originX + 1, yBase + 1),
    ];
  }
  const cityAId = state.cities.length;
  const cityBId = cityAId + 1;
  const cityA: City = {
    id: cityAId,
    name: `A${cityAId}`,
    tier: "city",
    population,
    anchorX: 0,
    anchorY: yBase,
    tiles: cityTiles(0),
    coastal: false,
  };
  const cityB: City = {
    id: cityBId,
    name: `B${cityBId}`,
    tier: "city",
    population,
    anchorX: width - 2,
    anchorY: yBase,
    tiles: cityTiles(width - 2),
    coastal: false,
  };
  for (const t of cityA.tiles) map.cityId[t] = cityAId;
  for (const t of cityB.tiles) map.cityId[t] = cityBId;
  state.cities.push(cityA, cityB);

  const trackY = yBase + 2;
  const stationAX = 1;
  const stationBX = width - 2;
  const path = Array.from({ length: stationBX - stationAX + 1 }, (_, i) =>
    tileAt(map, stationAX + i, trackY),
  );
  expect(buildTrack(state, path).ok).toBe(true);
  expect(buildStation(state, tileAt(map, stationAX, trackY), "station").ok).toBe(true);
  expect(buildStation(state, tileAt(map, stationBX, trackY), "station").ok).toBe(true);
  const stationA = state.stations[state.stations.length - 2] as {
    id: number;
    hasEngineShed: boolean;
  };
  const stationB = state.stations[state.stations.length - 1] as { id: number };
  stationA.hasEngineShed = true;

  for (let i = 0; i < trains; i++) {
    const bought = buyTrain(state, stationA.id, LOCO, [
      "passengers",
      "passengers",
      "passengers",
      "passengers",
    ]);
    expect(bought.ok).toBe(true);
    expect(
      setOrders(state, state.trains[state.trains.length - 1]!.id, [
        { stationId: stationA.id, rule: "auto" },
        { stationId: stationB.id, rule: "auto" },
      ]).ok,
    ).toBe(true);
  }
}

describe("Phase 7.1 balance acceptance", () => {
  it("a good coal mine -> steel mill route earns $40k-$120k profit/yr/train (Normal)", () => {
    const state = buildCoalToSteelRoute(16, 4);
    const [, yr2] = yearlyProfits(state, 2);
    expect(yr2 as number).toBeGreaterThan(40_000);
    expect(yr2 as number).toBeLessThan(120_000);
  });

  it("a good two-city passenger route earns $80k-$200k profit/yr/train (Normal)", () => {
    const state = buildPassengerRoute(16, 40_000, 4);
    const [, yr2] = yearlyProfits(state, 2);
    expect(yr2 as number).toBeGreaterThan(80_000);
    expect(yr2 as number).toBeLessThan(200_000);
  });

  it("passenger/freight profit-per-train ratio for comparable routes is within 1x-2.5x", () => {
    const coal = buildCoalToSteelRoute(16, 4);
    const pax = buildPassengerRoute(16, 40_000, 4);
    const [, coalYr2] = yearlyProfits(coal, 2);
    const [, paxYr2] = yearlyProfits(pax, 2);
    const ratio = (paxYr2 as number) / (coalYr2 as number);
    expect(ratio).toBeGreaterThanOrEqual(1);
    expect(ratio).toBeLessThanOrEqual(2.5);
  });

  it("a coal+ore -> steel -> factory -> goods chain out-earns a passenger shuttle per train", () => {
    const chain = buildChain(12);
    const pax = buildPassengerRoute(12, 40_000, 4);
    const [, chainYr2] = yearlyProfits(chain, 2);
    const [, paxYr2] = yearlyProfits(pax, 2);
    const chainProfitPerTrain = (chainYr2 as number) / 3;
    expect(chainProfitPerTrain).toBeGreaterThan(paxYr2 as number);
  });

  it("doesn't print absurd money: 2-3 trains on a coal route stays under 10x starting cash", () => {
    const state = buildCoalToSteelRoute(12, 4);
    // A second, independent train shuttling the same route (a sensible small network, not a
    // pathological one) — bought at the same station, same orders.
    const stationAId = state.stations[0]!.id;
    const stationBId = state.stations[1]!.id;
    const second = buyTrain(state, stationAId, LOCO, ["coal", "coal", "coal", "coal"]);
    expect(second.ok).toBe(true);
    const secondTrain = state.trains[1] as { id: number };
    setOrders(state, secondTrain.id, [
      { stationId: stationAId, rule: "auto" },
      { stationId: stationBId, rule: "auto" },
    ]);

    const startingCash = DIFFICULTY.normal.startingCash;
    tickDays(state, TWO_YEARS_DAYS);

    expect(state.cash).toBeLessThan(startingCash * 10);
  });

  it("doesn't print absurd money: 3 trains on the (more generous) passenger route either", () => {
    // Passengers pay per-carload more than any freight cargo and this route is bidirectional (both
    // cities supply and accept), so it's the strongest case for an exploitable money-printer —
    // stress it with more trains than its two cities' supply can really keep fed.
    const state = buildPassengerRoute(12, 40_000, 4);
    const stationAId = state.stations[0]!.id;
    const stationBId = state.stations[1]!.id;
    for (let n = 0; n < 2; n++) {
      const bought = buyTrain(state, stationAId, LOCO, [
        "passengers",
        "passengers",
        "passengers",
        "passengers",
      ]);
      expect(bought.ok).toBe(true);
      const train = state.trains[state.trains.length - 1] as { id: number };
      setOrders(state, train.id, [
        { stationId: stationAId, rule: "auto" },
        { stationId: stationBId, rule: "auto" },
      ]);
    }
    expect(state.trains).toHaveLength(3);

    const startingCash = DIFFICULTY.normal.startingCash;
    tickDays(state, TWO_YEARS_DAYS);

    expect(state.cash).toBeLessThan(startingCash * 10);
  });

  it("a diversified 5-train network roughly doubles cash in 3-5 years, not in year one", () => {
    // 3 independent coal routes (separate mines/mills — no shared supply) + 2 passenger trains on
    // one route: a plausible "well-chosen" small network, not everything piled onto one mine's
    // fixed supply like the "absurd money" stress tests above.
    const width = 20;
    const height = 30;
    const rows = Array.from({ length: height }, () =>
      Array.from({ length: width }, () => "p").join(""),
    );
    const map = makeTestMap(rows);
    const state = makeTestState(map, { startYear: 1848 });

    addNetworkCoalRoute(state, map, 0, 16);
    addNetworkCoalRoute(state, map, 6, 16);
    addNetworkCoalRoute(state, map, 12, 16);
    addNetworkPassengerRoute(state, map, 18, 16, 40_000, 2);

    const startingCash = DIFFICULTY.normal.startingCash;
    const cashAfterBuilding = state.cash;
    expect(cashAfterBuilding).toBeGreaterThan(0); // affordable within the starting budget

    const cumulativeProfitByYear: number[] = [];
    for (let y = 0; y < 5; y++) {
      tickDays(state, 360);
      cumulativeProfitByYear.push(state.cash - cashAfterBuilding);
    }

    // Not a money-printer: didn't earn back half the original starting cash in year one alone.
    expect(cumulativeProfitByYear[0] as number).toBeLessThan(startingCash * 0.5);
    // But it is a going concern: by year 5, cumulative profit is roughly on the order of the
    // original starting cash (a rough "doubling"), landing within [0.5x, 2x] — not stalled, and
    // not printing money either.
    const yr5 = cumulativeProfitByYear[4] as number;
    expect(yr5).toBeGreaterThan(startingCash * 0.5);
    expect(yr5).toBeLessThan(startingCash * 2);
  });
});

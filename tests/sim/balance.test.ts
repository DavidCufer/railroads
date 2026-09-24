/**
 * PLAN Phase 7 acceptance test: a hand-built coal mine → steel mill route and a two-city passenger
 * route must both be profitable within 2 in-game years at Normal difficulty, and a sensible small
 * network shouldn't print absurd money either. Everything here is hand-built via commands on a
 * synthetic map (no map-gen RNG) so the numbers are exactly reproducible; if either check fails,
 * CLAUDE.md/PLAN says to tune src/data/* tables (never the formulas) and record it as a SPEC
 * Deviation in PROGRESS.md.
 */
import { describe, expect, it } from "vitest";
import { buildStation, buildTrack, buyTrain, setOrders } from "../../src/sim/commands";
import { DIFFICULTY } from "../../src/data/finance";
import { INDUSTRIES } from "../../src/data/industries";
import { advanceOneHour } from "../../src/sim/tick";
import { makeTestMap, makeTestState, tileAt } from "./track/helpers";
import type { City, Industry } from "../../src/sim/economy/types";
import type { GameState } from "../../src/sim/state";

const TWO_YEARS_DAYS = 720;
const LOCO = "american-4-4-0"; // 1848, $45k, 6 cars max, cheap and widely available

function tick(state: GameState, days: number): void {
  for (let i = 0; i < days * 24; i++) advanceOneHour(state);
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

describe("Phase 7 balance acceptance", () => {
  it("a coal mine -> steel mill route is profitable within 2 in-game years (Normal)", () => {
    const state = buildCoalToSteelRoute(12, 4);
    expect(state.difficulty).toBe("normal");
    const startingCash = state.cash;

    tick(state, TWO_YEARS_DAYS);

    expect(state.cash).toBeGreaterThan(startingCash);
  });

  it("a two-city passenger route is profitable within 2 in-game years (Normal)", () => {
    const state = buildPassengerRoute(12, 40_000, 4);
    expect(state.difficulty).toBe("normal");
    const startingCash = state.cash;

    tick(state, TWO_YEARS_DAYS);

    expect(state.cash).toBeGreaterThan(startingCash);
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
    tick(state, TWO_YEARS_DAYS);

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
    tick(state, TWO_YEARS_DAYS);

    expect(state.cash).toBeLessThan(startingCash * 10);
  });
});

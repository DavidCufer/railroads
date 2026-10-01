/** Phase 30A: land and way-leave costs (SPEC §9.5b item 8). */
import { describe, expect, it } from "vitest";
import { computeBuildPlan, computeStationBuildPlan, buildTrack } from "../../../src/sim/commands";
import { landPrices } from "../../../src/sim/economy/land";
import { findBuildPath } from "../../../src/sim/track/pathfind";
import { LAND_BASE_PER_TILE, STATION_LAND_TILES, landYearIndex } from "../../../src/data/economy";
import { makeTestMap, makeTestState, tileAt } from "../track/helpers";
import type { City } from "../../../src/sim/economy/types";
import type { GameState } from "../../../src/sim/state";

const SIZE = 41;

function world(
  population: number,
  opts: { year?: number; difficulty?: GameState["difficulty"] } = {},
): GameState {
  const rows = Array.from({ length: SIZE }, () => "p".repeat(SIZE));
  const map = makeTestMap(rows);
  const state = makeTestState(map, {
    startYear: opts.year ?? 1830,
    ...(opts.difficulty ? { difficulty: opts.difficulty } : {}),
  });
  const cx = 20;
  const cy = 20;
  const tiles: number[] = [];
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      tiles.push(tileAt(map, cx + dx, cy + dy));
      map.cityId[tileAt(map, cx + dx, cy + dy)] = 0;
    }
  const city: City = {
    id: 0,
    name: "Testville",
    tier: "city",
    population,
    anchorX: cx,
    anchorY: cy,
    tiles,
    coastal: false,
  };
  state.cities.push(city);
  state.cash = 1e12;
  return state;
}

describe("land prices", () => {
  it("open country costs the base rate; a city centre costs many times more, falling away with distance", () => {
    const s = world(100_000);
    const land = landPrices(s);
    const far = land.priceAt(tileAt(s.map, 0, 0));
    expect(far).toBeCloseTo(LAND_BASE_PER_TILE, 0);
    const centre = land.priceAt(tileAt(s.map, 20, 20));
    const edge = land.priceAt(tileAt(s.map, 20, 26));
    expect(centre).toBeGreaterThan(far * 8);
    expect(edge).toBeLessThan(centre / 2);
    expect(edge).toBeGreaterThan(far);
  });

  it("a bigger city makes dearer land", () => {
    const small = landPrices(world(12_000)).priceAt(tileAt(makeTestMap(["p"]), 0, 0));
    expect(small).toBeGreaterThan(0);
    const t = (pop: number): number => {
      const s = world(pop);
      return landPrices(s).priceAt(tileAt(s.map, 20, 20));
    };
    expect(t(12_000)).toBeLessThan(t(40_000));
    expect(t(40_000)).toBeLessThan(t(250_000));
  });

  it("land rises with the year faster than prices, and with difficulty", () => {
    expect(landYearIndex(1900)).toBeGreaterThan(landYearIndex(1830) * 3);
    const price = (year: number, d: GameState["difficulty"]): number => {
      const s = world(40_000, { year, difficulty: d });
      return landPrices(s).priceAt(tileAt(s.map, 20, 20));
    };
    expect(price(1900, "normal")).toBeGreaterThan(price(1830, "normal") * 3);
    expect(price(1900, "hard")).toBeGreaterThan(price(1900, "normal"));
    expect(price(1900, "easy")).toBeLessThan(price(1900, "normal"));
  });

  it("grows with the city: the cache follows its population", () => {
    const s = world(20_000);
    const before = landPrices(s).priceAt(tileAt(s.map, 20, 20));
    s.cities[0]!.population = 200_000;
    expect(landPrices(s).priceAt(tileAt(s.map, 20, 20))).toBeGreaterThan(before * 2);
  });
});

describe("land in build plans", () => {
  it("the build plan lists land separately and cost includes it", () => {
    const s = world(100_000);
    const row = (y: number): number[] =>
      Array.from({ length: 11 }, (_, i) => tileAt(s.map, 15 + i, y));
    const country = computeBuildPlan(s, row(2));
    const city = computeBuildPlan(s, row(20));
    expect(country.land).toBeGreaterThan(0);
    expect(country.land).toBeLessThan(country.cost * 0.2); // open country: land is a few percent of the bill
    expect(city.land).toBeGreaterThan(country.land * 5);
    expect(city.cost).toBeCloseTo(city.toBuild.reduce((n, st) => n + st.cost, 0) + city.land, 6);
    const cash = s.cash;
    const r = buildTrack(s, row(20));
    expect(r.ok).toBe(true);
    expect(cash - s.cash).toBeCloseTo(city.cost, 2);
    expect(s.finance.landSpent).toBeCloseTo(city.land, 6);
    // the track edges keep their construction price only (the refund and the double-track delta work from it)
    const edgeCost = s.trackGraph.allEdges().reduce((n, e) => n + e.cost, 0);
    expect(edgeCost).toBeCloseTo(city.cost - city.land, 2);
  });

  it("a station's land follows its size and where it stands", () => {
    const s = world(100_000);
    buildTrack(
      s,
      Array.from({ length: 41 }, (_, i) => tileAt(s.map, i, 20)),
    );
    const centre = tileAt(s.map, 20, 20);
    const outskirts = tileAt(s.map, 2, 20);
    const t = computeStationBuildPlan(s, centre, "terminal");
    const d = computeStationBuildPlan(s, outskirts, "depot");
    const price = landPrices(s);
    expect(t.land).toBeCloseTo(price.priceAt(centre) * STATION_LAND_TILES.terminal, 6);
    expect(t.land).toBeGreaterThan(d.land * 20);
  });

  it("the path search routes round dear land when a detour is cheap", () => {
    const s = world(250_000, { year: 1900 });
    const a = tileAt(s.map, 4, 20);
    const b = tileAt(s.map, 36, 20);
    const straight = findBuildPath(s.map, a, b, 1900);
    const priced = findBuildPath(s.map, a, b, 1900, { land: landPrices(s) });
    const through = (path: number[] | null): number =>
      (path ?? []).filter(
        (t) => Math.abs((t % SIZE) - 20) <= 2 && Math.abs(Math.floor(t / SIZE) - 20) <= 2,
      ).length;
    expect(through(straight)).toBeGreaterThan(0);
    expect(through(priced)).toBe(0);
  });
});

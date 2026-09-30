import { describe, expect, it } from "vitest";
import { acceptorsOf } from "../../../src/sim/stations/acceptors";
import { makeTestMap, makeTestState } from "../track/helpers";
import type { Station } from "../../../src/sim/stations/types";

describe("acceptorsOf (Phase 29 D)", () => {
  it("names the Port as the only acceptor of coal, and the city for passengers", () => {
    const map = makeTestMap(Array.from({ length: 10 }, () => "p".repeat(10)));
    const state = makeTestState(map, { startYear: 1900 });
    // A port at (6,5) and a town tile at (4,5); the station at (5,5) covers both.
    map.industryId[5 * 10 + 6] = 0;
    map.cityId[5 * 10 + 4] = 0;
    const industries = [{ id: 0, type: "port" as const, x: 6, y: 5 }];
    const cities = [
      { id: 0, name: "Trieste", tier: "town", tiles: [5 * 10 + 4] },
    ] as unknown as typeof state.cities;
    const station = { id: 1, tile: 5 * 10 + 5, type: "station" } as unknown as Station;
    const coal = acceptorsOf(map, cities, industries, station, "coal", 1900);
    expect(coal).toHaveLength(1);
    expect(coal[0]).toMatchObject({ kind: "industry", type: "port" });
    const pass = acceptorsOf(map, cities, industries, station, "passengers", 1900);
    expect(pass.some((a) => a.kind === "city" && a.id === 0)).toBe(true);
  });
});

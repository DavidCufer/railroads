import { describe, expect, it } from "vitest";
import { cityTileSupply, cityTravelDemand } from "../../../src/sim/economy/cityStats";
import type { City } from "../../../src/sim/economy/types";

const town = (population: number): City => ({ population, tiles: [1, 2, 3, 4] }) as unknown as City; // only population and tile count are read

describe("road competition on small towns (Phase 42)", () => {
  it("leaves 1900 demand alone and cuts a small town's passengers and mail by 1950", () => {
    const small = town(12_000);
    expect(cityTravelDemand(small, 1900)).toBeGreaterThan(0);
    expect(cityTravelDemand(small, 1950)).toBeLessThan(cityTravelDemand(small, 1900));
    expect(cityTileSupply(small, 1950).mail).toBeCloseTo(cityTileSupply(small, 1900).mail * 0.4, 5);
  });

  it("does not touch a big city", () => {
    const big = town(80_000);
    expect(cityTileSupply(big, 1980).mail).toBe(cityTileSupply(big, 1900).mail);
  });
});

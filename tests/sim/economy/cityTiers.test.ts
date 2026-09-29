import { describe, expect, it } from "vitest";
import { cityTileAcceptance, tierUnlocks } from "../../../src/sim/economy/cityStats";

describe("city demand ladder (Phase 26A)", () => {
  it("each tier opens new demand", () => {
    expect(tierUnlocks("town", 1900)).toEqual(["goods"]);
    expect(tierUnlocks("city", 1900)).toEqual(["fuel"]);
    expect(tierUnlocks("metropolis", 1900)).toContain("steel");
    expect(tierUnlocks("village", 1900)).toEqual([]);
  });
  it("villages do not take goods; fuel waits for its era", () => {
    expect(cityTileAcceptance("village", 1900).goods).toBeUndefined();
    expect(cityTileAcceptance("city", 1850).fuel).toBeUndefined();
    expect(cityTileAcceptance("city", 1900).fuel).toBe(1);
  });
});

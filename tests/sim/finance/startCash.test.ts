/** Phase 41 (PLAYTEST-4 BAL1): start cash follows the era's price level; 1840 is unchanged. */
import { describe, expect, it } from "vitest";
import { DIFFICULTY, ERA_START_CASH_MULT, startingCashFor } from "../../../src/data/finance";
import { createGameState } from "../../../src/sim/state";

describe("starting cash by era", () => {
  it("is the difficulty's figure before 1930, so 1840 and 1900 are unchanged", () => {
    for (const year of [1830, 1840, 1860, 1900, 1929])
      for (const d of ["easy", "normal", "hard"] as const)
        expect(startingCashFor(d, year)).toBe(DIFFICULTY[d].startingCash);
  });

  it("rises with the late eras, never falls, and scales every difficulty alike", () => {
    let last = 0;
    for (const year of [1830, 1900, 1930, 1950, 1970]) {
      const cash = startingCashFor("normal", year);
      expect(cash).toBeGreaterThanOrEqual(last);
      last = cash;
      expect(startingCashFor("hard", year) / startingCashFor("normal", year)).toBeCloseTo(
        DIFFICULTY.hard.startingCash / DIFFICULTY.normal.startingCash,
        9,
      );
    }
    expect(startingCashFor("normal", 1950)).toBeGreaterThan(startingCashFor("normal", 1930));
    expect(ERA_START_CASH_MULT[0]![1]).toBe(1);
  });

  it("is what a new game starts with", () => {
    const state = createGameState({
      seed: 1,
      region: "central-eu",
      startYear: 1950,
      difficulty: "hard",
    });
    expect(state.cash).toBe(startingCashFor("hard", 1950));
    const old = createGameState({ seed: 1, region: "central-eu", startYear: 1840 });
    expect(old.cash).toBe(1_000_000);
  });
});

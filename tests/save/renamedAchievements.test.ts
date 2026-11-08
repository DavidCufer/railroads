/** Phase 90: the yearly-profit achievements were rescaled and renamed; old saves and profiles map to the new ids. */
import { describe, expect, it } from "vitest";
import { ACHIEVEMENT_IDS, renameAchievements } from "../../src/data/achievements";
import { deserializeGameState, serializeGameState } from "../../src/save/serialize";
import { createGameState } from "../../src/sim/state";

describe("renamed achievements (Phase 90)", () => {
  it("maps the old ids to the new ones and keeps the earlier time of two", () => {
    const out = renameAchievements({
      profit250k: 40,
      profit2500k: 90,
      firstTrain: 3,
      profit150k: 25,
    });
    expect(out).toEqual({ profit150k: 25, profit1m: 90, firstTrain: 3 });
    expect(renameAchievements({ profit7500k: "2026-01-02" })).toEqual({ profit3m: "2026-01-02" });
  });

  it("a save that holds the old ids loads with the new ones, and every id is a real achievement", () => {
    const state = createGameState({
      seed: 1,
      region: "central-eu",
      startYear: 1900,
      difficulty: "normal",
    });
    state.history.achievements = { profit250k: 10, profit2500k: 20, firstTrain: 1 };
    const loaded = deserializeGameState(serializeGameState(state));
    expect(loaded.history.achievements).toEqual({ profit150k: 10, profit1m: 20, firstTrain: 1 });
    for (const id of Object.keys(loaded.history.achievements))
      expect(ACHIEVEMENT_IDS).toContain(id);
  });
});

/** PLAN Phase 11: "migration from a fake v0 fixture" — proves the version-chain migration
 * scaffold actually rewrites an older save into the current format, not just that it recognizes
 * `version: 1` and passes it through untouched. */
import { describe, expect, it } from "vitest";
import { migrateSaveFile, type SaveFileV0Fixture } from "../../src/save/migrate";
import { CURRENT_SAVE_VERSION, type SaveFileV1 } from "../../src/save/format";
import { serializeGameState } from "../../src/save/serialize";
import { makeTestMap, makeTestState } from "../sim/track/helpers";

function v0Fixture(): SaveFileV0Fixture {
  const state = serializeGameState(makeTestState(makeTestMap(["ppp", "ppp"])));
  const { cash, goals, goalsCompleted, pendingGoalCelebrations, ...rest } = state;
  void goals;
  void goalsCompleted;
  void pendingGoalCelebrations;
  const { mapContentVersion, cargoDeliveredThisYear, cargoDeliveredBestYear, ...v0State } = rest;
  void mapContentVersion;
  void cargoDeliveredThisYear;
  void cargoDeliveredBestYear;
  return {
    version: 0,
    state: { ...v0State, money: cash },
  };
}

describe("save migration scaffold", () => {
  it("migrates a v0 fixture up to the current version, filling in fields that didn't exist yet", () => {
    const migrated = migrateSaveFile(v0Fixture());

    expect(migrated.version).toBe(CURRENT_SAVE_VERSION);
    expect(migrated.state.cash).toBe(1_000_000); // renamed from v0's `money`
    expect(migrated.state.goals).toEqual([]);
    expect(migrated.state.goalsCompleted).toEqual([]);
    expect(migrated.state.pendingGoalCelebrations).toEqual([]);
    expect(migrated.state.cargoDeliveredThisYear).toEqual({});
    expect(migrated.state.cargoDeliveredBestYear).toEqual({});
    expect(migrated.state.mapContentVersion).toBe(0);
    expect(migrated.meta.cash).toBe(1_000_000);
  });

  it("passes a current-version save through unchanged", () => {
    const state = serializeGameState(makeTestState(makeTestMap(["pp"])));
    const file: { version: 1; meta: SaveFileV1["meta"]; state: typeof state } = {
      version: CURRENT_SAVE_VERSION,
      meta: { savedAt: 1, year: 1830, month: 1, day: 1, cash: 1_000_000, mapLabel: "Test" },
      state,
    };
    expect(migrateSaveFile(file)).toBe(file);
  });

  it("throws on an unrecognized future version rather than guessing", () => {
    expect(() => migrateSaveFile({ version: 99 })).toThrow();
  });
});

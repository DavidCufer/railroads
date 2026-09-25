/**
 * Migration scaffold (SPEC §13: "version number and a migration function per version bump").
 * `migrateSaveFile` walks a raw parsed save forward one version at a time until it reaches
 * `CURRENT_SAVE_VERSION`, so a future version bump only ever needs one new `migrateVNtoVN+1`
 * function plus one new `case` here — every older save keeps loading through the same chain.
 *
 * v1 is the first real format (this phase), so there is no genuine v0 save in the wild to migrate
 * from. `SaveFileV0Fixture`/`migrateV0toV1` below exist purely to prove the scaffold itself works
 * end to end (SPEC/PLAN Phase 11's "migration from a fake v0 fixture" test) — a stand-in for
 * "whatever the previous format happened to be" the day a real v1→v2 migration is first needed.
 */
import { CURRENT_SAVE_VERSION, type SaveFileV1 } from "./format";

/** A deliberately minimal, hand-shaped stand-in for "an older save format" — not a shape this
 * game ever actually wrote. Money was called `money`; the goals system, per-year cargo delivery
 * tracking, and the map-content-version counter didn't exist yet. */
export interface SaveFileV0Fixture {
  version: 0;
  state: Omit<
    SaveFileV1["state"],
    | "cash"
    | "goals"
    | "goalsCompleted"
    | "pendingGoalCelebrations"
    | "cargoDeliveredThisYear"
    | "cargoDeliveredBestYear"
    | "mapContentVersion"
  > & { money: number };
}

export function migrateV0toV1(v0: SaveFileV0Fixture): SaveFileV1 {
  const { money, ...restState } = v0.state;
  const state: SaveFileV1["state"] = {
    ...restState,
    cash: money,
    goals: [],
    goalsCompleted: [],
    pendingGoalCelebrations: [],
    cargoDeliveredThisYear: {},
    cargoDeliveredBestYear: {},
    mapContentVersion: 0,
  };
  return {
    version: 1,
    meta: {
      savedAt: Date.now(),
      year: state.startYear,
      month: 1,
      day: 1,
      cash: state.cash,
      mapLabel: state.regionId ?? "Random map",
    },
    state,
  };
}

/** Upgrades a raw parsed save (any prior version) to the current format. Throws on a version this
 * build has never heard of (newer than `CURRENT_SAVE_VERSION`, or garbage) rather than guessing. */
export function migrateSaveFile(raw: unknown): SaveFileV1 {
  const version = (raw as { version?: unknown } | null)?.version;
  if (version === CURRENT_SAVE_VERSION) return raw as SaveFileV1;
  if (version === 0) return migrateV0toV1(raw as SaveFileV0Fixture);
  throw new Error(`Unrecognized save version: ${JSON.stringify(version)}`);
}

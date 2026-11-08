/**
 * Achievements (Phase 46): milestones of a company. The table only names them and gives the figure to reach; the checks live
 * in src/sim/history/achievements.ts (`ACHIEVEMENT_CHECKS`) and the words in src/ui/strings.ts (`achievements.items`).
 */
export const ACHIEVEMENT_IDS = [
  "firstTrain",
  "firstLine",
  "track100",
  "track1000",
  "track5000",
  "trains10",
  "trains50",
  "stations20",
  "panicSurvived",
  "outOfDebt",
  "firstContract",
  "contracts5",
  "silverDelivered",
  "uraniumDelivered",
  "bridges10",
  "electrified",
  "metropolisServed",
  "profit150k",
  "profit1m",
  "profit3m",
  "passengers100k",
  "freight10k",
  "goalReached",
  "scenarioWon",
  "hardSurvivor20",
] as const;

export type AchievementId = (typeof ACHIEVEMENT_IDS)[number];

/** The figures the thresholds above name. */
export const ACHIEVEMENT_TARGETS = {
  track100: 100,
  track1000: 1_000,
  track5000: 5_000,
  trains10: 10,
  trains50: 50,
  stations20: 20,
  contracts5: 5,
  bridges10: 10,
  /** Phase 67: yearly operating profit of the last completed year (it replaces net worth, which counted construction at
   * half and so punished building). Nominal dollars, from the reference medians (`STRONG_PLAYER_MEDIANS`). Phase 90 (owner
   * 2026-11-08, lean economy: route demand, goals scaled down): 150k = just under the lowest year-5 median of any era (1840: 0.41M),
   * 1.0M = the middle of the five eras' year-16 medians (1.06M), 3.0M = just above the best one (1950: 2.9M). Year 5 for the first
   * rung because a first line pays back in about that time, year 16 for the others because those are what a mature company
   * earns. (Phases 67-84: $0.25M / $2.5M / $7.5M, ids `profit250k` / `profit2500k` / `profit7500k`, see `RENAMED_ACHIEVEMENTS`.) */
  profit150k: 150_000,
  profit1m: 1_000_000,
  profit3m: 3_000_000,
  passengers100k: 100_000,
  freight10k: 10_000,
  hardSurvivorYears: 20,
} as const;

/** Phase 90: achievements whose id changed with their amount. An old save or profile that holds the old id gets the new one (every old
 * amount was higher than its new one, so whoever earned the old one has earned the new one). */
export const RENAMED_ACHIEVEMENTS: Readonly<Record<string, AchievementId>> = {
  profit250k: "profit150k",
  profit2500k: "profit1m",
  profit7500k: "profit3m",
};

/** `record` (achievement id -> when) with the renamed ids mapped to their new ones; the earlier of two entries for one id wins. Pure. */
export function renameAchievements<T extends number | string>(
  record: Readonly<Record<string, T>>,
): Record<string, T> {
  const out: Record<string, T> = {};
  for (const [id, when] of Object.entries(record)) {
    const to = RENAMED_ACHIEVEMENTS[id] ?? id;
    const old = out[to];
    out[to] = old === undefined || when < old ? when : old;
  }
  return out;
}

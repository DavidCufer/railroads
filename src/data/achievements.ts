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
  "worth1M",
  "worth10M",
  "worth100M",
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
  worth1M: 1_000_000,
  worth10M: 10_000_000,
  worth100M: 100_000_000,
  passengers100k: 100_000,
  freight10k: 10_000,
  hardSurvivorYears: 20,
} as const;

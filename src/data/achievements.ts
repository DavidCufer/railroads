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
  "profit250k",
  "profit2200k",
  "profit7500k",
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
   * half and so punished building). Nominal dollars, from the Strategist's Normal medians (`STRONG_PLAYER_MEDIANS`, Phase 84):
   * 250k = just under the lowest year-5 median of any era (1950: 0.32M), 2.2M = the middle of the five eras' year-16
   * medians (2.18M), 7.5M = just above the best one (1870: 7.25M). Year 5 for the first rung because a
   * first line pays back in about that time, year 16 for the others because those are what a mature company earns. */
  profit250k: 250_000,
  profit2200k: 2_200_000,
  profit7500k: 7_500_000,
  passengers100k: 100_000,
  freight10k: 10_000,
  hardSurvivorYears: 20,
} as const;

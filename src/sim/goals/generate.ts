/**
 * Turns author-time goal defs into resolved, runtime `Goal`s (SPEC §11). Real-world regions use
 * their hand-authored set from `src/data/goals.ts` (city names resolved to this game's actual
 * `City.id`s); random maps get a generated bronze/silver/gold set built from the same six types,
 * using the map's own cities and the game's seeded RNG (never `Math.random` — CLAUDE.md's sim
 * hard rule) so it's deterministic from the seed like everything else.
 */
import type { CargoType } from "../../data/cargo";
import { CITY_TIERS } from "../../data/cities";
import { DIFFICULTY } from "../../data/finance";
import { REGION_GOALS, type GoalDefByName } from "../../data/goals";
import type { RegionId } from "../regions/types";
import { nextInt, pick } from "../rng";
import type { GameState } from "../state";
import type { City } from "../economy/types";
import type { Goal, GoalDef } from "./types";

function resolveDef(def: GoalDefByName, byName: Map<string, number>): GoalDef | null {
  switch (def.type) {
    case "connect": {
      const cityIds = def.cities.map((name) => byName.get(name));
      if (cityIds.some((id) => id === undefined)) return null;
      return { type: "connect", cityIds: cityIds as number[], byYear: def.byYear };
    }
    case "cityTier": {
      const cityId = byName.get(def.city);
      if (cityId === undefined) return null;
      return { type: "cityTier", cityId, tier: def.tier, byYear: def.byYear };
    }
    case "annualRevenue":
    case "netWorth":
    case "delivered":
    case "electrifiedTiles":
      return def;
  }
}

/** Resolves the shipped region's hand-authored goal set (`src/data/goals.ts`) against this game's
 * actual city ids. A goal referencing a city name that isn't in this region is silently dropped
 * rather than throwing — defensive against a future data typo, though every name in
 * `REGION_GOALS` is checked against its region's real city list at write time. */
export function resolveRegionGoals(state: GameState, regionId: RegionId): Goal[] {
  const defs = REGION_GOALS[regionId] ?? [];
  const byName = new Map(state.cities.map((c) => [c.name, c.id]));
  const goals: Goal[] = [];
  for (const { tier, def } of defs) {
    const resolved = resolveDef(def, byName);
    if (resolved) goals.push({ id: `${regionId}-${tier}`, tier, def: resolved });
  }
  return goals;
}

const DELIVERED_CARGO_CHOICES: CargoType[] = ["coal", "goods", "food", "passengers"];

/** Generates a bronze/silver/gold goal set for a random map (SPEC §11: "Random maps: goals
 * generated from the same types"), scaled off the map's own biggest cities and the difficulty's
 * starting cash rather than fixed numbers, so a Small/easy map and a Large/hard map both get
 * goals in a plausible range for that game. */
export function generateRandomGoals(state: GameState): Goal[] {
  const goals: Goal[] = [];
  const byPopulation = [...state.cities].sort((a, b) => b.population - a.population);
  const biggest = byPopulation[0];
  const secondBiggest = byPopulation[1];
  const startingCash = DIFFICULTY[state.difficulty].startingCash;

  if (biggest && secondBiggest) {
    goals.push({
      id: "random-bronze",
      tier: "bronze",
      def: {
        type: "connect",
        cityIds: [biggest.id, secondBiggest.id],
        byYear: state.startYear + 20,
      },
    });
  }

  const cargo = pick(state.rng, DELIVERED_CARGO_CHOICES);
  goals.push({
    id: "random-silver",
    tier: "silver",
    def: { type: "delivered", cargo, amount: 500, withinYear: state.startYear + 30 },
  });

  const goldByYear = state.startYear + 50;
  const goldPick = nextInt(state.rng, 0, 2);
  if (goldPick === 0 && biggest) {
    const nextTierIndex = Math.min(
      CITY_TIERS.indexOf(biggest.tier as City["tier"]) + 1,
      CITY_TIERS.length - 1,
    );
    goals.push({
      id: "random-gold",
      tier: "gold",
      def: {
        type: "cityTier",
        cityId: biggest.id,
        tier: CITY_TIERS[nextTierIndex] as City["tier"],
        byYear: goldByYear,
      },
    });
  } else if (goldPick === 1) {
    goals.push({
      id: "random-gold",
      tier: "gold",
      def: { type: "netWorth", amount: startingCash * 20, byYear: goldByYear },
    });
  } else {
    goals.push({
      id: "random-gold",
      tier: "gold",
      def: { type: "annualRevenue", amount: startingCash * 5, byYear: goldByYear },
    });
  }

  return goals;
}

export function createGoalsForNewGame(state: GameState, regionId: RegionId | undefined): Goal[] {
  if (regionId) return resolveRegionGoals(state, regionId);
  return generateRandomGoals(state);
}

/**
 * PLAN Phase 28A / Phase 64: money goals (yearly profit or revenue; no goal counts cash) are set from the economy, not
 * guessed. The reference operator
 * (tests/sim/referenceOperator.ts) is an able player compounding the balance report's measured per-train profit;
 * gold goals must sit above it (PLAYTEST-1: "gold goals are trivially reachable"), silver near it, and nothing
 * may be out of reach.
 */
import { describe, expect, it } from "vitest";
import { DIFFICULTY } from "../../src/data/finance";
import { REGION_GOALS, strongPlayerAmount, type GoalDefByName } from "../../src/data/goals";
import { generateRandomGoals } from "../../src/sim/goals/generate";
import { createGameState } from "../../src/sim/state";
import { OLD_ECONOMY, ROUTE_QUALITY, referenceOperator } from "./referenceOperator";

const REGION_START = { gb: 1830, "us-east": 1830, "central-eu": 1840, "us-west": 1860 } as const;

function reference(start: number, byYear: number, cash: number) {
  return referenceOperator(start, byYear, cash).pop()!;
}

describe("reference operator", () => {
  it("reproduces the play-test's Central Europe game on the old economy (16 trains, ~$1.1M revenue in 1869)", () => {
    const old = referenceOperator(1840, 1869, 1_000_000, OLD_ECONOMY).pop()!;
    expect(old.fleet).toBe(16);
    expect(old.revenue).toBeGreaterThan(0.8e6);
    expect(old.revenue).toBeLessThan(1.5e6); // play-test: $1.18M in 1868
    expect(ROUTE_QUALITY).toBeLessThan(0.5); // real trains earn far less than the best-route archetype
  });
});

describe("money goals sit where the new economy puts an able player", () => {
  for (const [region, goals] of Object.entries(REGION_GOALS) as Array<
    [keyof typeof REGION_START, (typeof REGION_GOALS)[keyof typeof REGION_GOALS]]
  >) {
    for (const { tier, def } of goals) {
      if (def.type !== "annualProfit" && def.type !== "annualRevenue") continue;
      it(`${region} ${tier}: ${def.type} ${def.amount} by ${def.byYear}`, () => {
        checkMoneyGoal(def, tier, REGION_START[region], DIFFICULTY.normal.startingCash);
      });
    }
  }

  it("random maps: the gold goal is out of the able player's easy reach and within sight, Easy to Hard", () => {
    for (const difficulty of ["easy", "normal", "hard"] as const) {
      for (let seed = 1; seed <= 12; seed++) {
        const state = createGameState({
          seed,
          size: "small",
          waterLevel: "normal",
          roughness: "normal",
          difficulty,
        });
        const gold = generateRandomGoals(state).find((g) => g.tier === "gold")!;
        if (gold.def.type !== "annualProfit" && gold.def.type !== "annualRevenue") continue;
        checkMoneyGoal(
          gold.def as Extract<GoalDefByName, { type: "annualProfit" | "annualRevenue" }>,
          "gold",
          state.startYear,
          DIFFICULTY[difficulty].startingCash,
        );
      }
    }
  });
});

function checkMoneyGoal(
  def: Extract<GoalDefByName, { type: "annualProfit" | "annualRevenue" }>,
  tier: "bronze" | "silver" | "gold",
  startYear: number,
  startCash: number,
): void {
  const ref = reference(startYear, def.byYear, startCash);
  const reached = def.type === "annualProfit" ? ref.profit : ref.revenue;
  const ratio = def.amount / reached;
  if (tier === "gold") {
    expect(ratio, "gold must not be trivial").toBeGreaterThanOrEqual(0.8);
    expect(ratio, "gold must stay reachable").toBeLessThanOrEqual(3);
  } else {
    expect(ratio, "silver/bronze must not be trivial").toBeGreaterThanOrEqual(0.3);
    expect(ratio, "silver must stay reachable").toBeLessThanOrEqual(1.5);
  }
}

describe("goal amounts follow the Phase 65 strong-player formula", () => {
  it("restates the bench median in the goal year's money and rounds down to two figures", () => {
    // Phase 67 medians. 1900 row, revenue year 5: $4.17M earned in 1904, asked in 1920 money, rounded down.
    expect(strongPlayerAmount("revenue", 5, 1920)).toBe(4_500_000);
    // 1870 row, year 16: $9.13M earned in 1885 (price index 1.67), asked in 1870 money (1.48): 8.1M.
    expect(strongPlayerAmount("profit", 16, 1870)).toBe(8_100_000);
  });

  it("no region goal counts cash or net worth", () => {
    for (const goals of Object.values(REGION_GOALS))
      for (const { def } of goals) expect(def.type).not.toBe("netWorth");
  });
});

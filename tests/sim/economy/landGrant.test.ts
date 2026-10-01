/** Phase 30A: goals grant land credit (historical land grants). */
import { describe, expect, it } from "vitest";
import { buildStation, buildTrack, computeBuildPlan } from "../../../src/sim/commands";
import { dailyGoalsStep } from "../../../src/sim/economy/goalTracking";
import { GOAL_LAND_GRANT_1830, goalLandGrant } from "../../../src/data/economy";
import { makeTestMap, makeTestState, tileAt } from "../track/helpers";
import type { GameState } from "../../../src/sim/state";

function world(): GameState {
  const map = makeTestMap(["pppppppppppp"]);
  const state = makeTestState(map, { startYear: 1860, cash: 1e9 });
  state.goals = [
    { id: "g-bronze", tier: "bronze", def: { type: "netWorth", amount: 1, byYear: 1900 } },
  ];
  return state;
}

describe("goal land grants", () => {
  it("scale with the tier and the price level of the year", () => {
    expect(goalLandGrant("bronze", 1830)).toBe(GOAL_LAND_GRANT_1830.bronze);
    expect(goalLandGrant("gold", 1830)).toBeGreaterThan(goalLandGrant("silver", 1830));
    expect(goalLandGrant("silver", 1830)).toBeGreaterThan(goalLandGrant("bronze", 1830));
    expect(goalLandGrant("bronze", 1900)).toBeGreaterThan(goalLandGrant("bronze", 1830));
  });

  it("completing a goal credits the land account once, and announces the grant", () => {
    const s = world();
    dailyGoalsStep(s);
    dailyGoalsStep(s);
    const grant = goalLandGrant("bronze", 1860);
    expect(s.finance.landCredit).toBe(grant);
    expect(s.finance.landCreditGranted).toBe(grant);
    const news = s.news.find((n) => n.kind === "goalCompleted");
    expect(news).toMatchObject({ kind: "goalCompleted", grant });
  });

  it("the credit pays land bills before cash does, and runs out", () => {
    const s = world();
    s.finance.landCredit = 1_000;
    const path = Array.from({ length: 12 }, (_, x) => tileAt(s.map, x, 0));
    const plan = computeBuildPlan(s, path);
    expect(plan.land).toBeGreaterThan(1_000);
    expect(plan.landGrant).toBe(1_000);
    const construction = plan.toBuild.reduce((n, st) => n + st.cost, 0);
    expect(plan.cost).toBeCloseTo(construction + plan.land - 1_000, 6);
    const cash = s.cash;
    expect(buildTrack(s, path).ok).toBe(true);
    expect(cash - s.cash).toBeCloseTo(plan.cost, 6);
    expect(s.finance.landCredit).toBe(0);
    // the next land bill is paid in full
    const station = buildStation(s, path[3]!, "depot");
    expect(station.ok && station.cost).toBeGreaterThan(0);
  });

  it("a big credit covers a whole station's land", () => {
    const s = world();
    const path = Array.from({ length: 12 }, (_, x) => tileAt(s.map, x, 0));
    buildTrack(s, path);
    s.finance.landCredit = 1e9;
    const cash = s.cash;
    const r = buildStation(s, path[4]!, "terminal");
    expect(r.ok).toBe(true);
    expect(cash - s.cash).toBeLessThan(250_000); // the building only (a Terminal is $100k × the 1860 price level)
    expect(s.finance.landCredit).toBeLessThan(1e9);
  });
});

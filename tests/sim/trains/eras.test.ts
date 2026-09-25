/**
 * PLAN Phase 8 acceptance tests: locomotive availability by year, the monthly breakdown
 * probability formula (SPEC §7.6), trade-in value (SPEC §7.6), steam can't be bought after 1960,
 * and the Electrify command. `findTrainRoute`'s "electric locos refuse non-electrified routes" is
 * already covered in route.test.ts; this file adds `isElectrificationOnlyBlocker`'s own tests
 * there too.
 */
import { describe, expect, it } from "vitest";
import {
  buildStation,
  buildTrack,
  buyTrain,
  computeBuyTrainPlan,
  computeElectrifyPlan,
  computeReplaceLocoPlan,
  electrifyTrack,
} from "../../../src/sim/commands";
import {
  BREAKDOWN_BASE_CHANCE_BY_RELIABILITY,
  BREAKDOWN_ENGINE_SHED_MULT,
  buyableLocomotivesIn,
  locomotivesAvailableIn,
  STEAM_PHASE_OUT_YEAR,
  TRADE_IN_BASE_FRACTION,
  TRADE_IN_MIN_FRACTION,
} from "../../../src/data/trains";
import { eraInflation } from "../../../src/data/finance";
import { ELECTRIFICATION_ERA } from "../../../src/data/track";
import { monthlyBreakdownStep } from "../../../src/sim/trains/breakdown";
import { DAYS_PER_YEAR, HOURS_PER_DAY } from "../../../src/sim/time";
import type { Train } from "../../../src/sim/trains/types";
import { makeTestMap, makeTestState, tileAt } from "../track/helpers";

// --- Availability by year (SPEC §7.7) -----------------------------------------------------------

describe("locomotive era availability", () => {
  it("locomotivesAvailableIn only includes models introduced by that year", () => {
    expect(locomotivesAvailableIn(1830).map((l) => l.id)).toEqual(["grasshopper-0-4-0"]);
    expect(locomotivesAvailableIn(1848).map((l) => l.id)).toContain("american-4-4-0");
    expect(locomotivesAvailableIn(1847).map((l) => l.id)).not.toContain("american-4-4-0");
  });

  it("buyableLocomotivesIn excludes steam once phased out but keeps diesel/electric", () => {
    const atCutoff = buyableLocomotivesIn(STEAM_PHASE_OUT_YEAR);
    expect(atCutoff.some((l) => l.type === "steam")).toBe(true);

    const pastCutoff = buyableLocomotivesIn(STEAM_PHASE_OUT_YEAR + 1);
    expect(pastCutoff.some((l) => l.type === "steam")).toBe(false);
    expect(pastCutoff.some((l) => l.type === "diesel")).toBe(true);
    expect(pastCutoff.some((l) => l.type === "electric")).toBe(true);
  });
});

// --- Steam phase-out (SPEC §7.6) ------------------------------------------------------------

function stationState(startYear: number): {
  state: ReturnType<typeof makeTestState>;
  stationId: number;
} {
  const map = makeTestMap(["ppp"]);
  const state = makeTestState(map, { startYear });
  const path = [tileAt(map, 0, 0), tileAt(map, 1, 0), tileAt(map, 2, 0)];
  buildTrack(state, path);
  buildStation(state, tileAt(map, 0, 0), "depot");
  return { state, stationId: state.stations[0]!.id };
}

describe("steam phase-out", () => {
  it("computeBuyTrainPlan rejects steam after 1960 but accepts it exactly at 1960", () => {
    const { state: at1960 } = stationState(1960);
    expect(computeBuyTrainPlan(at1960, "american-4-4-0", []).valid).toBe(true);

    const { state: at1961 } = stationState(1961);
    expect(computeBuyTrainPlan(at1961, "american-4-4-0", []).valid).toBe(false);
  });

  it("buyTrain fails with steam-phased-out after 1960, but diesel still buys fine", () => {
    const { state, stationId } = stationState(1961);

    const steamResult = buyTrain(state, stationId, "american-4-4-0", []);
    expect(steamResult.ok).toBe(false);
    if (steamResult.ok) throw new Error("unreachable");
    expect(steamResult.reason).toBe("steam-phased-out");

    const dieselResult = buyTrain(state, stationId, "streamliner-diesel", []);
    expect(dieselResult.ok).toBe(true);
  });
});

// --- Trade-in value (SPEC §7.6) -------------------------------------------------------------

describe("Replace Locomotive trade-in", () => {
  it("is 30% of the old loco's current era-adjusted price for a brand-new train", () => {
    const { state, stationId } = stationState(1848);
    buyTrain(state, stationId, "american-4-4-0", []);
    const trainId = state.trains[0]!.id;

    // norris-4-2-0 (1838, $34k) is available by 1848, unlike a later model.
    const plan = computeReplaceLocoPlan(state, trainId, "norris-4-2-0");
    expect(plan.valid).toBe(true);
    const oldLocoValue = 45_000 * eraInflation(1848);
    expect(plan.tradeInValue).toBeCloseTo(oldLocoValue * TRADE_IN_BASE_FRACTION, 4);
    expect(plan.netCost).toBeCloseTo(34_000 * eraInflation(1848) - plan.tradeInValue, 4);
  });

  it("decreases 3%/year of age, floored at 10%", () => {
    const { state, stationId } = stationState(1848);
    buyTrain(state, stationId, "american-4-4-0", []);
    const train = state.trains[0]!;

    // 5 years old: 30% - 5*3% = 15%.
    train.purchaseTick = state.ticks - 5 * DAYS_PER_YEAR * HOURS_PER_DAY;
    const at5Years = computeReplaceLocoPlan(state, train.id, "norris-4-2-0");
    const oldLocoValue = 45_000 * eraInflation(1848);
    expect(at5Years.tradeInValue).toBeCloseTo(oldLocoValue * 0.15, 4);

    // 100 years old: formula would go negative, but it's floored at 10%.
    train.purchaseTick = state.ticks - 100 * DAYS_PER_YEAR * HOURS_PER_DAY;
    const veryOld = computeReplaceLocoPlan(state, train.id, "norris-4-2-0");
    expect(veryOld.tradeInValue).toBeCloseTo(oldLocoValue * TRADE_IN_MIN_FRACTION, 4);
  });
});

// --- Breakdown probability formula (SPEC §7.6) --------------------------------------------------

/** A bare, directly-injected Train (bypassing buyTrain/a real station/track) — cheap enough to
 * create thousands of for a statistical test of the monthly breakdown roll. */
function bareTrain(
  id: number,
  locoModelId: string,
  purchaseTick: number,
  lastServicedTick?: number,
): Train {
  return {
    id,
    name: `Train ${id}`,
    locoModelId,
    cars: [],
    orders: [],
    currentOrderIndex: 0,
    status: "loading",
    route: [0],
    routeIndex: 0,
    edgeProgress: 0,
    speed: 0,
    direction: -1,
    waitTicks: 0,
    routeTrackVersion: 0,
    lastApproachNode: -1,
    heldBlocks: [],
    blockPenalties: new Map(),
    loadTicksLeft: -1,
    loadExtraWaitDays: 0,
    purchasePrice: 45_000,
    purchaseTick,
    breakdownTicksLeft: 0,
    ...(lastServicedTick !== undefined ? { lastServicedTick } : {}),
    tilesSinceWaterTower: 0,
    renderFromX: 0.5,
    renderFromY: 0.5,
    renderToX: 0.5,
    renderToY: 0.5,
  };
}

const TRIALS = 4000;

describe("monthly breakdown roll", () => {
  it("a fresh, unserviced reliability-3 loco breaks down at roughly its 2% base chance", () => {
    const map = makeTestMap(["p"]);
    const state = makeTestState(map, { startYear: 1848 });
    for (let i = 0; i < TRIALS; i++) {
      state.trains.push(bareTrain(i, "american-4-4-0", state.ticks)); // age 0, never serviced
    }
    monthlyBreakdownStep(state);
    const brokenCount = state.trains.filter((t) => t.breakdownTicksLeft > 0).length;
    const rate = brokenCount / TRIALS;
    const expected = BREAKDOWN_BASE_CHANCE_BY_RELIABILITY[3] as number;
    expect(rate).toBeGreaterThan(expected * 0.5);
    expect(rate).toBeLessThan(expected * 1.5);
  });

  it("halves for a loco serviced at an Engine Shed within the last 60 days", () => {
    const map = makeTestMap(["p"]);
    const unserviced = makeTestState(map, { startYear: 1848, seed: 1 });
    const serviced = makeTestState(map, { startYear: 1848, seed: 1 });
    for (let i = 0; i < TRIALS; i++) {
      unserviced.trains.push(bareTrain(i, "american-4-4-0", unserviced.ticks));
      serviced.trains.push(bareTrain(i, "american-4-4-0", serviced.ticks, serviced.ticks));
    }
    monthlyBreakdownStep(unserviced);
    monthlyBreakdownStep(serviced);
    const unservicedRate =
      unserviced.trains.filter((t) => t.breakdownTicksLeft > 0).length / TRIALS;
    const servicedRate = serviced.trains.filter((t) => t.breakdownTicksLeft > 0).length / TRIALS;
    // Not an exact 2x (both are noisy samples), but serviced should clearly land lower.
    expect(servicedRate).toBeLessThan(unservicedRate * (BREAKDOWN_ENGINE_SHED_MULT + 0.35));
    expect(servicedRate).toBeGreaterThan(0);
  });

  it("charges the era-scaled repair cost and pushes breakdown news on a full-population roll", () => {
    // Reliability 1 (Grasshopper, 7% base) makes at least one breakdown in a small population
    // deterministic enough not to flake at this trial count.
    const map = makeTestMap(["p"]);
    const state = makeTestState(map, { startYear: 1848 });
    for (let i = 0; i < 200; i++) {
      state.trains.push(bareTrain(i, "grasshopper-0-4-0", state.ticks));
    }
    const cashBefore = state.cash;
    monthlyBreakdownStep(state);
    const broken = state.trains.filter((t) => t.breakdownTicksLeft > 0);
    expect(broken.length).toBeGreaterThan(0);
    expect(state.cash).toBeLessThan(cashBefore);
    expect(state.finance.thisMonth.breakdownRepairs).toBeGreaterThan(0);
    expect(state.pendingNews.filter((n) => n.kind === "breakdown").length).toBe(broken.length);
    for (const t of broken) {
      expect(t.breakdownTicksLeft).toBeGreaterThan(0);
      expect(t.breakdownTicksLeft).toBeLessThanOrEqual(5 * HOURS_PER_DAY);
    }
  });
});

// --- Electrify command (SPEC §5.2, §5.3) ------------------------------------------------------

describe("electrifyTrack", () => {
  it("is unavailable before 1905 and available from 1905", () => {
    const map = makeTestMap(["ppp"]);
    const before = makeTestState(map, { startYear: ELECTRIFICATION_ERA - 1 });
    const path = [tileAt(map, 0, 0), tileAt(map, 1, 0), tileAt(map, 2, 0)];
    buildTrack(before, path);
    expect(computeElectrifyPlan(before, path).valid).toBe(false);
    expect(electrifyTrack(before, path).ok).toBe(false);

    const after = makeTestState(map, { startYear: ELECTRIFICATION_ERA });
    buildTrack(after, path);
    const plan = computeElectrifyPlan(after, path);
    expect(plan.valid).toBe(true);
    expect(plan.cost).toBeGreaterThan(0);
    const result = electrifyTrack(after, path);
    expect(result.ok).toBe(true);
    for (let i = 0; i < path.length - 1; i++) {
      const edge = after.trackGraph.getEdge(path[i] as number, path[i + 1] as number);
      expect(edge?.electrified).toBe(true);
    }
  });

  it("re-electrifying the same path a second time is free", () => {
    const map = makeTestMap(["ppp"]);
    const state = makeTestState(map, { startYear: ELECTRIFICATION_ERA });
    const path = [tileAt(map, 0, 0), tileAt(map, 1, 0), tileAt(map, 2, 0)];
    buildTrack(state, path);
    electrifyTrack(state, path);
    const cashAfterFirst = state.cash;
    const second = electrifyTrack(state, path);
    expect(second.ok).toBe(true);
    if (!second.ok) throw new Error("unreachable");
    expect(second.cost).toBe(0);
    expect(state.cash).toBe(cashAfterFirst);
  });
});

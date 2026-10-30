import { describe, expect, it } from "vitest";
import { SCENARIOS, scenarioById, scenarioNewGameOptions } from "../../src/data/scenarios";
import { panicSchedule } from "../../src/sim/finance/panics";
import {
  dailyScenarioStep,
  recordScenarioDelivery,
  scenarioProgress,
  starsFor,
} from "../../src/sim/scenario";
import { createGameState, type GameState } from "../../src/sim/state";
import { advanceOneHour } from "../../src/sim/tick";
import { deserializeGameState, serializeGameState } from "../../src/save/serialize";
import { strings } from "../../src/ui/strings";
import { runScenario } from "../../tools/bench/scenarioRun";
import type { Station } from "../../src/sim/stations/types";

const YEAR = 360 * 24;
const startOf = (id: string): GameState =>
  createGameState(scenarioNewGameOptions(scenarioById(id)!));

describe("scenario table", () => {
  it("has 5-6 scenarios with unique ids, real cities and words", () => {
    expect(SCENARIOS.length).toBeGreaterThanOrEqual(5);
    expect(new Set(SCENARIOS.map((s) => s.id)).size).toBe(SCENARIOS.length);
    for (const def of SCENARIOS) {
      const state = createGameState(scenarioNewGameOptions(def));
      const names = state.cities.map((c) => c.name);
      if (def.goal.type === "connect") for (const c of def.goal.cities) expect(names).toContain(c);
      if (def.goal.type === "deliver" && def.goal.nearCity)
        expect(names).toContain(def.goal.nearCity.name);
      expect(strings.scenarios.items[def.id]?.name).toBeTruthy();
      expect(state.scenario).toMatchObject({ id: def.id, status: "active", stars: 0 });
    }
  });

  it("starts with the fixed cash and opening debt", () => {
    const state = startOf("panic1873");
    expect(state.startYear).toBe(1871);
    expect(state.finance.loans).toBe(2_500_000);
    expect(state.cash).toBe(2_900_000);
    expect(startOf("semmering").cash).toBe(700_000);
  });

  it("panic1873 really has the Panic of 1873 in its seed", () => {
    expect(panicSchedule(startOf("panic1873")).some((p) => p.year === 1873)).toBe(true);
  });
});

describe("goal evaluation", () => {
  it("loses a connect scenario at the deadline, not before", () => {
    const state = startOf("semmering");
    state.ticks = 8 * YEAR - 1; // Dec 1857
    dailyScenarioStep(state);
    expect(state.scenario!.status).toBe("active");
    state.ticks = 8 * YEAR + 24; // Jan 1858
    dailyScenarioStep(state);
    expect(state.scenario).toMatchObject({ status: "lost", reason: "deadline" });
  });

  it("loses on bankruptcy", () => {
    const state = startOf("transcontinental");
    state.finance.bankrupt = true;
    dailyScenarioStep(state);
    expect(state.scenario).toMatchObject({ status: "lost", reason: "bankrupt" });
  });

  it("counts deliveries near the town only, and wins at the amount", () => {
    const state = startOf("coalTrieste");
    const trieste = state.cities.find((c) => c.name === "Trieste")!;
    const at = (x: number, y: number): Station => ({
      id: 0,
      tile: y * state.map.width + x,
      type: "station",
      name: "S",
      hasEngineShed: false,
      hasWaterTower: false,
      improvements: [],
    });
    recordScenarioDelivery(state, at(trieste.anchorX + 40, trieste.anchorY), "coal", 500);
    recordScenarioDelivery(state, at(trieste.anchorX + 2, trieste.anchorY), "ironOre", 500);
    recordScenarioDelivery(state, at(trieste.anchorX + 2, trieste.anchorY), "coal", 100);
    expect(scenarioProgress(state)).toEqual({ current: 100, target: 6000 });
    recordScenarioDelivery(state, at(trieste.anchorX, trieste.anchorY), "coal", 5900);
    dailyScenarioStep(state);
    expect(state.scenario!.status).toBe("won");
    expect(state.scenario!.stars).toBeGreaterThanOrEqual(1);
  });

  it("survives only with the debt under the limit at the end", () => {
    const won = startOf("panic1873");
    won.ticks = 7 * YEAR;
    won.finance.loans = 400_000;
    dailyScenarioStep(won);
    expect(won.scenario!.status).toBe("won");
    const lost = startOf("panic1873");
    lost.ticks = 7 * YEAR;
    dailyScenarioStep(lost);
    expect(lost.scenario).toMatchObject({ status: "lost", reason: "debt" });
  });

  it("rates 1 star for finishing, +1 for speed (or yearly profit), +1 for yearly profit (Phase 67)", () => {
    const connect = scenarioById("semmering")!;
    expect(starsFor(connect, 1856, 0)).toBe(1);
    expect(starsFor(connect, 1852, 0)).toBe(2);
    const [, bProfit] = connect.stars;
    expect(starsFor(connect, 1856, bProfit)).toBe(2);
    expect(starsFor(connect, 1852, bProfit)).toBe(3);
    expect(starsFor(connect, 1852, bProfit - 1)).toBe(2);
    const survive = scenarioById("panic1873")!;
    const [s2, s3] = survive.stars;
    expect(s3).toBeGreaterThan(s2);
    expect(starsFor(survive, 1878, s2 - 1)).toBe(1);
    expect(starsFor(survive, 1878, s2)).toBe(2);
    expect(starsFor(survive, 1878, s3)).toBe(3);
  });
});

describe("saving", () => {
  it("keeps the scenario through a save", () => {
    const state = startOf("coalTrieste");
    state.scenario!.progress = 1234;
    const back = deserializeGameState(JSON.parse(JSON.stringify(serializeGameState(state))));
    expect(back.scenario).toEqual(state.scenario);
  });
});

describe("fail-able and beatable", () => {
  it("a company that does nothing loses every scenario", { timeout: 120_000 }, () => {
    for (const def of SCENARIOS) {
      const state = createGameState(scenarioNewGameOptions(def));
      const end = def.goal.type === "survive" ? def.goal.untilYear : def.goal.byYear;
      for (
        let h = 0;
        h < (end - def.startYear + 1) * YEAR && state.scenario!.status === "active";
        h++
      )
        advanceOneHour(state);
      expect(state.scenario!.status, def.id).toBe("lost");
    }
  });

  it("the direct Vienna - Trieste line wins Semmering", { timeout: 60_000 }, () => {
    const r = runScenario("semmering", "play");
    expect(r.status).toBe("won");
    expect(r.stars).toBeGreaterThanOrEqual(2);
  });
});

import { describe, expect, it } from "vitest";
import { INDUSTRIES } from "../../../src/data/industries";
import {
  getOrCreateIndustryEconomy,
  monthlyIndustryStep,
} from "../../../src/sim/economy/processing";
import type { Industry } from "../../../src/sim/economy/types";
import { makeTestMap, makeTestState } from "../track/helpers";

function stateWithIndustry(industry: Industry) {
  const map = makeTestMap(["p"]);
  const state = makeTestState(map);
  state.industries.push(industry);
  return state;
}

describe("monthlyIndustryStep", () => {
  it("a raw producer's monthlyOutput is always its static produces table", () => {
    const state = stateWithIndustry({ id: 0, type: "coalMine", x: 0, y: 0 });
    monthlyIndustryStep(state);
    expect(state.industryEconomy.get(0)?.monthlyOutput).toEqual(INDUSTRIES.coalMine.produces);
  });

  it("steel mill (recipeMode 'all'): output is min(coal, ore), both consumed equally", () => {
    const state = stateWithIndustry({ id: 0, type: "steelMill", x: 0, y: 0 });
    const econ = getOrCreateIndustryEconomy(state, 0);
    econ.inputStock = { coal: 40, ironOre: 25 };

    monthlyIndustryStep(state);

    expect(state.industryEconomy.get(0)?.monthlyOutput.steel).toBe(25);
    expect(state.industryEconomy.get(0)?.inputStock.coal).toBe(15); // 40 - 25
    expect(state.industryEconomy.get(0)?.inputStock.ironOre).toBe(0); // 25 - 25
  });

  it("steel mill produces nothing when only one input is available", () => {
    const state = stateWithIndustry({ id: 0, type: "steelMill", x: 0, y: 0 });
    const econ = getOrCreateIndustryEconomy(state, 0);
    econ.inputStock = { coal: 40 };

    monthlyIndustryStep(state);

    expect(state.industryEconomy.get(0)?.monthlyOutput.steel ?? 0).toBe(0);
    expect(state.industryEconomy.get(0)?.inputStock.coal).toBe(40); // untouched
  });

  it("steel mill output is capped at the monthly capacity even with abundant inputs", () => {
    const state = stateWithIndustry({ id: 0, type: "steelMill", x: 0, y: 0 });
    const econ = getOrCreateIndustryEconomy(state, 0);
    econ.inputStock = { coal: 500, ironOre: 500 };

    monthlyIndustryStep(state);

    expect(state.industryEconomy.get(0)?.monthlyOutput.steel).toBe(
      INDUSTRIES.steelMill.produces.steel,
    );
  });

  it("food plant (recipeMode 'any'): grain and livestock both count toward the same output cap", () => {
    const state = stateWithIndustry({ id: 0, type: "foodPlant", x: 0, y: 0 });
    const econ = getOrCreateIndustryEconomy(state, 0);
    econ.inputStock = { grain: 10, livestock: 10 };

    monthlyIndustryStep(state);

    expect(state.industryEconomy.get(0)?.monthlyOutput.food).toBe(20);
    expect(state.industryEconomy.get(0)?.inputStock.grain).toBe(0);
    expect(state.industryEconomy.get(0)?.inputStock.livestock).toBe(0);
  });

  it("food plant works from just one of its two possible inputs", () => {
    const state = stateWithIndustry({ id: 0, type: "foodPlant", x: 0, y: 0 });
    const econ = getOrCreateIndustryEconomy(state, 0);
    econ.inputStock = { grain: 15 };

    monthlyIndustryStep(state);

    expect(state.industryEconomy.get(0)?.monthlyOutput.food).toBe(15);
  });

  it("leftover input stock carries over to the next month", () => {
    const state = stateWithIndustry({ id: 0, type: "steelMill", x: 0, y: 0 });
    const econ = getOrCreateIndustryEconomy(state, 0);
    econ.inputStock = { coal: 30, ironOre: 30 };
    monthlyIndustryStep(state); // consumes 30/30, output 30

    econ.inputStock.coal = (econ.inputStock.coal ?? 0) + 10;
    econ.inputStock.ironOre = (econ.inputStock.ironOre ?? 0) + 40;
    monthlyIndustryStep(state); // available coal=10, ore=40 -> output min(10,40)=10

    expect(state.industryEconomy.get(0)?.monthlyOutput.steel).toBe(10);
    expect(state.industryEconomy.get(0)?.inputStock.ironOre).toBe(30); // 40 - 10 leftover
  });
});

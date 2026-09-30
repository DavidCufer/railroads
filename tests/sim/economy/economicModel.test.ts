/** Economic model v2 (PLAN Phase 28A): each mechanism does what its real-world cause says. */
import { describe, expect, it } from "vitest";
import {
  PROPERTY_TAX_RATE,
  competitionLoss,
  fareIndex,
  incomeTaxRate,
  priceIndex,
  trainCrewSize,
  wageIndex,
} from "../../../src/data/economy";
import { DIFFICULTY, ledgerOperatingProfit } from "../../../src/data/finance";
import { locomotiveById } from "../../../src/data/trains";
import { buildStation, buildTrack, buyTrain } from "../../../src/sim/commands";
import {
  addRevenue,
  monthlyFinanceStep,
  yearlyFinanceRollover,
} from "../../../src/sim/finance/ledger";
import { wearUnitsPerTile } from "../../../src/sim/finance/costs";
import {
  effectiveReliability,
  monthlyBreakdownChance,
  repairCallOutCost,
  repairPartsCost,
} from "../../../src/sim/trains/breakdown";
import { planRepairCrew } from "../../../src/sim/trains/repairCrew";
import type { TrainCar } from "../../../src/sim/trains/types";
import { measureMean } from "../balanceRoutes";
import { makeTestMap, makeTestState, tileAt } from "../track/helpers";

const loco = (id: string) => {
  const l = locomotiveById(id);
  if (!l) throw new Error(id);
  return l;
};
const cars = (n: number, fill: number): TrainCar[] =>
  Array.from({ length: n }, () => ({ cargoType: "coal" as const, loadedUnits: 20 * fill }));

describe("1. fares vs wages", () => {
  it("fares are a premium early and fall in real terms; freight rates fall too", () => {
    const real = (y: number, c: "passengers" | "coal") => fareIndex(y, c) / priceIndex(y);
    for (const c of ["passengers", "coal"] as const) {
      expect(real(1830, c)).toBeGreaterThan(real(1870, c));
      expect(real(1870, c)).toBeGreaterThan(real(1930, c));
    }
    expect(real(1840, "coal")).toBeGreaterThan(1.3); // bulk freight beat the wagon and canal
  });

  it("wages rise faster than prices and crews grow with the train", () => {
    expect(wageIndex(1950) / priceIndex(1950)).toBeGreaterThan(wageIndex(1880) / priceIndex(1880));
    const small = trainCrewSize(loco("grasshopper-0-4-0"), 3);
    const big = trainCrewSize(loco("articulated-4-8-8-4"), 22);
    expect(small).toBe(2);
    expect(big).toBeGreaterThanOrEqual(7);
  });
});

describe("2. track wear", () => {
  it("light early trains barely mark the track; heavy fast loaded ones wear it far more", () => {
    const grass = wearUnitsPerTile(loco("grasshopper-0-4-0"), cars(3, 0.5), 15);
    const mikado = wearUnitsPerTile(loco("mikado-2-8-2"), cars(14, 1), 70);
    expect(mikado).toBeGreaterThan(grass * 8);
    const empty = wearUnitsPerTile(loco("atlantic-4-4-2"), cars(6, 0), 100);
    const full = wearUnitsPerTile(loco("atlantic-4-4-2"), cars(6, 1), 100);
    expect(full).toBeGreaterThan(empty);
    const slow = wearUnitsPerTile(loco("atlantic-4-4-2"), cars(6, 1), 40);
    expect(full).toBeGreaterThan(slow * 1.3);
  });

  it("a running train's wear is charged to the ledger and to its own books", () => {
    const { state } = lineWithTrain(1900);
    const train = state.trains[0]!;
    train.wearUnits = 500;
    monthlyFinanceStep(state);
    expect(state.finance.thisYear.trackWear).toBeGreaterThan(0);
    expect(train.profit.thisYear.wear).toBeGreaterThan(0);
    expect(train.wearUnits).toBe(0);
  });
});

function lineWithTrain(year: number, difficulty: "easy" | "normal" | "hard" = "normal") {
  const map = makeTestMap(["pppppppppp", "pppppppppp"]);
  const state = makeTestState(map, { startYear: year, cash: 1e9, difficulty });
  const path = Array.from({ length: 10 }, (_, x) => tileAt(map, x, 0));
  buildTrack(state, path);
  buildStation(state, path[0]!, "station");
  buildStation(state, path[9]!, "station");
  buyTrain(state, state.stations[0]!.id, year < 1900 ? "american-4-4-0" : "atlantic-4-4-2", [
    "passengers",
  ]);
  return { state, path };
}

describe("3. locomotive complexity", () => {
  it("parts cost scales with the engine's complexity and proven designs are cheaper to fix", () => {
    const year = 1930;
    const simple = repairPartsCost(loco("norris-4-2-0"), 5, year); // 1838: proven by 1930
    const complex = repairPartsCost(loco("hudson-4-6-4"), 2, 1932); // 1927: still new
    expect(complex).toBeGreaterThan(simple * 3);
    const young = repairPartsCost(loco("atlantic-4-4-2"), 5, 1904); // nine years on the market
    const proven = repairPartsCost(loco("atlantic-4-4-2"), 5, 1906); // eleven: spares are stocked
    expect(proven / priceIndex(1906)).toBeLessThan(young / priceIndex(1904));
  });

  it("a model arriving during the game has a teething period, a proven one is more reliable", () => {
    const atlantic = loco("atlantic-4-4-2"); // introduced 1895, reliability 4
    expect(effectiveReliability(atlantic, 1896, 1830)).toBe(3);
    expect(effectiveReliability(atlantic, 1901, 1830)).toBe(4);
    expect(effectiveReliability(atlantic, 1896, 1900)).toBe(4); // already on the market at the start
    const { state } = lineWithTrain(1900);
    const train = state.trains[0]!;
    train.purchaseTick = state.ticks;
    delete train.lastServicedTick;
    const young = monthlyBreakdownChance(state, train);
    state.ticks += 24 * 360 * 12; // 1912: the Atlantic is 17 years old on the market
    train.purchaseTick = state.ticks;
    expect(monthlyBreakdownChance(state, train)).toBeLessThan(young);
  });

  it("kilometres run wear an engine: the same engine breaks down more after a hard life", () => {
    const { state } = lineWithTrain(1900);
    const train = state.trains[0]!;
    delete train.lastServicedTick;
    const fresh = monthlyBreakdownChance(state, train);
    train.distanceTraveled = 200_000;
    expect(monthlyBreakdownChance(state, train)).toBeGreaterThan(fresh * 1.5);
  });
});

describe("4. repair logistics", () => {
  it("a call-out costs crew wages for the distance driven: a far breakdown is dearer, a nearer shed cheaper", () => {
    const map = makeTestMap(["p".repeat(62), "p".repeat(62)]);
    const state = makeTestState(map, { startYear: 1900, cash: 1e9 });
    const path = Array.from({ length: 60 }, (_, x) => tileAt(map, x + 1, 0));
    buildTrack(state, path);
    buildStation(state, path[0]!, "station");
    buildStation(state, path[59]!, "station");
    buyTrain(state, state.stations[0]!.id, "atlantic-4-4-2", ["passengers"]);
    const train = state.trains[0]!;
    const cost = (tileIndex: number) => {
      train.route = [path[tileIndex]!];
      train.routeIndex = 0;
      return repairCallOutCost(state, train, planRepairCrew(state, train, 3));
    };
    const near = cost(3);
    const far = cost(50);
    expect(far.wages).toBeGreaterThan(near.wages * 5);
    expect(far.parts).toBeCloseTo(near.parts, 5);
    state.stations[1]!.hasEngineShed = true; // a shed at the far end
    const withShed = cost(50);
    expect(withShed.wages).toBeLessThan(far.wages / 3);
    expect(withShed.total).toBeLessThan(far.total);
  });
});

describe("5. taxes", () => {
  function yearWithProfit(
    startYear: number,
    difficulty: "easy" | "normal" | "hard",
    revenue: number,
  ) {
    const map = makeTestMap(["p"]);
    const state = makeTestState(map, { startYear, difficulty, cash: 1e9 });
    addRevenue(state, "passengers", revenue);
    return state;
  }

  it("there is no income tax before the 1910s and property tax from the first day", () => {
    const state = yearWithProfit(1850, "normal", 500_000);
    state.ticks = 24 * 360;
    yearlyFinanceRollover(state);
    expect(state.finance.lastYear.incomeTax).toBe(0);
    state.finance.capitalInvested = 1_000_000;
    monthlyFinanceStep(state);
    expect(state.finance.thisYear.propertyTax).toBeCloseTo((1_000_000 * PROPERTY_TAX_RATE) / 12, 5);
  });

  it("a profitable year pays the year's rate on its operating profit; losses carry forward", () => {
    const state = yearWithProfit(1930, "normal", 400_000);
    state.ticks = 24 * 360;
    const profit = ledgerOperatingProfit(state.finance.thisYear);
    yearlyFinanceRollover(state);
    expect(state.finance.lastYear.incomeTax).toBeCloseTo(profit * incomeTaxRate(1930), 5);

    const loss = yearWithProfit(1930, "normal", 0);
    loss.finance.thisYear.crewWages = 100_000; // a losing year...
    loss.ticks = 24 * 360;
    yearlyFinanceRollover(loss);
    expect(loss.finance.lastYear.incomeTax).toBe(0);
    addRevenue(loss, "passengers", 150_000); // ...then a year whose profit is absorbed by the loss
    loss.ticks = 24 * 360 * 2;
    yearlyFinanceRollover(loss);
    expect(loss.finance.lastYear.incomeTax).toBeCloseTo(50_000 * incomeTaxRate(1931), 5);
  });

  it("Hard pays a heavier schedule than Normal on the same profit, Easy a lighter one", () => {
    const tax = (d: "easy" | "normal" | "hard") => {
      const s = yearWithProfit(1950, d, 400_000);
      s.ticks = 24 * 360;
      yearlyFinanceRollover(s);
      return s.finance.lastYear.incomeTax;
    };
    expect(tax("hard")).toBeGreaterThan(tax("normal"));
    expect(tax("normal")).toBeGreaterThan(tax("easy"));
    expect(DIFFICULTY.hard.revenueMult).toBe(1); // harder through tax and interest, not lower fares
  });

  it("the tax steps up through the century", () => {
    expect(incomeTaxRate(1900)).toBe(0);
    for (const [a, b] of [
      [1915, 1925],
      [1925, 1940],
      [1940, 1950],
      [1950, 1970],
    ] as const)
      expect(incomeTaxRate(b)).toBeGreaterThan(incomeTaxRate(a));
  });
});

describe("6. competition from other transport", () => {
  it("short passenger trips lose fares to buses from the 1920s, long ones do not", () => {
    expect(competitionLoss(1910, "passengers", 60, 100)).toBe(0);
    const short1950 = competitionLoss(1950, "passengers", 60, 100);
    const short1980 = competitionLoss(1980, "passengers", 60, 100);
    expect(short1950).toBeGreaterThan(0.1);
    expect(short1980).toBeGreaterThan(short1950);
    expect(competitionLoss(1950, "passengers", 200, 100)).toBe(0); // beyond 150 km, before airlines
    expect(competitionLoss(1950, "passengers", 400, 100)).toBeLessThan(0.03); // the first airliners
  });

  it("airlines take long-distance passengers after the war; fast trains keep most of them", () => {
    expect(competitionLoss(1970, "passengers", 700, 100)).toBeGreaterThan(0.15);
    expect(competitionLoss(1970, "passengers", 700, 270)).toBeLessThan(
      competitionLoss(1970, "passengers", 700, 100) * 0.5,
    );
    expect(competitionLoss(1980, "passengers", 60, 270)).toBeLessThan(
      competitionLoss(1980, "passengers", 60, 100) * 0.5,
    );
  });

  it("lorries take short-haul general freight but leave bulk coal mostly alone", () => {
    expect(competitionLoss(1915, "goods", 60, 80)).toBe(0);
    const goods = competitionLoss(1960, "goods", 60, 80);
    const coal = competitionLoss(1960, "coal", 60, 80);
    expect(goods).toBeGreaterThan(0.1);
    expect(coal).toBeLessThan(goods / 3);
    expect(competitionLoss(1960, "goods", 400, 80)).toBe(0);
  });
});

describe("balance targets (BALANCE.md)", () => {
  it("a rich route earns at most ~3.3× the train's price a year after tax and wear, in every era from 1900", () => {
    const eras = [
      { year: 1900, loco: "atlantic-4-4-2" },
      { year: 1920, loco: "pacific-4-6-2" },
      { year: 1950, loco: "road-switcher-diesel" },
      { year: 1980, loco: "heavy-diesel" },
    ];
    for (const e of eras) {
      const r = measureMean({
        cargo: "passengers",
        km: 100,
        ...e,
        population: 150_000,
        tier: "metropolis",
      });
      expect(r.profit / r.price, `${e.year}`).toBeLessThanOrEqual(3.3);
      expect(r.profit, `${e.year}`).toBeGreaterThan(0);
    }
  });

  it("repairs stay under 10 % of revenue in every era with a shed at each end", () => {
    const eras = [
      { year: 1840, loco: "norris-4-2-0" },
      { year: 1860, loco: "american-4-4-0" },
      { year: 1900, loco: "atlantic-4-4-2" },
      { year: 1950, loco: "road-switcher-diesel" },
    ];
    for (const e of eras) {
      const r = measureMean({
        cargo: "passengers",
        km: 200,
        ...e,
        population: 40_000,
        tier: "city",
        shedAtBothEnds: true,
      });
      expect(r.ledger.breakdownRepairs / r.revenue, `${e.year}`).toBeLessThan(0.1);
    }
  });

  it("Hard is clearly harder than Normal on the same 1920 route", () => {
    const spec = {
      cargo: "passengers" as const,
      km: 100,
      year: 1920,
      loco: "pacific-4-6-2",
      population: 40_000,
      tier: "city" as const,
    };
    const normal = measureMean(spec);
    const hard = measureMean({ ...spec, difficulty: "hard" });
    expect(hard.profit).toBeLessThan(normal.profit * 0.95);
    expect(DIFFICULTY.hard.buildCostMult).toBeGreaterThan(DIFFICULTY.normal.buildCostMult);
    expect(DIFFICULTY.hard.interestRate).toBeGreaterThan(DIFFICULTY.normal.interestRate);
    expect(hard.profit).toBeGreaterThan(0);
  });
});

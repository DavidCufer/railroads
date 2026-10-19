import { describe, expect, it } from "vitest";
import {
  LOCOMOTIVES,
  POWER_PRICE_PER_RATING,
  POWER_RATING_PER_UNIT,
  STEAM_PRICE_PER_TONNE,
  LOCO_UPKEEP_PER_TONNE,
  locomotiveById,
} from "../../../src/data/trains";
import {
  locoRunningCostPerYear,
  repairCostPerUnit,
  repairUnitsPerTile,
} from "../../../src/sim/finance/costs";

const loco = (id: string) => locomotiveById(id)!;

describe("engine price and upkeep follow the real weight (Phase 56)", () => {
  it("steam is priced by weight, diesel and electric by installed power; upkeep is weight times the type's rate", () => {
    for (const l of LOCOMOTIVES) {
      const rating =
        (l.type === "electric" ? l.ratedPowerKw : l.ratedPowerHp) ??
        l.power * (l.type === "steam" ? 0 : POWER_RATING_PER_UNIT[l.type]);
      const raw =
        l.type === "steam"
          ? l.weightTonnes * STEAM_PRICE_PER_TONNE
          : rating * POWER_PRICE_PER_RATING[l.type];
      expect(l.cost).toBeCloseTo(raw, -3);
      expect(l.maintenancePerYear).toBeCloseTo(l.weightTonnes * LOCO_UPKEEP_PER_TONNE[l.type], -2);
    }
  });

  it("the High-Speed Trainset is priced by its real 8.8 MW, not by its game power cap (Phase 57)", () => {
    const hst = loco("high-speed-trainset");
    expect(hst.ratedPowerKw).toBe(8800);
    expect(hst.cost).toBe(528000);
    expect(hst.cost).toBeGreaterThan(loco("heavy-freight-electric").cost);
  });

  it("a Hudson costs about five Americans to buy and keep, a Grasshopper a sixth", () => {
    expect(loco("hudson-4-6-4").cost / loco("american-4-4-0").cost).toBeCloseTo(5, 0);
    expect(loco("grasshopper-0-4-0").cost / loco("american-4-4-0").cost).toBeLessThan(0.2);
    expect(
      locoRunningCostPerYear(loco("hudson-4-6-4"), 5, 1930) /
        locoRunningCostPerYear(loco("american-4-4-0"), 5, 1930),
    ).toBeGreaterThan(4);
  });

  it("repairs follow the tonnes run and grow with engine size", () => {
    const small = loco("norris-4-2-0");
    const big = loco("hudson-4-6-4");
    const perTile = (l: typeof big) => repairUnitsPerTile(l) * repairCostPerUnit(l, 5, 1930);
    expect(perTile(big) / perTile(small)).toBeCloseTo(big.weightTonnes / small.weightTonnes, 5);
    expect(perTile(big)).toBeGreaterThan(0);
  });
});

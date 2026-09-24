import { describe, expect, it } from "vitest";
import { eraInflation } from "../../../src/data/finance";
import {
  DIAGONAL_FACTOR,
  GRADE_SURCHARGE_PER_ELEVATION,
  TRACK_BASE_COST_PER_TILE,
} from "../../../src/data/track";
import {
  bridgeCost,
  cheapestBridgeType,
  evaluatePath,
  normalEdgeCost,
  pathIsValid,
  pathTotalCost,
  validBridgeTypes,
  type CostContext,
} from "../../../src/sim/track/cost";
import { makeTestMap, tileAt } from "./helpers";

const CTX_1830: CostContext = { year: 1830, buildCostMult: 1 };

describe("normalEdgeCost", () => {
  const cases: Array<{ name: string; row: string; expectedMult: number; diagonal: boolean }> = [
    { name: "plain-plain straight", row: "pp", expectedMult: 1.0, diagonal: false },
    { name: "desert-plain uses the pricier tile", row: "dp", expectedMult: 1.2, diagonal: false },
    { name: "forest-plain uses the pricier tile", row: "fp", expectedMult: 1.5, diagonal: false },
    { name: "swamp-plain uses the pricier tile", row: "sp", expectedMult: 2.0, diagonal: false },
    { name: "hills-plain uses the pricier tile", row: "hp", expectedMult: 2.0, diagonal: false },
    { name: "mountain-plain uses the pricier tile", row: "mp", expectedMult: 4.0, diagonal: false },
  ];

  for (const c of cases) {
    it(`${c.name}: base × terrain multiplier × era inflation`, () => {
      const map = makeTestMap([c.row]);
      const cost = normalEdgeCost(map, tileAt(map, 0, 0), tileAt(map, 1, 0), CTX_1830);
      const expected = TRACK_BASE_COST_PER_TILE * c.expectedMult * eraInflation(1830);
      expect(cost).toBeCloseTo(expected, 6);
    });
  }

  it("applies the diagonal factor to a diagonal edge", () => {
    const map = makeTestMap(["pp", "pp"]);
    const straight = normalEdgeCost(map, tileAt(map, 0, 0), tileAt(map, 1, 0), CTX_1830);
    const diagonal = normalEdgeCost(map, tileAt(map, 0, 0), tileAt(map, 1, 1), CTX_1830);
    expect(diagonal).toBeCloseTo(straight * DIAGONAL_FACTOR, 6);
  });

  it("adds a flat grade surcharge proportional to |Δelevation|, not terrain-scaled", () => {
    const map = makeTestMap(["pp"], [[0, 3]]);
    const cost = normalEdgeCost(map, tileAt(map, 0, 0), tileAt(map, 1, 0), CTX_1830);
    const flat = TRACK_BASE_COST_PER_TILE * 1.0 * eraInflation(1830);
    const grade = GRADE_SURCHARGE_PER_ELEVATION * 3 * eraInflation(1830);
    expect(cost).toBeCloseTo(flat + grade, 6);
  });

  it("scales with era inflation", () => {
    const map = makeTestMap(["pp"]);
    const cost1830 = normalEdgeCost(map, tileAt(map, 0, 0), tileAt(map, 1, 0), CTX_1830);
    const cost1950 = normalEdgeCost(map, tileAt(map, 0, 0), tileAt(map, 1, 0), {
      year: 1950,
      buildCostMult: 1,
    });
    expect(cost1950).toBeCloseTo(cost1830 * (eraInflation(1950) / eraInflation(1830)), 6);
  });

  it("scales with the difficulty build-cost multiplier", () => {
    const map = makeTestMap(["pp"]);
    const normal = normalEdgeCost(map, tileAt(map, 0, 0), tileAt(map, 1, 0), CTX_1830);
    const hard = normalEdgeCost(map, tileAt(map, 0, 0), tileAt(map, 1, 0), {
      year: 1830,
      buildCostMult: 1.2,
    });
    expect(hard).toBeCloseTo(normal * 1.2, 6);
  });
});

describe("bridge type selection (validBridgeTypes / cheapestBridgeType)", () => {
  it("river: wood is always available and cheapest from 1830", () => {
    const types = validBridgeTypes("river", 1, 1830);
    expect(types[0]).toBe("wood");
    expect(cheapestBridgeType("river", 1, 1830)).toBe("wood");
  });

  it("river: stone unlocks at 1840, steel at 1870", () => {
    expect(validBridgeTypes("river", 1, 1839)).toEqual(["wood"]);
    expect(validBridgeTypes("river", 1, 1840)).toEqual(["wood", "stone"]);
    expect(validBridgeTypes("river", 1, 1870)).toEqual(["wood", "stone", "steel"]);
  });

  it("water: wood is never valid (not allowed to span open water)", () => {
    expect(validBridgeTypes("water", 1, 1950)).not.toContain("wood");
  });

  it("water: stone caps at 3 tiles, steel (from 1870) picks up spans up to 8", () => {
    expect(cheapestBridgeType("water", 3, 1900)).toBe("stone");
    expect(cheapestBridgeType("water", 4, 1900)).toBe("steel"); // exceeds stone's max span
    expect(cheapestBridgeType("water", 4, 1860)).toBe(null); // too early for steel
    expect(cheapestBridgeType("water", 8, 1870)).toBe("steel");
    expect(cheapestBridgeType("water", 9, 1870)).toBe(null); // exceeds even steel's max span
  });

  it("water: nothing valid before 1840 (stone) regardless of span", () => {
    expect(cheapestBridgeType("water", 2, 1839)).toBe(null);
  });
});

describe("bridgeCost", () => {
  it("river cost is flat, independent of span", () => {
    const cost = bridgeCost("wood", "river", 1, CTX_1830);
    expect(cost).toBeCloseTo(20_000 * eraInflation(1830), 6);
  });

  it("water cost scales per tile spanned", () => {
    const one = bridgeCost("stone", "water", 1, CTX_1830);
    const three = bridgeCost("stone", "water", 3, CTX_1830);
    expect(three).toBeCloseTo(one * 3, 6);
  });
});

describe("evaluatePath", () => {
  it("prices a path with a river crossing using the cheapest valid bridge by default", () => {
    const map = makeTestMap(["pprpp"]); // land - land - river - land - land
    const path = [tileAt(map, 0, 0), tileAt(map, 1, 0), tileAt(map, 3, 0), tileAt(map, 4, 0)];
    const steps = evaluatePath(map, path, CTX_1830);
    expect(pathIsValid(steps)).toBe(true);
    expect(steps[1]?.bridge).toBe("wood"); // cheapest at 1830
    expect(steps[1]?.bridgeSpan).toEqual([tileAt(map, 2, 0)]);
  });

  it("honors a preferred bridge type when it's legal for that crossing", () => {
    const map = makeTestMap(["pprpp"]);
    const path = [tileAt(map, 1, 0), tileAt(map, 3, 0)];
    const steps = evaluatePath(map, path, { year: 1870, buildCostMult: 1 }, "steel");
    expect(steps[0]?.bridge).toBe("steel");
  });

  it("falls back to the cheapest legal type if the preferred one isn't legal there", () => {
    const map = makeTestMap(["pprpp"]);
    const path = [tileAt(map, 1, 0), tileAt(map, 3, 0)];
    // Steel isn't available yet at 1830 — falls back to wood.
    const steps = evaluatePath(map, path, CTX_1830, "steel");
    expect(steps[0]?.bridge).toBe("wood");
  });

  it("marks a step blocked when no bridge type can legally span it", () => {
    const map = makeTestMap(["pwwwwwwwwp"]); // 8 water tiles: too long even for steel before 1870
    const path = [tileAt(map, 0, 0), tileAt(map, 9, 0)];
    const steps = evaluatePath(map, path, { year: 1860, buildCostMult: 1 });
    expect(steps[0]?.blocked).toBe(true);
    expect(pathIsValid(steps)).toBe(false);
  });

  it("sums step costs for pathTotalCost", () => {
    const map = makeTestMap(["ppp"]);
    const path = [tileAt(map, 0, 0), tileAt(map, 1, 0), tileAt(map, 2, 0)];
    const steps = evaluatePath(map, path, CTX_1830);
    const single = normalEdgeCost(map, tileAt(map, 0, 0), tileAt(map, 1, 0), CTX_1830);
    expect(pathTotalCost(steps)).toBeCloseTo(single * 2, 6);
  });
});

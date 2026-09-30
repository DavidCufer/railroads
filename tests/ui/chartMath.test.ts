import { describe, expect, it } from "vitest";
import {
  cashFlashTone,
  meterFraction,
  pipCount,
  sparklinePoints,
  stackSegments,
} from "../../src/ui/components/chartMath";
import { costParts, incomeParts } from "../../src/ui/components/ledgerParts";
import { emptyLedgerPeriod } from "../../src/data/finance";

describe("sparklinePoints", () => {
  it("needs at least two values", () => {
    expect(sparklinePoints([], 100, 40)).toEqual([]);
    expect(sparklinePoints([5], 100, 40)).toEqual([]);
  });

  it("spans the padded box, larger values higher (smaller y)", () => {
    const pts = sparklinePoints([0, 10, 5], 100, 40, 4);
    expect(pts[0]).toEqual({ x: 4, y: 36 });
    expect(pts[1]).toEqual({ x: 50, y: 4 });
    expect(pts[2]!.x).toBe(96);
    expect(pts[2]!.y).toBeCloseTo(20);
  });

  it("draws a flat series through the middle", () => {
    const pts = sparklinePoints([3, 3, 3], 90, 30);
    expect(pts.every((p) => p.y === 15)).toBe(true);
  });
});

describe("stackSegments", () => {
  it("normalises positive parts and drops the rest", () => {
    const segs = stackSegments([
      { key: "a", value: 30 },
      { key: "b", value: 0 },
      { key: "c", value: 10 },
      { key: "d", value: -5 },
    ]);
    expect(segs.map((s) => s.key)).toEqual(["a", "c"]);
    expect(segs[0]!.frac).toBeCloseTo(0.75);
    expect(segs.reduce((sum, s) => sum + s.frac, 0)).toBeCloseTo(1);
  });

  it("is empty when nothing is positive", () => {
    expect(stackSegments([{ key: "a", value: 0 }])).toEqual([]);
  });
});

describe("meters and pips", () => {
  it("clamps meter fractions", () => {
    expect(meterFraction(50, 200)).toBe(0.25);
    expect(meterFraction(500, 200)).toBe(1);
    expect(meterFraction(-1, 200)).toBe(0);
    expect(meterFraction(5, 0)).toBe(0);
  });

  it("rounds and clamps pip counts", () => {
    expect(pipCount(3.4)).toBe(3);
    expect(pipCount(9)).toBe(5);
    expect(pipCount(-2)).toBe(0);
  });
});

describe("cashFlashTone", () => {
  it("flashes go on income and signal on spending, ignoring sub-dollar drift", () => {
    expect(cashFlashTone(100, 5000)).toBe("go");
    expect(cashFlashTone(5000, 100)).toBe("signal");
    expect(cashFlashTone(100, 100.4)).toBeNull();
  });
});

describe("ledger parts", () => {
  it("covers every income and cost category of a period", () => {
    const p = { ...emptyLedgerPeriod(), passengers: 10, mail: 5, freight: 20, interest: 3 };
    expect(incomeParts(p).map((x) => x.value)).toEqual([10, 5, 20]);
    // Every cost line of the ledger has a legend entry (Economic model v2 added wages, wear and taxes).
    const costKeys = Object.keys(p).filter((k) => !["passengers", "mail", "freight"].includes(k));
    expect(
      costParts(p)
        .map((x) => x.key)
        .sort(),
    ).toEqual(costKeys.sort());
    expect(costParts(p).find((x) => x.key === "interest")!.value).toBe(3);
  });
});

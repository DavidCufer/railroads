/**
 * Phase 40 balance: the long-haul chain (two legs of a third of a 300-tile map, real track, trains and tick loop; see
 * tools/bench/longHaulScenario.ts) is a poor buy in the first decades and the biggest earner later. Fixed fleets so the
 * numbers do not depend on a search; measured with `npx tsx tools/bench/longHaul.ts <year> 100`.
 */
import { describe, expect, it } from "vitest";
import { runLongHaul } from "../../tools/bench/longHaulScenario";

const run = (
  startYear: number,
  oreTrains: number,
  barTrains: number,
  chain: "silver" | "uranium",
) => runLongHaul({ startYear, legTiles: 100, oreTrains, barTrains, years: 10, chain });

describe("long-haul chain balance (Phase 40)", () => {
  it("1840: a poor investment (under 15 %/yr, not paid back in 10 years, well below an ordinary line's 25 %)", () => {
    const r = run(1840, 2, 1, "silver");
    expect(r.lateReturn).toBeLessThan(0.15);
    expect(r.payback).toBe("never");
  });

  it("1900: strong, paid back within three years", () => {
    const r = run(1900, 1, 1, "silver");
    expect(r.lateReturn).toBeGreaterThan(0.6);
    expect(Number(r.payback)).toBeLessThanOrEqual(3);
  });

  it("1930 silver and 1950 uranium: the big prize, uranium the bigger", () => {
    const silver = run(1930, 2, 1, "silver");
    const uranium = run(1950, 2, 1, "uranium");
    expect(silver.lateReturn).toBeGreaterThan(0.8);
    expect(silver.lateReturn * silver.invested).toBeGreaterThan(2.5e6);
    expect(uranium.lateReturn * uranium.invested).toBeGreaterThan(
      1.4 * silver.lateReturn * silver.invested,
    );
  });
});

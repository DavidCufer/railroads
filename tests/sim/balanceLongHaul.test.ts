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
  it("1840: a poor investment (under 15 %/yr, not paid back before year 10, well below an ordinary line's 25 %)", () => {
    // Phase 54 (owner OK): was "never". The terminus turnaround and one pile per station let the ore and bar trains run a
    // little richer; it is paid back in the last year of the bench (10) at best, still not before it.
    const r = run(1840, 2, 1, "silver");
    expect(r.lateReturn).toBeLessThan(0.15);
    expect(["never", "10"]).toContain(r.payback);
  });

  it("1900: strong, paid back within three years", () => {
    const r = run(1900, 1, 1, "silver");
    expect(r.lateReturn).toBeGreaterThan(0.5);
    expect(Number(r.payback)).toBeLessThanOrEqual(3);
  });

  it("1930 silver and 1950 uranium: the big prize, uranium the bigger", () => {
    const silver = run(1930, 2, 1, "silver");
    const uranium = run(1950, 2, 1, "uranium");
    // Phase 54 (owner OK): was 0.8. Measured 0.75 with the terminus turnaround: a full ore train loses a trip's income
    // at every turn, and silver is a full-train cargo.
    // Phase 56B (owner OK): was 0.7, measured 0.611 (the 1930 fastest engine, the Hudson, costs 1.5x and its upkeep 2x).
    // Phase 61 (owner OK 2026-10-21): was 0.5, measured 0.493 with sourced 1930 staffing (three 8-hour shifts after 1917)
    // and fuel at its real 8 % share of operating expenses.
    expect(silver.lateReturn).toBeGreaterThan(0.45);
    // Phase 54 (owner OK): was 2.5e6, measured 2.44e6 (the same turnaround cost). Phase 56B (owner OK): was 2.3e6,
    // measured 2.283e6, floor one step (0.1e6) below it. Phase 60 (owner OK 2026-10-20): was 2.2e6, measured 1.926e6
    // after the real running costs (section-gang track upkeep, head office), floor one step below.
    expect(silver.lateReturn * silver.invested).toBeGreaterThan(1.8e6);
    expect(uranium.lateReturn * uranium.invested).toBeGreaterThan(
      1.4 * silver.lateReturn * silver.invested,
    );
  });
});

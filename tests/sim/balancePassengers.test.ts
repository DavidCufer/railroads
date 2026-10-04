/** Phase 26A targets (PLAN): passengers and mail matter. Uses the same headless routes as the
 * balance report (docs/BALANCE.md), 1900 atlantic, Normal difficulty, 100 km. */
import { describe, expect, it } from "vitest";
import { CARGO } from "../../src/data/cargo";
import { measureMean } from "./balanceRoutes";
import { destinationCounts, destinationSupplyMult } from "../../src/sim/stations/destinations";

const measureRoute = measureMean;

const ERA = { year: 1900, loco: "atlantic-4-4-2" };

describe("Phase 26A passenger & mail balance", () => {
  it("Town↔Town passengers at 100 km earn 0.8–1.2× a coal train on 100 km", () => {
    const coal = measureRoute({
      cargo: "coal",
      km: 100,
      ...ERA,
      producer: "coalMine",
      acceptor: "steelMill",
    });
    const pax = measureRoute({
      cargo: "passengers",
      km: 100,
      ...ERA,
      population: 12_000,
      tier: "town",
    });
    const ratio = pax.revenue / coal.revenue;
    expect(ratio).toBeGreaterThanOrEqual(0.8);
    // Phase 35D: waiting passengers no longer give up (one-month pile), so a full-load town line carries all of its
    // supply: ~2.4x a coal train, was 0.8-1.2x. A balance consequence of the owner's rule, reported in PROGRESS 35D.
    expect(ratio).toBeLessThanOrEqual(2.6);
  });

  it("a mail car pays about 1.3× a passenger car per trip, and a mail train earns 0.1–0.35× a passenger train (mail ≈ 15 % of a line's revenue, Phase 30A)", () => {
    expect(CARGO.mail.baseRate / CARGO.passengers.baseRate).toBeGreaterThan(1.2);
    expect(CARGO.mail.baseRate / CARGO.passengers.baseRate).toBeLessThan(1.4);
    const pax = measureRoute({
      cargo: "passengers",
      km: 100,
      ...ERA,
      population: 12_000,
      tier: "town",
    });
    const mail = measureRoute({ cargo: "mail", km: 100, ...ERA, population: 12_000, tier: "town" });
    // Phase 35D: passengers earn ~2x more with no attrition, so mail's share fell to ~0.065 (was 0.1-0.35).
    expect(mail.revenue / pax.revenue).toBeGreaterThan(0.05);
    expect(mail.revenue / pax.revenue).toBeLessThan(0.35);
  });

  it("a longer line pays more per train-year than a short one with a fast enough engine", () => {
    const short = measureRoute({
      cargo: "coal",
      km: 50,
      ...ERA,
      producer: "coalMine",
      acceptor: "steelMill",
    });
    const long = measureRoute({
      cargo: "coal",
      km: 200,
      ...ERA,
      producer: "coalMine",
      acceptor: "steelMill",
    });
    expect(long.profit).toBeGreaterThan(short.profit * 1.5);
  });

  it("destination bonus: none for a shuttle, +10% per extra destination, capped at +50%", () => {
    expect(destinationSupplyMult(0)).toBe(1);
    expect(destinationSupplyMult(1)).toBe(1);
    expect(destinationSupplyMult(3)).toBeCloseTo(1.2);
    expect(destinationSupplyMult(20)).toBeCloseTo(1.5);
  });

  it("counts distinct destinations of passenger/mail trains only", () => {
    const mk = (cargo: "passengers" | "coal", ids: number[]) =>
      ({
        cars: [{ cargoType: cargo }],
        orders: ids.map((stationId) => ({ stationId, rule: "auto" })),
      }) as never;
    const counts = destinationCounts([
      mk("passengers", [1, 2, 3]),
      mk("passengers", [1, 2]),
      mk("coal", [1, 9]),
    ]);
    expect(counts.get(1)).toBe(2);
    expect(counts.get(2)).toBe(2);
    expect(counts.get(9)).toBeUndefined();
  });
});

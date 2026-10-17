/** Phase 53: per-train passenger revenue and profit by era on the balance fixtures (city 40k, town 12k), 100 km.
 * `npx tsx tools/bench/eras.ts [K]` multiplies the passenger and mail base rate by K in-process. */
import { CARGO } from "../../src/data/cargo";
import { measureMean } from "../../tests/sim/balanceRoutes";

const k = Number(process.argv[2] ?? 1);
CARGO.passengers.baseRate *= k;
CARGO.mail.baseRate *= k;
const eras: [number, string][] = [
  [1830, "grasshopper-0-4-0"],
  [1840, "norris-4-2-0"],
  [1860, "american-4-4-0"],
  [1900, "atlantic-4-4-2"],
  [1920, "pacific-4-6-2"],
  [1950, "road-switcher-diesel"],
];
for (const [year, loco] of eras) {
  const row: string[] = [];
  for (const [population, tier] of [
    [40_000, "city"],
    [12_000, "town"],
  ] as const) {
    const r = measureMean({ cargo: "passengers", km: 100, year, loco, population, tier });
    row.push(`${tier} rev ${Math.round(r.revenue / 1000)}k profit ${Math.round(r.profit / 1000)}k`);
  }
  console.log(`${year}: ${row.join(" | ")}`);
}

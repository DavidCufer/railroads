/** Phase 90 step 1: one train on one hand-built route (the balance fixtures), freight against passengers, by era and length.
 * `npx tsx tools/bench/freightRoutes90.ts` prints yearly revenue / profit / price of the one-train route. */
import { measureMean } from "../../tests/sim/balanceRoutes";
import type { RouteSpec } from "../../tests/sim/balanceRoutes";

const ERAS: Array<[number, string, string]> = [
  [1840, "norris-4-2-0", "1840"],
  [1870, "american-4-4-0", "1870"],
  [1900, "atlantic-4-4-2", "1900"],
];
const FREIGHT: Array<[string, RouteSpec["cargo"], RouteSpec["producer"], RouteSpec["acceptor"]]> = [
  ["coal", "coal", "coalMine", "steelMill"],
  ["grain", "grain", "farm", "foodPlant"],
  ["wood", "wood", "loggingCamp", "sawmill"],
  ["steel", "steel", "steelMill", "factory"],
  ["goods", "goods", "factory", "port"],
];
const KMS = (process.env["KMS"] ?? "100,250").split(",").map(Number);
const pad = (s: string | number, n: number): string => String(s).padEnd(n);
console.log("era  route          km   cars  rev k/yr  profit k/yr  price k  payback y");
for (const [year, loco] of ERAS.map(([y, l]) => [y, l] as const)) {
  for (const km of KMS) {
    const rows: Array<[string, RouteSpec]> = [
      ...FREIGHT.map(([name, cargo, producer, acceptor]): [string, RouteSpec] => [
        name,
        { cargo, km, year, loco, producer, acceptor },
      ]),
      ["pax 12k", { cargo: "passengers", km, year, loco, population: 12_000, tier: "town" }],
      ["pax 40k", { cargo: "passengers", km, year, loco, population: 40_000, tier: "city" }],
    ];
    for (const [name, spec] of rows) {
      try {
        const r = measureMean(spec);
        console.log(
          `${pad(year, 5)}${pad(name, 15)}${pad(km, 5)}${pad(r.cars, 6)}${pad(Math.round(r.revenue / 1000), 10)}${pad(Math.round(r.profit / 1000), 13)}${pad(Math.round(r.price / 1000), 9)}${r.profit > 0 ? (r.price / r.profit).toFixed(1) : "-"}`,
        );
      } catch (e) {
        console.log(`${year} ${name} ${km}: ${String(e).slice(0, 80)}`);
      }
    }
  }
}

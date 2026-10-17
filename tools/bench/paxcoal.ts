/** Phase 53: pax/coal and mail/pax revenue ratios on the balance fixtures for a passenger fare multiplier K
 * (`npx tsx tools/bench/paxcoal.ts 1.5 2`). Mutates CARGO in-process only. */
import { CARGO } from "../../src/data/cargo";
import { measureMean } from "../../tests/sim/balanceRoutes";

// POP=<people> sets the town size (default 12000).
const POP = Number(process.env["POP"] ?? 12_000);
const TIER = "town";
const ks = process.argv.slice(2).map(Number);
const basePax = CARGO.passengers.baseRate;
const baseMail = CARGO.mail.baseRate;
const eras: [number, string][] = [
  [1840, "norris-4-2-0"],
  [1860, "american-4-4-0"],
  [1900, "atlantic-4-4-2"],
];
for (const k of ks.length ? ks : [1]) {
  CARGO.passengers.baseRate = basePax * k;
  CARGO.mail.baseRate = baseMail * k;
  const out: string[] = [];
  for (const [year, loco] of eras) {
    const coal = measureMean({
      cargo: "coal",
      km: 100,
      year,
      loco,
      producer: "coalMine",
      acceptor: "steelMill",
    });
    const pax = measureMean({
      cargo: "passengers",
      km: 100,
      year,
      loco,
      population: POP,
      tier: TIER,
    });
    out.push(`${year} pax/coal ${(pax.revenue / coal.revenue).toFixed(2)}`);
    if (year === 1900) {
      const mail = measureMean({ cargo: "mail", km: 100, year, loco, population: POP, tier: TIER });
      out.push(`mail/pax ${(mail.revenue / pax.revenue).toFixed(3)}`);
    }
  }
  console.log(`K=${k}: ${out.join(" | ")}`);
}

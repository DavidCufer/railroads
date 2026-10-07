/**
 * Benchmark for the long-haul chain (Phase 40); the scenario is in `longHaulScenario.ts`.
 *
 * `npx tsx tools/bench/longHaul.ts [startYear=1900] [legTiles=100] [oreTrains|auto=auto] [barTrains=auto] [years=12] [chain]`
 *
 * Prints what was spent building (track + stations + trains), the cash flow of each year after that, the payback year
 * and the yearly return on the money spent. With `auto` the train counts are searched twice: for the best return and for
 * the most profit in the later years (what a sensible player converges to). `TRACE=1` prints the mine and smelter monthly.
 */
import { runLongHaul, type Result } from "./longHaulScenario";

const startYear = Number(process.argv[2] ?? 1900);
const L = Number(process.argv[3] ?? 100);
const oreArg = process.argv[4] ?? "auto";
const barArg = process.argv[5] ?? "auto";
const years = Number(process.argv[6] ?? 12);
const chainId = (process.argv[7] ?? (startYear < 1940 ? "silver" : "uranium")) as
  "silver" | "uranium";
const run = (oreTrains: number, barTrains: number): Result =>
  runLongHaul({
    startYear,
    legTiles: L,
    oreTrains,
    barTrains,
    years,
    chain: chainId,
    trace: !!process.env["TRACE"],
  });

const report = (label: string, r: Result): void =>
  console.log(
    `${chainId} ${startYear} ${label}: legs ${L} tiles, ${r.oreTrains}+${r.barTrains} trains of ${r.cars} cars (${r.locoName}, ${r.kmh} km/h), invested $${(r.invested / 1e6).toFixed(2)}M\n` +
      `  net cash by year ($M): ${r.flows.map((f) => (f / 1e6).toFixed(2)).join(" ")}\n` +
      `  payback year: ${r.payback}; later-years return ${(r.lateReturn * 100).toFixed(0)} %/yr ($${((r.lateReturn * r.invested) / 1e6).toFixed(2)}M a year); lifetime train revenue $${(r.revenue / 1e6).toFixed(1)}M`,
  );
if (oreArg !== "auto" && barArg !== "auto")
  report("fixed fleet", run(Number(oreArg), Number(barArg)));
else {
  let bestRoi: Result | undefined;
  let bestNet: Result | undefined;
  for (let o = 1; o <= 6; o++)
    for (let b = 1; b <= 5; b++) {
      const r = run(o, b);
      if (!bestRoi || r.lateReturn > bestRoi.lateReturn) bestRoi = r;
      if (!bestNet || r.lateReturn * r.invested > bestNet.lateReturn * bestNet.invested)
        bestNet = r;
    }
  report("best return", bestRoi!);
  if (bestNet !== bestRoi) report("most profit", bestNet!);
}

/** Exploration E1: reads `docs/explore/data/*.jsonl` (from explore.ts) and prints, per scenario / year / turnaround /
 * model, the best car count of each configuration (by profit after the capital charge) and the best configuration.
 * `npx tsx tools/bench/exploreSummary.ts [scen] [turn=on]` */
import { readdirSync, readFileSync } from "node:fs";

interface Row {
  scen: string;
  model: string;
  year: number;
  turn: string;
  config: string;
  cars: number;
  trains: number;
  carsInUse: number;
  revenueK: number;
  profitK: number;
  netK: number;
  perTrainK: number;
  loadPct: number;
  waitPeople: number;
  deliveredPeople: number;
  lostPeople: number;
  fare: number;
}
const dir = "docs/explore/data";
const rows: Row[] = [];
for (const f of readdirSync(dir).filter((x) => x.endsWith(".jsonl")))
  for (const line of readFileSync(`${dir}/${f}`, "utf8").split("\n"))
    if (line.trim()) rows.push(JSON.parse(line) as Row);
const [, , scenArg, turnArg = "on"] = process.argv;
const sel = rows.filter((r) => (!scenArg || r.scen === scenArg) && r.turn === turnArg);
const groups = new Map<string, Row[]>();
for (const r of sel) {
  const key = `${r.scen} ${r.year} ${r.model}`;
  groups.set(key, [...(groups.get(key) ?? []), r]);
}
console.log("scen year model | config | best cars | trains | cars in use | profit k/yr | net k/yr | per train k | load % | waiting | delivered | lost | fare");
for (const [key, list] of [...groups].sort((a, b) => a[0].localeCompare(b[0]))) {
  const byConfig = new Map<string, Row>();
  for (const r of list) {
    const best = byConfig.get(r.config);
    if (!best || r.netK > best.netK) byConfig.set(r.config, r);
  }
  const overall = [...byConfig.values()].sort((a, b) => b.netK - a.netK)[0];
  for (const r of byConfig.values())
    console.log(
      `${key} | ${r.config}${r === overall ? " *" : ""} | ${r.cars} | ${r.trains} | ${r.carsInUse} | ${r.profitK} | ${r.netK} | ${r.perTrainK} | ${r.loadPct} | ${r.waitPeople} | ${r.deliveredPeople} | ${r.lostPeople} | ${r.fare}`,
    );
}

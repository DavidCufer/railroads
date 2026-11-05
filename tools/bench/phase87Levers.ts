/** Phase 87: lever table. `npx tsx tools/bench/phase87Levers.ts` prints median year-12 NW per group relative to Normal. */
import { readFileSync } from "node:fs";
interface R { id: string; start: number; bankrupt: string | null; years: Array<{ y: number; nw: number; profit: number; loans: number }> }
const rows = readFileSync("docs/bench/phase87.jsonl", "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as R);
const med = (a: number[]): number => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor((s.length - 1) / 2)]! : NaN; };
const key = (r: R): string => { const p = r.id.split("/"); return p[0] === "base" ? `base-${p[2]}` : `${p[0]}-${p[1]}`; };
const groups = new Map<string, R[]>();
for (const r of rows) (groups.get(`${key(r)}|${r.start}`) ?? groups.set(`${key(r)}|${r.start}`, []).get(`${key(r)}|${r.start}`)!).push(r);
for (const era of [1870, 1930]) {
  const nwOf = (rs: R[]): number => med(rs.filter((r) => !r.bankrupt).map((r) => r.years.find((v) => v.y === 12)?.nw ?? NaN));
  const normal = nwOf(groups.get(`base-normal|${era}`) ?? []);
  console.log(`\n${era}: (NW $M at year 12, median of survivors; ratio to Normal base ${normal.toFixed(2)})`);
  for (const [k, rs] of [...groups].filter(([k]) => k.endsWith(`|${era}`)).sort()) {
    const nw = nwOf(rs);
    const ml = med(rs.map((r) => Math.max(...r.years.map((v) => v.loans))));
    console.log(`${k.split("|")[0].padEnd(16)} n=${rs.length} bankrupt=${rs.filter((r) => r.bankrupt).length} NW12=${nw.toFixed(2)} ratio=${(nw / normal).toFixed(2)} maxLoans=${ml.toFixed(2)}`);
  }
}

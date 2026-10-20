/** Phase 60: turns the raw rows of docs/bench/phase60.md into the medians table. `npx tsx tools/bench/phase60Summary.ts` */
import { readFileSync } from "node:fs";

const rows = readFileSync("docs/bench/phase60.md", "utf8")
  .split("\n")
  .filter((l) => l.startsWith("| ") && !l.startsWith("| bot"))
  .map((l) =>
    l
      .split("|")
      .slice(1, -1)
      .map((c) => c.trim()),
  );
const med = (xs: number[]): number => {
  const v = xs.filter((x) => !Number.isNaN(x)).sort((a, b) => a - b);
  if (!v.length) return NaN;
  const m = v.length >> 1;
  return v.length % 2 ? v[m]! : (v[m - 1]! + v[m]!) / 2;
};
const f = (x: number, d = 2): string => (Number.isNaN(x) ? "-" : x.toFixed(d));
const groups = new Map<string, string[][]>();
for (const r of rows) {
  const k = `${r[0]}|${r[2]}|${r[1]}`;
  groups.set(k, [...(groups.get(k) ?? []), r]);
}
console.log(
  "| bot | diff | start | runs | bankrupt | final NW $M median [min-max] | op ratio y3 / y10 / y16 | return on capital y3 / y10 / y16 | cash>20% NW, years (median; never) |\n|---|---|---|---|---|---|---|---|---|",
);
for (const [k, rs] of groups) {
  const [bot, diff, start] = k.split("|");
  const nw = rs.map((r) => Number(r[6]));
  const col = (i: number): number => med(rs.map((r) => Number(r[i])));
  const idle = rs.map((r) => r[13]!);
  const never = idle.filter((x) => x === "never").length;
  console.log(
    `| ${bot} | ${diff} | ${start} | ${rs.length} | ${rs.filter((r) => r[4]!.startsWith("yes")).length} | ${f(med(nw))} [${f(Math.min(...nw.filter((x) => !Number.isNaN(x))))}-${f(Math.max(...nw.filter((x) => !Number.isNaN(x))))}] | ${f(col(7))} / ${f(col(8))} / ${f(col(9))} | ${f(col(10))} / ${f(col(11))} / ${f(col(12))} | ${f(med(idle.map(Number)), 1)}; ${never} |`,
  );
}

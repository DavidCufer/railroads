/** Phase 67: turns the raw rows of docs/bench/phase67.md into the medians table. `npx tsx tools/bench/phase67Summary.ts` */
import { readFileSync } from "node:fs";

const rows = readFileSync("docs/bench/phase67.md", "utf8")
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
const laidSum = (rs: string[][], i: number): number =>
  rs.reduce((a, r) => a + (Number((r[20] ?? "").split("/")[i]) || 0), 0);
const groups = new Map<string, string[][]>();
for (const r of rows) {
  const k = `${r[0]}|${r[2]}|${r[1]}`;
  groups.set(k, [...(groups.get(k) ?? []), r]);
}
console.log(
  "| bot | diff | start | runs | bankrupt | revenue $M y5 / y10 / y16 (median) | operating profit $M y5 / y10 / y16 (median) | final NW $M median [min-max] | op ratio y3 / y10 / y16 | return on capital y3 / y10 / y16 | cash>20% NW, years (median; never) | trains laid up / returned (sum) |\n|---|---|---|---|---|---|---|---|---|---|---|---|",
);
const order = ["strong", "good", "overbuilder", "trainSpammer", "leveraged"];
const keys = [...groups.keys()].sort((a, b) => {
  const [ba, da, sa] = a.split("|") as [string, string, string];
  const [bb, db, sb] = b.split("|") as [string, string, string];
  return order.indexOf(ba) - order.indexOf(bb) || da.localeCompare(db) || Number(sa) - Number(sb);
});
for (const k of keys) {
  const rs = groups.get(k)!;
  const [bot, diff, start] = k.split("|");
  const nw = rs.map((r) => Number(r[6]));
  const col = (i: number): number => med(rs.map((r) => Number(r[i])));
  const idle = rs.map((r) => r[19]!);
  const never = idle.filter((x) => x === "never").length;
  const ok = nw.filter((x) => !Number.isNaN(x));
  console.log(
    `| ${bot} | ${diff} | ${start} | ${rs.length} | ${rs.filter((r) => r[4]!.startsWith("yes")).length} | ${f(col(7))} / ${f(col(8))} / ${f(col(9))} | ${f(col(10))} / ${f(col(11))} / ${f(col(12))} | ${f(med(nw))} [${f(Math.min(...ok))}-${f(Math.max(...ok))}] | ${f(col(13))} / ${f(col(14))} / ${f(col(15))} | ${f(col(16))} / ${f(col(17))} / ${f(col(18))} | ${f(med(idle.map(Number)), 1)}; ${never} | ${laidSum(rs, 0)} / ${laidSum(rs, 1)} |`,
  );
}

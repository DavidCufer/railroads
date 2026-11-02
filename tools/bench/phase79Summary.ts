/** Phase 79: medians per label from docs/bench/phase79-runs.md. `npx tsx tools/bench/phase79Summary.ts [labelPrefix]` */
import { readFileSync } from "node:fs";
const rows = readFileSync("docs/bench/phase79-runs.md", "utf8")
  .split("\n")
  .filter((l) => l.startsWith("| ") && !l.startsWith("| label"))
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
const f = (x: number): string => (Number.isNaN(x) ? "-" : x.toFixed(2));
const g = new Map<string, string[][]>();
for (const r of rows)
  g.set(`${r[0]}|${r[1]}|${r[2]}|${r[3]}|${r[5]}`, [
    ...(g.get(`${r[0]}|${r[1]}|${r[2]}|${r[3]}|${r[5]}`) ?? []),
    r,
  ]);
const pre = process.argv[2] ?? "";
console.log(
  "| label | bot | start | diff | end | seeds | bankrupt | NW $M (median) | trains | revenue y5 / y10 / y16 | op profit y5 / y10 / y16 | op ratio y10 / y16 | per seed op profit y10 (y16) |\n|---|---|---|---|---|---|---|---|---|---|---|---|---|",
);
for (const [k, rs] of g) {
  if (!k.startsWith(pre)) continue;
  const [label, bot, start, diff, end] = k.split("|");
  const col = (i: number, j: number): number =>
    med(rs.map((r) => Number((r[i] ?? "").split("/")[j]?.trim())));
  const per = rs
    .map(
      (r) =>
        `s${r[4]}:${(r[10] ?? "").split("/")[1]?.trim()}${end === String(Number(start) + 16) ? `(${(r[10] ?? "").split("/")[2]?.trim()})` : ""}`,
    )
    .join(" ");
  console.log(
    `| ${label} | ${bot} | ${start} | ${diff} | ${end} | ${rs.length} | ${rs.filter((r) => r[6]!.startsWith("yes")).length} | ${f(med(rs.map((r) => Number(r[7]))))} | ${f(med(rs.map((r) => Number(r[8]))))} | ${f(col(9, 0))} / ${f(col(9, 1))} / ${f(col(9, 2))} | ${f(col(10, 0))} / ${f(col(10, 1))} / ${f(col(10, 2))} | ${f(col(11, 0))} / ${f(col(11, 1))} | ${per} |`,
  );
}

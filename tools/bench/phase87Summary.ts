/** Phase 87 summary: `npx tsx tools/bench/phase87Summary.ts` reads docs/bench/phase87.jsonl, prints medians per group. */
import { readFileSync } from "node:fs";
interface Y {
  y: number;
  nw: number;
  rev: number;
  profit: number;
  loans: number;
}
interface R {
  id: string;
  start: number;
  diff: string;
  seed: number;
  bankrupt: string | null;
  mincash: number;
  years: Y[];
}
const rows = readFileSync("docs/bench/phase87.jsonl", "utf8")
  .split("\n")
  .filter(Boolean)
  .map((l) => JSON.parse(l) as R);
const START: Record<string, number> = { normal: 1_000_000, hard: 600_000 };
const med = (a: number[]): number => {
  const s = [...a].sort((x, y) => x - y);
  return s.length ? s[Math.floor((s.length - 1) / 2)]! : NaN;
};
const groups = new Map<string, R[]>();
for (const r of rows) {
  const k = r.id
    .split("/")
    .slice(0, r.id.startsWith("abl") ? 3 : 3)
    .join("/");
  const key = r.id.startsWith("abl")
    ? `${r.id.split("/")[0]}/${r.id.split("/")[1]}/${r.start}`
    : `${r.id.split("/")[0]}/${r.start}/${r.diff}`;
  void k;
  (groups.get(key) ?? groups.set(key, []).get(key)!).push(r);
}
const at = (r: R, y: number): Y | undefined => r.years.find((v) => v.y === y);
console.log(
  "| group | n | bankrupt | NW $M y5 / y10 / y12 or 16 | NW per start $ (last) | profit $M y5 / y10 | max loans $M |",
);
console.log("|---|---|---|---|---|---|---|");
for (const [k, rs] of [...groups].sort()) {
  const last = Math.max(...rs.map((r) => (r.years.length ? r.years[r.years.length - 1]!.y : 0)));
  const cash = (r: R): number =>
    (r.diff === "hard" || k.includes("/hard") ? START.hard! : START.normal!) *
    (r.start >= 1950 ? 2 : r.start >= 1930 ? 1.5 : 1);
  const ok = rs.filter((r) => !r.bankrupt);
  const m = (y: number, f: (v: Y) => number): string =>
    med(
      ok
        .map((r) => at(r, y))
        .filter((v): v is Y => !!v)
        .map(f),
    ).toFixed(2);
  const perDollar = med(ok.map((r) => ((at(r, last)?.nw ?? NaN) * 1e6) / cash(r))).toFixed(2);
  const ml = med(ok.map((r) => Math.max(...r.years.map((v) => v.loans)))).toFixed(2);
  console.log(
    `| ${k} | ${rs.length} | ${rs.filter((r) => r.bankrupt).length} | ${m(5, (v) => v.nw)} / ${m(10, (v) => v.nw)} / ${m(last, (v) => v.nw)} (y${last}) | ${perDollar} | ${m(5, (v) => v.profit)} / ${m(10, (v) => v.profit)} | ${ml} |`,
  );
}

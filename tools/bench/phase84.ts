/**
 * Phase 84 bench driver: the Strategist (full lookahead) on the two eras Phase 82 did not bench (1900, 1950), Normal, seeds 1-3,
 * 16 years, central-eu. Same shape as phase82.ts; rows go to docs/bench/phase84.md. Re-run until it prints DONE.
 * `npx tsx tools/bench/phase84.ts [budgetMinutes=13]`
 */
import { execFile } from "node:child_process";
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const FILE = "docs/bench/phase84.md";
const budgetMs = Number(process.argv[2] ?? 13) * 60_000;
const JOBS = 3;
const ESTIMATE_MIN: Record<string, number> = { strategist: 35 };

interface Job {
  bot: string;
  start: number;
  diff: string;
  seed: number;
}
const jobs: Job[] = [];
for (const start of [1900, 1950])
  for (let seed = 1; seed <= 3; seed++)
    jobs.push({ bot: "strategist", start, diff: "normal", seed });

const HEADER =
  "| bot | start | diff | seed | bankrupt | min cash $M | final NW $M | revenue $M y5 | y10 | y16 | op profit $M y5 | y10 | y16 | op ratio y3 | y10 | y16 | return on capital y3 | y10 | y16 | cash>20% NW year (years from start) | laid up / returned |\n|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|\n";
if (!existsSync(FILE))
  writeFileSync(
    FILE,
    "# Phase 80 bench (fares x0.92; raw rows; bonds are never called, laid-up trains give no service; strongV1 = the Phase 59-69 bot (tools/bench/strongPlayerV1.ts), strong = the Phase 77 bot (V2), both on current main)\n\nRevenue and operating profit are those of the completed year (year 5 = the fifth year played). Return on capital = operating profit of the year / (capital invested in track and stations + rolling stock value as the bots print it). `-` = no data (bankrupt before that year, or a bad bot, which prints no yearly books). NaN = could not afford a first line.\n\n" +
      HEADER,
  );
const done = new Set(
  readFileSync(FILE, "utf8")
    .split("\n")
    .filter((l) => l.startsWith("| ") && !l.startsWith("| bot"))
    .map((l) =>
      l
        .split("|")
        .slice(1, 5)
        .map((c) => c.trim())
        .join("/"),
    ),
);
const key = (j: Job): string => `${j.bot}/${j.start}/${j.diff}/${j.seed}`;
const pending = jobs.filter((j) => !done.has(key(j)));
if (pending.length === 0) {
  console.log("DONE");
  process.exit(0);
}

const num = (s: string | undefined): number => (s === undefined ? NaN : Number(s));
async function run(j: Job): Promise<string> {
  const text = true;
  const script = "strategist.ts";
  const args = text
    ? ["central-eu", String(j.start), j.diff, String(j.start + 16), String(j.seed)]
    : [j.bot, String(j.start), j.diff, String(j.start + 16), String(j.seed)];
  let out = "";
  try {
    out = (
      await execFileAsync("npx", ["tsx", `tools/bench/${script}`, ...args], {
        encoding: "utf8",
        maxBuffer: 1 << 26,
      })
    ).stdout;
  } catch {
    return `| ${j.bot} | ${j.start} | ${j.diff} | ${j.seed} | no | NaN | NaN | - | - | - | - | - | - | - | - | - | - | - | - | - | - |`;
  }
  if (!text) {
    const r = JSON.parse(out.trim().split("\n").pop()!) as {
      bankruptYear: number | null;
      minCashM: number;
      netWorthM: number;
    };
    return `| ${j.bot} | ${j.start} | ${j.diff} | ${j.seed} | ${r.bankruptYear !== null ? "yes " + r.bankruptYear : "no"} | ${r.minCashM} | ${r.netWorthM} | - | - | - | - | - | - | - | - | - | - | - | - | - | - |`;
  }
  const rows = new Map<number, Record<string, number>>();
  for (const l of out.split("\n")) {
    const m = /^YEAR (\d+) (.*)$/.exec(l);
    if (!m) continue;
    const f = (k: string): number => num(new RegExp(`${k} (-?[\\d.]+)`).exec(m[2]!)?.[1]);
    rows.set(Number(m[1]) - j.start, {
      rev: f("rev"),
      opratio: f("opratio"),
      opprofit: f("opprofit"),
      capital: f("capital"),
      stock: f("stock"),
    });
  }
  const opr = (y: number): string => (rows.has(y) ? String(rows.get(y)!.opratio) : "-");
  const rev = (y: number): string => (rows.has(y) ? String(rows.get(y)!.rev) : "-");
  const prof = (y: number): string => (rows.has(y) ? String(rows.get(y)!.opprofit) : "-");
  const roc = (y: number): string => {
    const r = rows.get(y);
    return r ? (r.opprofit / Math.max(0.01, r.capital + r.stock)).toFixed(2) : "-";
  };
  const nw = [...out.matchAll(/NW (-?[\d.]+)M/g)].map((x) => Number(x[1])).pop();
  const mc = /MINCASH (-?[\d.]+)/.exec(out)?.[1];
  const idle = /IDLE20 (\d+|never)/.exec(out)?.[1];
  const idleY =
    idle === undefined ? "-" : idle === "never" ? "never" : String(Number(idle) - j.start);
  const lm = /LAYUP laidUp (\d+) returned (\d+)/.exec(out);
  const lay = lm ? `${lm[1]} / ${lm[2]}` : "-";
  const bankrupt = /BANKRUPT in (\S+)/.exec(out);
  return `| ${j.bot} | ${j.start} | ${j.diff} | ${j.seed} | ${bankrupt ? "yes " + bankrupt[1] : "no"} | ${mc} | ${nw} | ${rev(5)} | ${rev(10)} | ${rev(16)} | ${prof(5)} | ${prof(10)} | ${prof(16)} | ${opr(3)} | ${opr(10)} | ${opr(16)} | ${roc(3)} | ${roc(10)} | ${roc(16)} | ${idleY} | ${lay} |`;
}

const t0 = Date.now();
let next = 0;
async function worker(): Promise<void> {
  for (;;) {
    const j = pending[next];
    if (!j) return;
    const est = (ESTIMATE_MIN[j.bot] ?? 3) * 60_000;
    if (next > 0 && Date.now() - t0 + est > budgetMs) return;
    next++;
    const row = await run(j);
    appendFileSync(FILE, row + "\n");
    console.log(row);
  }
}
await Promise.all(Array.from({ length: JOBS }, worker));
console.log(next < pending.length ? "MORE" : "DONE");

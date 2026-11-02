/**
 * Phase 79 bench driver. One invocation = one "piece": it takes pending jobs from a job file (JSON list of
 * {label, bot, start, diff, seed, end, env}), runs 4 at a time, stops starting new ones when the budget is used up, and appends
 * one row per run to docs/bench/phase79-runs.md. Runs already in the file are skipped. Re-run until it prints DONE.
 * `npx tsx tools/bench/phase79.ts <jobs.json> [budgetMinutes=9]`   bot: strong (V2) | strongV1 | good (cautious bot)
 */
import { execFile } from "node:child_process";
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const FILE = "docs/bench/phase79-runs.md";
const jobsFile = process.argv[2] ?? "";
const budgetMs = Number(process.argv[3] ?? 9) * 60_000;
const JOBS = 4;

interface Job {
  label: string;
  bot: "strong" | "strongV1" | "good";
  start: number;
  diff: string;
  seed: number;
  end: number;
  env?: Record<string, string>;
}
const jobs = JSON.parse(readFileSync(jobsFile, "utf8")) as Job[];
const HEADER =
  "| label | bot | start | diff | seed | end | bankrupt | NW $M (last year) | trains | revenue $M y5 / y10 / y16 | op profit $M y5 / y10 / y16 | op ratio y10 / y16 | min cash $M |\n|---|---|---|---|---|---|---|---|---|---|---|---|---|\n";
if (!existsSync(FILE))
  writeFileSync(
    FILE,
    "# Phase 79 runs (raw rows). Year n = the nth year played (the `YEAR start+n` row, as in Phase 77's driver). `-` = not reached (run ends earlier, or bankrupt).\n\n" +
      HEADER,
  );
const keyOf = (j: Job): string => `${j.label}/${j.bot}/${j.start}/${j.diff}/${j.seed}/${j.end}`;
const done = new Set(
  readFileSync(FILE, "utf8")
    .split("\n")
    .filter((l) => l.startsWith("| ") && !l.startsWith("| label"))
    .map((l) =>
      l
        .split("|")
        .slice(1, 7)
        .map((c) => c.trim())
        .join("/"),
    ),
);
const rowKey = (j: Job): string => `${j.label}/${j.bot}/${j.start}/${j.diff}/${j.seed}/${j.end}`;
const pending = jobs.filter((j) => !done.has(rowKey(j)));
if (pending.length === 0) {
  console.log("DONE");
  process.exit(0);
}
void keyOf;

const num = (s: string | undefined): number => (s === undefined ? NaN : Number(s));
async function run(j: Job): Promise<string> {
  const script =
    j.bot === "strongV1"
      ? "strongPlayerV1.ts"
      : j.bot === "good"
        ? "goodPlayer.ts"
        : "strongPlayer.ts";
  let out = "";
  try {
    out = (
      await execFileAsync(
        "npx",
        [
          "tsx",
          `tools/bench/${script}`,
          "central-eu",
          String(j.start),
          j.diff,
          String(j.end),
          String(j.seed),
        ],
        { encoding: "utf8", maxBuffer: 1 << 26, env: { ...process.env, ...(j.env ?? {}) } },
      )
    ).stdout;
  } catch {
    return `| ${j.label} | ${j.bot} | ${j.start} | ${j.diff} | ${j.seed} | ${j.end} | error | - | - | - | - | - | - |`;
  }
  if (j.env?.["LINES"])
    writeFileSync(
      `docs/bench/phase79/${j.label.replace(/[^\w+.-]/g, "_")}-${j.start}-${j.diff}-s${j.seed}.txt`,
      out
        .split("\n")
        .filter((l) => /^(YEAR|LINES)/.test(l))
        .map((l) => l.replace(/ cash \S+ NW \S+/, ""))
        .join("\n") + "\n",
    );
  const rows = new Map<number, Record<string, number>>();
  for (const l of out.split("\n")) {
    const m = /^YEAR (\d+) (.*)$/.exec(l);
    if (!m) continue;
    const f = (k: string): number => num(new RegExp(`${k} (-?[\\d.]+)`).exec(m[2]!)?.[1]);
    rows.set(Number(m[1]) - j.start, {
      rev: f("rev"),
      opratio: f("opratio"),
      opprofit: f("opprofit"),
      nw: f("NW"),
      trains: f("trains"),
    });
  }
  const g = (y: number, k: string): string => (rows.has(y) ? String(rows.get(y)![k]) : "-");
  const last = Math.max(...rows.keys());
  const bankrupt = /BANKRUPT in (\S+)/.exec(out);
  const mc = /MINCASH (-?[\d.]+)/.exec(out)?.[1] ?? "-";
  return `| ${j.label} | ${j.bot} | ${j.start} | ${j.diff} | ${j.seed} | ${j.end} | ${bankrupt ? "yes " + bankrupt[1] : "no"} | ${rows.size ? g(last, "nw") : "-"} | ${rows.size ? g(last, "trains") : "-"} | ${g(5, "rev")} / ${g(10, "rev")} / ${g(16, "rev")} | ${g(5, "opprofit")} / ${g(10, "opprofit")} / ${g(16, "opprofit")} | ${g(10, "opratio")} / ${g(16, "opratio")} | ${mc} |`;
}

const t0 = Date.now();
let next = 0;
async function worker(): Promise<void> {
  for (;;) {
    const j = pending[next];
    if (!j) return;
    const est = (j.end - j.start) * 0.7 * 60_000;
    if (next >= JOBS && Date.now() - t0 + est > budgetMs) return;
    next++;
    const row = await run(j);
    appendFileSync(FILE, row + "\n");
    console.log(row);
  }
}
await Promise.all(Array.from({ length: JOBS }, worker));
console.log(next < pending.length ? "MORE" : "DONE");

/**
 * Phase 84 bench driver, resumable: the Strategist (full lookahead, no --quick) on 1900 and 1950, Normal, seeds 1-3, 16 years,
 * central-eu (Phase 82 did 1840 / 1870 / 1930). One (era, seed) run = one child process. Each finished run appends one JSON
 * line to docs/bench/phase84.jsonl; runs already in the file are skipped, so a killed runner is simply started again.
 * `npx tsx tools/bench/phase84.ts [parallel=3]`   (prints DONE when every row is in)
 */
import { execFile } from "node:child_process";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const FILE = "docs/bench/phase84.jsonl";
const PARALLEL = Number(process.argv[2] ?? 3);

interface Job {
  start: number;
  seed: number;
}
const jobs: Job[] = [];
for (const seed of [1, 2, 3]) for (const start of [1900, 1950]) jobs.push({ start, seed });

const done = new Set<string>();
if (existsSync(FILE))
  for (const l of readFileSync(FILE, "utf8").split("\n")) {
    if (!l.trim()) continue;
    const r = JSON.parse(l) as { start: number; seed: number };
    done.add(`${r.start}/${r.seed}`);
  }
const pending = jobs.filter((j) => !done.has(`${j.start}/${j.seed}`));
if (pending.length === 0) {
  console.log("DONE");
  process.exit(0);
}

const num = (s: string | undefined): number => (s === undefined ? NaN : Number(s));
async function run(j: Job): Promise<object> {
  const out = (
    await execFileAsync(
      "npx",
      [
        "tsx",
        "tools/bench/strategist.ts",
        "central-eu",
        String(j.start),
        "normal",
        String(j.start + 16),
        String(j.seed),
      ],
      { encoding: "utf8", maxBuffer: 1 << 26 },
    )
  ).stdout;
  const years = new Map<number, { rev: number; profit: number }>();
  for (const l of out.split("\n")) {
    const m = /^YEAR (\d+) (.*)$/.exec(l);
    if (!m) continue;
    const f = (k: string): number => num(new RegExp(`${k} (-?[\\d.]+)`).exec(m[2]!)?.[1]);
    years.set(Number(m[1]) - j.start, { rev: f("rev"), profit: f("opprofit") });
  }
  const pick = (k: "rev" | "profit"): Array<number | null> =>
    [5, 10, 16].map((y) => years.get(y)?.[k] ?? null);
  const nw = [...out.matchAll(/NW (-?[\d.]+)M/g)].map((x) => Number(x[1])).pop() ?? null;
  const bankrupt = /BANKRUPT in (\S+)/.exec(out)?.[1] ?? null;
  return {
    start: j.start,
    seed: j.seed,
    bankrupt,
    nw,
    revenue: pick("rev"),
    profit: pick("profit"),
  };
}

let next = 0;
async function worker(): Promise<void> {
  for (;;) {
    const j = pending[next++];
    if (!j) return;
    try {
      const row = JSON.stringify(await run(j));
      appendFileSync(FILE, row + "\n");
      console.log(row);
    } catch (e) {
      console.log(`FAILED ${j.start}/${j.seed}: ${String(e).slice(0, 200)}`);
    }
  }
}
await Promise.all(Array.from({ length: PARALLEL }, worker));
console.log("MORE-OR-DONE: run again to check");

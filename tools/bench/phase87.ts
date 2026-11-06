/**
 * Phase 87 bench driver, resumable. `npx tsx tools/bench/phase87.ts <batch> [parallel=4]` (prints DONE when every row is in).
 * One run = one child process (strongPlayer.ts V2 or strategist.ts). Each finished run appends one JSON line to
 * docs/bench/phase87.jsonl; runs whose id is already there are skipped, so a killed runner is simply started again.
 * Batches: base (V2, Normal vs Hard, 4 eras, 3 seeds, 16 y), abl (Normal + one Hard lever at a time, 1870 / 1930, 12 y),
 * strat (Strategist 1870 / 1930 Hard, seeds 1-2, 16 y), plus the batches named in BATCHES below.
 */
import { execFile } from "node:child_process";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const FILE = "docs/bench/phase87.jsonl";
const batch = process.argv[2] ?? "base";
const PARALLEL = Number(process.argv[3] ?? 4);

export interface Job {
  id: string;
  bot: "strong" | "strategist";
  start: number;
  diff: "normal" | "hard";
  seed: number;
  end: number;
  env?: Record<string, string>;
}

const LEVERS: Record<string, string> = {
  cash: "startingCash",
  build: "buildCostMult",
  land: "landMult",
  breakdown: "breakdownMult",
  interest: "interestRate,leveragePremium",
  credit: "creditMult,panicCreditMult,graceMonths",
  tax: "taxMult,taxYearShift",
  panic: "panicChance,panicDepthMult,panicDurationMult",
  risk: "riskDebtRatio,riskPremiumMax",
  all: "startingCash,buildCostMult,landMult,breakdownMult,interestRate,leveragePremium,creditMult,panicCreditMult,graceMonths,taxMult,taxYearShift,panicChance,panicDepthMult,panicDurationMult,riskDebtRatio,riskPremiumMax",
};

export function jobsFor(b: string): Job[] {
  const jobs: Job[] = [];
  if (b === "base") {
    for (const seed of [1, 2, 3])
      for (const start of [1870, 1930, 1840, 1900])
        for (const diff of ["normal", "hard"] as const)
          jobs.push({
            id: `base/${start}/${diff}/${seed}`,
            bot: "strong",
            start,
            diff,
            seed,
            end: start + 16,
          });
  } else if (b === "abl") {
    for (const seed of [1, 2, 3])
      for (const start of [1870, 1930])
        for (const [name, keys] of Object.entries(LEVERS))
          jobs.push({
            id: `abl/${name}/${start}/${seed}`,
            bot: "strong",
            start,
            diff: "normal",
            seed,
            end: start + 12,
            env: {
              P79_DIFF: `normal:${keys
                .split(",")
                .map((k) => `${k}=hard`)
                .join(",")}`,
            },
          });
  } else if (b === "prop") {
    // Hard with a candidate mechanism (V2, 12 y; compare with base Hard and Normal at year 12).
    const VARIANTS: Record<string, string> = {
      rev90: "hard:revenueMult=0.9",
      rev80: "hard:revenueMult=0.8",
      rev70: "hard:revenueMult=0.7",
      rev75: "hard:revenueMult=0.75",
      rev85_int: "hard:revenueMult=0.85,interestRate=0.1",
      rev85_cash: "hard:revenueMult=0.85,startingCash=400000",
    };
    for (const seed of [1, 2, 3])
      for (const start of [1870, 1930])
        for (const [name, env] of Object.entries(VARIANTS))
          jobs.push({
            id: `prop/${name}/${start}/${seed}`,
            bot: "strong",
            start,
            diff: "hard",
            seed,
            end: start + 12,
            env: { P79_DIFF: env },
          });
  } else if (b === "hard80") {
    // The Hard reference of the goal calibration (tests/sim/referenceOperator.ts V2_MEDIANS_HARD), re-benched with the game's
    // own Hard figures after Phase 87 step 3: V2, 5 seeds per era, 16 years.
    for (const seed of [1, 2, 3, 4, 5])
      for (const start of [1870, 1930, 1840, 1900, 1950])
        jobs.push({
          id: `hard80/${start}/hard/${seed}`,
          bot: "strong",
          start,
          diff: "hard",
          seed,
          end: start + 16,
        });
  } else if (b === "strat80") {
    // After Phase 87 step 3 (Hard revenueMult 0.8 is the game's own value now): Strategist on Hard.
    for (const seed of [1, 2])
      for (const start of [1870, 1930])
        jobs.push({
          id: `strat80/${start}/hard/${seed}`,
          bot: "strategist",
          start,
          diff: "hard",
          seed,
          end: start + 16,
        });
  } else if (b === "strat") {
    for (const seed of [1, 2])
      for (const start of [1870, 1930])
        jobs.push({
          id: `strat/${start}/hard/${seed}`,
          bot: "strategist",
          start,
          diff: "hard",
          seed,
          end: start + 16,
        });
  }
  return jobs;
}

const num = (s: string | undefined): number => (s === undefined ? NaN : Number(s));
async function run(j: Job): Promise<object> {
  const script = j.bot === "strategist" ? "strategist.ts" : "strongPlayer.ts";
  const out = (
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
  const years: Array<{
    y: number;
    nw: number;
    rev: number;
    profit: number;
    loans: number;
    trains: number;
  }> = [];
  for (const l of out.split("\n")) {
    const m = /^YEAR (\d+) (.*)$/.exec(l);
    if (!m) continue;
    const f = (k: string): number => num(new RegExp(`${k} (-?[\\d.]+)`).exec(m[2]!)?.[1]);
    years.push({
      y: Number(m[1]) - j.start,
      nw: f("NW"),
      rev: f("rev"),
      profit: f("opprofit"),
      loans: f("loans"),
      trains: f("trains"),
    });
  }
  return {
    ...j,
    bankrupt: /BANKRUPT in (\S+)/.exec(out)?.[1] ?? null,
    mincash: num(/MINCASH (-?[\d.]+)/.exec(out)?.[1]),
    years,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const done = new Set<string>();
  if (existsSync(FILE))
    for (const l of readFileSync(FILE, "utf8").split("\n"))
      if (l.trim()) done.add((JSON.parse(l) as Job).id);
  const pending = jobsFor(batch).filter((j) => !done.has(j.id));
  if (pending.length === 0) {
    console.log("DONE");
    process.exit(0);
  }
  let next = 0;
  const worker = async (): Promise<void> => {
    for (;;) {
      const j = pending[next++];
      if (!j) return;
      try {
        appendFileSync(FILE, JSON.stringify(await run(j)) + "\n");
        console.log("finished", j.id);
      } catch (e) {
        console.log(`FAILED ${j.id}: ${String(e).slice(0, 200)}`);
      }
    }
  };
  await Promise.all(Array.from({ length: PARALLEL }, worker));
  console.log("MORE-OR-DONE: run again to check");
}

/**
 * Phase 89 batch runner, resumable. `npx tsx tools/bench/pax89Batch.ts <batch> [parallel=3]` (prints DONE when every row is in).
 * One run = one child process of pax89.ts; each finished run appends its `RUN` JSON line to docs/explore/data/pax89.jsonl.
 * Ids already in the file are skipped, so a killed runner is simply started again. Batches: base (today, V2 + Strategist),
 * and one per model name (route, service, ticket) with the same shape as base.
 */
import { execFile } from "node:child_process";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { promisify } from "node:util";

const run = promisify(execFile);
const FILE = "docs/explore/data/pax89.jsonl";
const batch = process.argv[2] ?? "base";
const PARALLEL = Number(process.argv[3] ?? 3);

interface Job {
  id: string;
  args: string[];
  env?: Record<string, string>;
}
/** Phase 90 configurations: route demand (model "route") with a pair share and freight levers. */
const P90: Record<string, Record<string, string>> = {
  r50: { PAX_PAIRSHARE: "0.5" },
  // calibration of the pair share (route demand alone): what share gives about half of today's passenger income
  r30: { PAX_PAIRSHARE: "0.3" },
  r35: { PAX_PAIRSHARE: "0.35" },
  r40: { PAX_PAIRSHARE: "0.4" },
  r50o3: { PAX_PAIRSHARE: "0.5", FREIGHT_OUT: "3" },
  r50f15: { PAX_PAIRSHARE: "0.5", FREIGHT_RATE: "1.5" },
  r50o3f15: { PAX_PAIRSHARE: "0.5", FREIGHT_OUT: "3", FREIGHT_RATE: "1.5" },
  r50o2f125: { PAX_PAIRSHARE: "0.5", FREIGHT_OUT: "2", FREIGHT_RATE: "1.25" },
  // the bot weighs several buyers instead of the nearest (bot-side only: no game change)
  // freight levers at the calibrated pair share (0.3 = about half of today's passenger income)
  r30s: { PAX_PAIRSHARE: "0.3", FREIGHT_SINK: "best" },
  r30o3f15: { PAX_PAIRSHARE: "0.3", FREIGHT_OUT: "3", FREIGHT_RATE: "1.5" },
  r30so3f15: { PAX_PAIRSHARE: "0.3", FREIGHT_SINK: "best", FREIGHT_OUT: "3", FREIGHT_RATE: "1.5" },
  r30o3: { PAX_PAIRSHARE: "0.3", FREIGHT_OUT: "3" },
  r30f15: { PAX_PAIRSHARE: "0.3", FREIGHT_RATE: "1.5" },
  r30so2f125: {
    PAX_PAIRSHARE: "0.3",
    FREIGHT_SINK: "best",
    FREIGHT_OUT: "2",
    FREIGHT_RATE: "1.25",
  },
  // Phase 90: the calibrated pair share 0.33 and a bot that ranks freight ahead (payback x 0.35) to see what freight can earn
  r33: { PAX_PAIRSHARE: "0.33" },
  r33b: { PAX_PAIRSHARE: "0.33", FREIGHT_SINK: "best", FREIGHT_BIAS: "0.35" },
  r33bo3: { PAX_PAIRSHARE: "0.33", FREIGHT_SINK: "best", FREIGHT_BIAS: "0.35", FREIGHT_OUT: "3" },
  r33bf15: {
    PAX_PAIRSHARE: "0.33",
    FREIGHT_SINK: "best",
    FREIGHT_BIAS: "0.35",
    FREIGHT_RATE: "1.5",
  },
  r33bo3f15: {
    PAX_PAIRSHARE: "0.33",
    FREIGHT_SINK: "best",
    FREIGHT_BIAS: "0.35",
    FREIGHT_OUT: "3",
    FREIGHT_RATE: "1.5",
  },
  r33bo2f125: {
    PAX_PAIRSHARE: "0.33",
    FREIGHT_SINK: "best",
    FREIGHT_BIAS: "0.35",
    FREIGHT_OUT: "2",
    FREIGHT_RATE: "1.25",
  },
  r33bf2: {
    PAX_PAIRSHARE: "0.33",
    FREIGHT_SINK: "best",
    FREIGHT_BIAS: "0.35",
    FREIGHT_RATE: "2",
  },
  r33bo2f15: {
    PAX_PAIRSHARE: "0.33",
    FREIGHT_SINK: "best",
    FREIGHT_BIAS: "0.35",
    FREIGHT_OUT: "2",
    FREIGHT_RATE: "1.5",
  },
  r50s: { PAX_PAIRSHARE: "0.5", FREIGHT_SINK: "best" },
  r50so3: { PAX_PAIRSHARE: "0.5", FREIGHT_SINK: "best", FREIGHT_OUT: "3" },
  r50sf15: { PAX_PAIRSHARE: "0.5", FREIGHT_SINK: "best", FREIGHT_RATE: "1.5" },
};
function jobs(): Job[] {
  const out: Job[] = [];
  if (batch === "g90" || batch === "g90h") {
    // Phase 90 step 4: the new economy (route demand, freight rates x2, bots weigh freight), 16 years, the goal eras
    const hard = batch === "g90h";
    for (const seed of hard ? [1, 2] : [1, 2, 3])
      for (const start of [1870, 1900, 1840, 1930, 1950])
        out.push({
          id: `strong/route+${batch}/${start}/${seed}`,
          args: [String(start), String(seed), "16", "route", "strong"],
          env: { P90_TAG: batch, DIFF: hard ? "hard" : "normal" },
        });
    return out;
  }
  const share = /^g90p(\d+)$/.exec(batch);
  if (share) {
    // Phase 90 calibration at the 16-year horizon: g90p45 = pair share 0.45 (the same eras, seeds 1-2, Normal)
    for (const seed of [1, 2])
      for (const start of [1870, 1900, 1840])
        out.push({
          id: `strong/route+${batch}/${start}/${seed}`,
          args: [String(start), String(seed), "16", "route", "strong"],
          env: { P90_TAG: batch, PAX_PAIRSHARE: String(Number(share[1]) / 100) },
        });
    return out;
  }
  if (batch === "s90") {
    // the Strategist on the new economy, 10 years (a 16-year run does not fit a container's life)
    for (const start of [1870, 1900, 1840])
      out.push({
        id: `strategist/route+s90/${start}/1`,
        args: [String(start), "1", "10", "route", "strategist"],
        env: { P90_TAG: "s90" },
      });
    return out;
  }
  if (batch === "t10") {
    // today's model at the same 10-year horizon as the Phase 90 runs
    for (const seed of [1, 2])
      for (const start of [1870, 1900, 1840])
        out.push({
          id: `strong/today+t10/${start}/${seed}`,
          args: [String(start), String(seed), "10", "today", "strong"],
          env: { P90_TAG: "t10" },
        });
    return out;
  }
  if (P90[batch]) {
    // Phase 90: short runs (10 game years), decisive eras first, one seed first, so a run fits in one container life.
    for (const seed of [1, 2])
      for (const start of [1870, 1900, 1840])
        out.push({
          id: `strong/route+${batch}/${start}/${seed}`,
          args: [String(start), String(seed), "10", "route", "strong"],
          env: { ...P90[batch], P90_TAG: batch },
        });
    return out;
  }
  const model = batch === "base" ? "today" : batch;
  for (const seed of model === "today" ? [1, 2, 3] : [1, 2])
    for (const start of [1870, 1900, 1840])
      out.push({
        id: `strong/${model}/${start}/${seed}`,
        args: [String(start), String(seed), "16", model, "strong"],
      });
  for (const start of [1870, 1900, 1840])
    out.push({
      id: `strategist/${model}/${start}/1`,
      args: [String(start), "1", "10", model, "strategist"],
    });
  return out;
}

const done = new Set<string>();
if (existsSync(FILE))
  for (const line of readFileSync(FILE, "utf8").split("\n"))
    if (line.trim()) done.add((JSON.parse(line) as { id: string }).id);
const todo = jobs().filter((j) => !done.has(j.id));
console.log(`batch ${batch}: ${todo.length} to run, ${done.size} rows in file`);
let next = 0;
async function worker(): Promise<void> {
  for (;;) {
    const j = todo[next++];
    if (!j) return;
    try {
      const { stdout } = await run("npx", ["tsx", "tools/bench/pax89.ts", ...j.args], {
        env: { ...process.env, ...(j.env ?? {}) },
        maxBuffer: 64 * 1024 * 1024,
        timeout: 3 * 3600 * 1000,
      });
      const line = stdout.split("\n").find((l) => l.startsWith("RUN "));
      if (line) {
        appendFileSync(FILE, line.slice(4) + "\n");
        console.log("done " + j.id);
        try {
          await run("git", ["add", FILE]);
          await run("git", ["commit", "-q", "-m", `Phase 90: bench row ${j.id}`]);
          await run("git", ["push", "-q", "origin", "HEAD"]);
        } catch (e) {
          console.log("push failed " + String(e).slice(0, 120));
        }
      } else console.log("no RUN line " + j.id);
    } catch (e) {
      console.log("FAILED " + j.id + " " + String(e).slice(0, 200));
    }
  }
}
await Promise.all(Array.from({ length: PARALLEL }, worker));
console.log("DONE");

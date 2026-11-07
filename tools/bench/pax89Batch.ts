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
}
function jobs(): Job[] {
  const out: Job[] = [];
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
        maxBuffer: 64 * 1024 * 1024,
        timeout: 3 * 3600 * 1000,
      });
      const line = stdout.split("\n").find((l) => l.startsWith("RUN "));
      if (line) {
        appendFileSync(FILE, line.slice(4) + "\n");
        console.log("done " + j.id);
      } else console.log("no RUN line " + j.id);
    } catch (e) {
      console.log("FAILED " + j.id + " " + String(e).slice(0, 200));
    }
  }
}
await Promise.all(Array.from({ length: PARALLEL }, worker));
console.log("DONE");

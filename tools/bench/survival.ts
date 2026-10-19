/**
 * Survival table (Phase 39): runs each bot over seeds, start years and difficulties in child processes and prints
 * bankruptcies. `npx tsx tools/bench/survival.ts [seeds=3]` (bots: good, strong, overbuilder, trainSpammer, leveraged) or SEEDS=10 (Phase 56B: the good bot's final net worth is
 * printed as median and min-max, because a single seed or three swing by +-20 %). Env BOTS=, STARTS=, DIFFS= pick cells. goodPlayer is read from its text output.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** Seeds run at once (env JOBS, default 1). */
const jobs = Number(process.env["JOBS"] ?? 1);
const seeds = Number(process.env["SEEDS"] ?? process.argv[2] ?? 3);
const bots = (process.env["BOTS"] ?? "good,overbuilder,trainSpammer,leveraged").split(",");
const difficulties = (process.env["DIFFS"] ?? "easy,normal,hard").split(",");
const starts = (process.env["STARTS"] ?? "1840,1900,1930,1950").split(",").map(Number);

interface Result {
  bankrupt: boolean;
  minCashM: number;
  netWorthM: number;
}

async function run(bot: string, start: number, diff: string, seed: number): Promise<Result> {
  const text = bot === "good" || bot === "strong"; // these two print text lines; the bad bots print JSON
  const script =
    bot === "good" ? "goodPlayer.ts" : bot === "strong" ? "strongPlayer.ts" : "badPlayers.ts";
  const args = text
    ? ["central-eu", String(start), diff, String(start + 16), String(seed)]
    : [bot, String(start), diff, String(start + 16), String(seed)];
  let out: string;
  try {
    out = (
      await execFileAsync("npx", ["tsx", `tools/bench/${script}`, ...args], {
        encoding: "utf8",
        maxBuffer: 1 << 26,
      })
    ).stdout;
  } catch {
    // the bot could not even afford a first line (Hard, 1900): counts as not started, shown as NaN
    return { bankrupt: false, minCashM: NaN, netWorthM: NaN };
  }
  if (!text) {
    const j = JSON.parse(out.trim().split("\n").pop()!) as {
      bankruptYear: number | null;
      minCashM: number;
      netWorthM: number;
    };
    return { bankrupt: j.bankruptYear !== null, minCashM: j.minCashM, netWorthM: j.netWorthM };
  }
  const m = /MINCASH (-?[\d.]+)/.exec(out);
  const nw = /NW (-?[\d.]+)M/g;
  let last = 0;
  for (let x = nw.exec(out); x; x = nw.exec(out)) last = Number(x[1]);
  return { bankrupt: out.includes("BANKRUPT"), minCashM: m ? Number(m[1]) : NaN, netWorthM: last };
}

const tally = new Map<string, { bankrupt: number; runs: number; minCash: number }>();
console.log(
  "| bot | start | difficulty | bankrupt | min cash $M (per seed) | final NW $M (per seed) | final NW $M median [min-max] |",
);
console.log("|---|---|---|---|---|---|---|");

const median = (xs: number[]): number => {
  const v = xs.filter((x) => !Number.isNaN(x)).sort((a, b) => a - b);
  if (v.length === 0) return NaN;
  const m = v.length >> 1;
  return v.length % 2 ? v[m]! : (v[m - 1]! + v[m]!) / 2;
};
async function runSeeds(bot: string, start: number, diff: string): Promise<Result[]> {
  const rs: Result[] = [];
  for (let i = 0; i < seeds; i += jobs) {
    const batch = Array.from({ length: Math.min(jobs, seeds - i) }, (_, j) =>
      run(bot, start, diff, i + j + 1),
    );
    rs.push(...(await Promise.all(batch)));
  }
  return rs;
}

for (const bot of bots)
  for (const start of starts)
    for (const diff of difficulties) {
      const rs = await runSeeds(bot, start, diff);
      const era = start < 1930 ? "1840-1900" : "1930-1950";
      const t = tally.get(`${bot}|${diff}|${era}`) ?? { bankrupt: 0, runs: 0, minCash: Infinity };
      t.bankrupt += rs.filter((r) => r.bankrupt).length;
      t.runs += rs.length;
      for (const r of rs)
        if (!Number.isNaN(r.minCashM)) t.minCash = Math.min(t.minCash, r.minCashM);
      tally.set(`${bot}|${diff}|${era}`, t);
      console.log(
        `| ${bot} | ${start} | ${diff} | ${rs.filter((r) => r.bankrupt).length}/${seeds} | ${rs.map((r) => r.minCashM).join(" / ")} | ${rs.map((r) => r.netWorthM).join(" / ")} | ${median(rs.map((r) => r.netWorthM)).toFixed(2)} [${Math.min(...rs.map((r) => r.netWorthM)).toFixed(2)}-${Math.max(...rs.map((r) => r.netWorthM)).toFixed(2)}] |`,
      );
    }

// Reference band for the good bot (Phase 57, owner decision): 1900 Normal final net worth $30-45M, judged on the median of 10 seeds (SEEDS=10); Hard at least 40 % below Normal.
// Phase 39 targets, checked separately for the early starts (1840, 1900) and, since Phase 42, the late ones (1930, 1950) (ASSERT=1 exits non-zero when one is missed): the competent bot survives every run on Normal and
// Hard; the bad bots go bankrupt in at least 50 % of Normal runs and 80 % of Hard runs, and mostly survive on Easy.
if (process.env["ASSERT"]) {
  let failed = false;
  const check = (name: string, ok: boolean): void => {
    console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
    if (!ok) failed = true;
  };
  for (const [key, t] of tally) {
    const [bot, diff, era] = key.split("|") as [string, string, string];
    const rate = t.bankrupt / t.runs;
    const label = `${bot} ${diff} ${era}: ${t.bankrupt}/${t.runs} bankrupt`;
    if (bot === "strong")
      check(`${label}, min cash ${t.minCash}M`, diff !== "normal" || t.bankrupt === 0);
    else if (bot === "good")
      check(`${label}, min cash ${t.minCash}M`, diff === "easy" || t.bankrupt === 0);
    else if (diff === "normal") check(label, rate >= 0.5);
    else if (diff === "hard") check(label, rate >= 0.8);
    else check(label, rate <= 0.5);
  }
  process.exit(failed ? 1 : 0);
}

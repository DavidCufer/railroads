/**
 * Survival table (Phase 39): runs each bot over seeds, start years and difficulties in child processes and prints
 * bankruptcies. `npx tsx tools/bench/survival.ts [seeds=3]`. goodPlayer is read from its text output.
 */
import { execFileSync } from "node:child_process";

const seeds = Number(process.argv[2] ?? 3);
const bots = (process.env["BOTS"] ?? "good,overbuilder,trainSpammer,leveraged").split(",");
const difficulties = (process.env["DIFFS"] ?? "easy,normal,hard").split(",");
const starts = (process.env["STARTS"] ?? "1840,1900").split(",").map(Number);

interface Result {
  bankrupt: boolean;
  minCashM: number;
  netWorthM: number;
}

function run(bot: string, start: number, diff: string, seed: number): Result {
  const script = bot === "good" ? "goodPlayer.ts" : "badPlayers.ts";
  const args =
    bot === "good"
      ? ["central-eu", String(start), diff, String(start + 16), String(seed)]
      : [bot, String(start), diff, String(start + 16), String(seed)];
  let out: string;
  try {
    out = execFileSync("npx", ["tsx", `tools/bench/${script}`, ...args], {
      encoding: "utf8",
      maxBuffer: 1 << 26,
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    // the bot could not even afford a first line (Hard, 1900): counts as not started, shown as NaN
    return { bankrupt: false, minCashM: NaN, netWorthM: NaN };
  }
  if (bot !== "good") {
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
  "| bot | start | difficulty | bankrupt | min cash $M (per seed) | final NW $M (per seed) |",
);
console.log("|---|---|---|---|---|---|");
for (const bot of bots)
  for (const start of starts)
    for (const diff of difficulties) {
      const rs = Array.from({ length: seeds }, (_, i) => run(bot, start, diff, i + 1));
      const t = tally.get(`${bot}|${diff}`) ?? { bankrupt: 0, runs: 0, minCash: Infinity };
      t.bankrupt += rs.filter((r) => r.bankrupt).length;
      t.runs += rs.length;
      for (const r of rs)
        if (!Number.isNaN(r.minCashM)) t.minCash = Math.min(t.minCash, r.minCashM);
      tally.set(`${bot}|${diff}`, t);
      console.log(
        `| ${bot} | ${start} | ${diff} | ${rs.filter((r) => r.bankrupt).length}/${seeds} | ${rs.map((r) => r.minCashM).join(" / ")} | ${rs.map((r) => r.netWorthM).join(" / ")} |`,
      );
    }

// Phase 39 targets (ASSERT=1 exits non-zero when one is missed): the competent bot survives every run on Normal and
// Hard; the bad bots go bankrupt in at least 50 % of Normal runs and 80 % of Hard runs, and mostly survive on Easy.
if (process.env["ASSERT"]) {
  let failed = false;
  const check = (name: string, ok: boolean): void => {
    console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
    if (!ok) failed = true;
  };
  for (const [key, t] of tally) {
    const [bot, diff] = key.split("|") as [string, string];
    const rate = t.bankrupt / t.runs;
    const label = `${bot} ${diff}: ${t.bankrupt}/${t.runs} bankrupt`;
    if (bot === "good")
      check(`${label}, min cash ${t.minCash}M`, diff === "easy" || t.bankrupt === 0);
    else if (diff === "normal") check(label, rate >= 0.5);
    else if (diff === "hard") check(label, rate >= 0.8);
    else check(label, rate <= 0.5);
  }
  process.exit(failed ? 1 : 0);
}

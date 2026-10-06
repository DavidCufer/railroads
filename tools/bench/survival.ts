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
  const out = execFileSync("npx", ["tsx", `tools/bench/${script}`, ...args], {
    encoding: "utf8",
    maxBuffer: 1 << 26,
  });
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

console.log(
  "| bot | start | difficulty | bankrupt | min cash $M (per seed) | final NW $M (per seed) |",
);
console.log("|---|---|---|---|---|---|");
for (const bot of bots)
  for (const start of starts)
    for (const diff of difficulties) {
      const rs = Array.from({ length: seeds }, (_, i) => run(bot, start, diff, i + 1));
      console.log(
        `| ${bot} | ${start} | ${diff} | ${rs.filter((r) => r.bankrupt).length}/${seeds} | ${rs.map((r) => r.minCashM).join(" / ")} | ${rs.map((r) => r.netWorthM).join(" / ")} |`,
      );
    }

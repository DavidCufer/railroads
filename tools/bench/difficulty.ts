/**
 * Phase 83: the map difficulty report.
 *   npx tsx tools/bench/difficulty.ts <region | scenarioId | random:SEED> [startYear] [easy|normal|hard] [options]
 * Options: --quick (1 seed, 8 years, short lookahead: minutes), --seeds N (default 3), --years N (default 16),
 *          --jobs N (parallel processes, default 4), --size small|medium|large (random maps), --out FILE (append the markdown).
 * It plays the Strategist ("strong"), a cautious and a sloppy variant (settings of the same bot) and prints the markdown report:
 * profit at years 5 / 10 / 16, bankruptcy rate, time to first profit, payback of the first line, the strong - sloppy gap, the
 * rating (easy / fair / hard / brutal) and the reasons. A scenario reports the Strategist's stars and margin.
 */
import { execFile } from "node:child_process";
import { appendFileSync } from "node:fs";
import { promisify } from "node:util";
import { scenarioById } from "../../src/data/scenarios";
import {
  playCompany,
  surveyMap,
  type Run,
  type Spec,
  type Survey,
  type Variant,
} from "./difficulty/play";
import {
  median,
  profitAt,
  rate,
  rateScenario,
  reasons,
  summarize,
  type Metrics,
} from "./difficulty/rating";

const exec = promisify(execFile);
const argv = process.argv.slice(2);
const VALUE_FLAGS = ["--seeds", "--years", "--jobs", "--size", "--out"];
const flag = (n: string): boolean => argv.includes(n);
const opt = (n: string, d: string): string => {
  const i = argv.indexOf(n);
  return i >= 0 ? (argv[i + 1] ?? d) : d;
};

if (argv[0] === "--worker") {
  // child process: one play, one JSON line
  const job = JSON.parse(argv[1]!) as {
    spec: Spec;
    variant: Variant;
    seed: number;
    years: number;
    quick: boolean;
  };
  const run = playCompany(job.spec, job.variant, {
    seed: job.seed,
    years: job.years,
    quick: job.quick,
  });
  console.log("RESULT " + JSON.stringify(run));
  process.exit(0);
}

const positional = argv.filter(
  (a, i) => !a.startsWith("--") && !(i > 0 && VALUE_FLAGS.includes(argv[i - 1]!)),
);
const target = positional[0] ?? "central-eu";
const quick = flag("--quick");
const seeds = Number(opt("--seeds", quick ? "1" : "3"));
const years = Number(opt("--years", quick ? "8" : "16"));
const jobsN = Number(opt("--jobs", "4"));

export function specFromArgs(t: string, start: number, diff: string, size?: string): Spec {
  const sc = scenarioById(t);
  if (sc) return { kind: "scenario", id: t, startYear: sc.startYear, difficulty: sc.difficulty };
  const difficulty = diff as Spec["difficulty"];
  if (t.startsWith("random"))
    return { kind: "random", id: t, startYear: start, difficulty, mapSize: size };
  return { kind: "region", id: t, startYear: start, difficulty };
}

const spec = specFromArgs(
  target,
  Number(positional[1] ?? 1870),
  positional[2] ?? "normal",
  opt("--size", "medium"),
);
const seedBase = target.startsWith("random:") ? Number(target.slice(7)) : 1;

interface Job {
  variant: Variant;
  seed: number;
}
const jobs: Job[] = [];
if (spec.kind === "scenario") jobs.push({ variant: "strong", seed: 1 });
else
  for (let s = 0; s < seeds; s++)
    for (const variant of ["strong", "cautious", "sloppy"] as Variant[])
      jobs.push({ variant, seed: seedBase + s });

const results: Run[] = [];
async function worker(): Promise<void> {
  for (;;) {
    const j = jobs.shift();
    if (!j) return;
    const payload = JSON.stringify({ spec, variant: j.variant, seed: j.seed, years, quick });
    const { stdout } = await exec(
      "npx",
      ["tsx", "tools/bench/difficulty.ts", "--worker", payload],
      { encoding: "utf8", maxBuffer: 1 << 26, timeout: 6 * 3600_000 },
    );
    const line = stdout.split("\n").find((l) => l.startsWith("RESULT "));
    if (!line) throw new Error(`worker gave no result for ${j.variant} seed ${j.seed}`);
    results.push(JSON.parse(line.slice(7)) as Run);
    process.stderr.write(`done ${j.variant} seed ${j.seed}\n`);
  }
}
const t0 = Date.now();
const survey: Survey = surveyMap(spec, seedBase);
await Promise.all(Array.from({ length: Math.min(jobsN, jobs.length) }, worker));

const M = (x: number | null | undefined, d = 2): string =>
  x === null || x === undefined || !Number.isFinite(x) ? "-" : (x / 1e6).toFixed(d);
const out: string[] = [];
const title =
  spec.kind === "scenario"
    ? `scenario ${spec.id}`
    : `${spec.id} ${spec.startYear} ${spec.difficulty}`;
out.push(`## ${title}${quick ? " (quick)" : ""}`, "");
if (spec.kind === "scenario") {
  const r = results[0]!;
  const def = scenarioById(spec.id)!;
  const sc = r.scenario!;
  const span =
    def.goal.type === "survive"
      ? def.goal.untilYear + 1 - def.startYear
      : def.goal.byYear + 1 - def.startYear;
  const spare = sc.monthsEarly === null ? null : sc.monthsEarly / (span * 12);
  const solverStars: Record<string, number> = {
    semmering: 2,
    transcontinental: 2,
    coalTrieste: 2,
    panic1873: 3,
    silverRush: 3,
  };
  const rating = rateScenario({
    status: sc.status,
    stars: sc.stars,
    maxStars: solverStars[spec.id] ?? 3,
    spare,
    profitOverBar: sc.profitOverBar,
  });
  const margin =
    sc.monthsEarly === null
      ? `profit ${sc.profitOverBar.toFixed(2)}x the top star's bar`
      : `${sc.monthsEarly} of ${span * 12} months to spare`;
  out.push(
    "| scenario | Strategist result | stars (solver) | margin | profit last year $M | rating |",
    "|---|---|---|---|---|---|",
    `| ${spec.id} | ${sc.status} | ${sc.stars} (${solverStars[spec.id] ?? "?"}) | ${margin} | ${M(r.profit.at(-1))} | **${rating}** |`,
    "",
    `Why: ${
      sc.status !== "won"
        ? "the Strategist did not reach the goal in time"
        : spare !== null
          ? `goal reached with ${Math.round(spare * 100)} % of the time left`
          : `survived with a profit of ${sc.profitOverBar.toFixed(2)}x the top star's bar`
    }; ${sc.stars < (solverStars[spec.id] ?? 3) ? "fewer stars than the solver" : "stars match the solver"}. Run time ${r.seconds} s.`,
  );
} else {
  const m: Metrics = summarize(results);
  const res = rate(m);
  const strong = results.filter((r) => r.variant === "strong");
  const of = (v: Variant): Run[] => results.filter((r) => r.variant === v);
  const row = (v: Variant): string => {
    const rs = of(v);
    const at = (y: number): string =>
      M(median(rs.map((r) => profitAt(r, y)).filter(Number.isFinite)));
    const br = rs.filter((r) => r.bankruptYear !== null).length;
    const fp = median(rs.map((r) => r.firstProfitMonth).filter((x): x is number => x !== null));
    const pb = median(rs.map((r) => r.paybackYears).filter((x): x is number => x !== null));
    return `| ${v} | ${rs.length} | ${at(5)} | ${at(10)} | ${at(16)} | ${br} of ${rs.length} | ${fp ?? "-"} | ${pb?.toFixed(1) ?? "-"} |`;
  };
  out.push(
    `Seeds ${seeds}, ${years} years, start cash $${M(median(strong.map((r) => r.startCash)))}M, credit $${M(median(strong.map((r) => r.startCredit)))}M. Operating profit in $M (median of seeds; \`-\` = not reached in this run length).`,
    "",
    "| player | runs | profit y5 | y10 | y16 | bankrupt | first profit (month) | first line paid back (years) |",
    "|---|---|---|---|---|---|---|---|",
    row("strong"),
    row("cautious"),
    row("sloppy"),
    "",
    `Strong - sloppy gap: sloppy play loses ${Math.round(m.skillGap * 100)} % of the strong player's profit. Map survey: ${survey.good} projects pay back within 9 years, best payback ${survey.bestPayback?.toFixed(1) ?? "-"} years, best pairs ${Math.round(survey.medianPairTiles ?? 0)} tiles apart. Downturns in range: ${strong[0]?.panics.map((p) => `${p.name} at year ${p.atYear.toFixed(1)} (-${Math.round(p.depth * 100)} %)`).join("; ") || "none"}.`,
    "",
    `**Rating: ${res.rating.toUpperCase()}** (trouble score ${res.score.toFixed(1)}; ${res.parts.map((p) => `${p.name} ${p.points.toFixed(1)}/${p.max}`).join(", ")})${quick ? " - coarse: one seed, short run" : ""}`,
    "",
    "Why:",
    ...reasons(m, results, survey)
      .slice(0, 4)
      .map((x) => `- ${x}`),
  );
}
out.push("", `_Run time ${Math.round((Date.now() - t0) / 1000)} s._`, "");
const text = out.join("\n");
console.log(text);
const file = opt("--out", "");
if (file) appendFileSync(file, text + "\n");

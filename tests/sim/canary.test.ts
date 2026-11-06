/**
 * Phase 84 canary: a balance change that moves an era far must fail a test that SAYS which era moved and what moved
 * (the Phase 79/80 problems: 1870 too rich, Hard not harder).
 *
 * How it plays: Phase 83's "cautious" V2 (tools/bench/canary.ts) on a fixed small random map (seed 3), 2 years, six
 * starts run in parallel child processes (wall time about 40 s). The quick Strategist is too slow for a test: 70 s for
 * 2 years of one era (V2 without lookahead: 10-40 s). Deterministic: the same code gives the same numbers every time.
 *
 * Recorded 2026-11-04 on main 11e9996 (net worth and the two-year operating-profit sum, $; start cash in brackets):
 *   1840 normal  NW   583,360  profit    -9,281  ($1.0M)      1840 is slow: first profit in month 12
 *   1870 normal  NW   707,788  profit  +136,693  ($1.0M)
 *   1900 normal  NW   728,680  profit  +137,853  ($1.0M)
 *   1930 normal  NW 1,034,770  profit  -159,636  ($1.5M)      the banking crisis of 1931 hits
 *   1870 hard    NW   361,284  profit   +26,242  ($0.6M)      re-recorded 2026-11-06 (Phase 87, revenueMult 0.8)
 *   1930 hard    NW   371,029  profit  -166,381  ($0.9M)  bankrupt 1931   (was 424,947 / +75,209 and 371,692 / -165,844)
 * Bands are wide on purpose: net worth within 0.6x..1.6x of the record, profit within 0.15 x start cash of the record,
 * bankruptcy year must match. A band is never to be widened to make a test pass: a failure means an era moved, and the
 * owner decides whether that is wanted (then re-record here, with the date).
 *
 * Phase 87: Hard is harder than Normal (it pays 20 % less, `DIFFICULTY.hard.revenueMult` 0.8). The test below asserts, for
 * 1870 and 1930, that the Hard company ends the two years with less net worth than the Normal one, and with less net
 * worth per dollar of start cash.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import type { CanaryResult } from "../../tools/bench/canary";

const run = promisify(execFile);

interface Row {
  start: number;
  difficulty: "normal" | "hard";
  era: string;
  netWorth: number;
  profit: number;
  bankruptYear: number | null;
}

const RECORD: Row[] = [
  {
    start: 1840,
    difficulty: "normal",
    era: "1840 Normal (slow early railways)",
    netWorth: 583_360,
    profit: -9_281,
    bankruptYear: null,
  },
  {
    start: 1870,
    difficulty: "normal",
    era: "1870 Normal (boom years)",
    netWorth: 707_788,
    profit: 136_693,
    bankruptYear: null,
  },
  {
    start: 1900,
    difficulty: "normal",
    era: "1900 Normal",
    netWorth: 728_680,
    profit: 137_853,
    bankruptYear: null,
  },
  {
    start: 1930,
    difficulty: "normal",
    era: "1930 Normal (banking crisis)",
    netWorth: 1_034_770,
    profit: -159_636,
    bankruptYear: null,
  },
  {
    start: 1870,
    difficulty: "hard",
    era: "1870 Hard",
    netWorth: 361_284,
    profit: 26_242,
    bankruptYear: null,
  },
  {
    start: 1930,
    difficulty: "hard",
    era: "1930 Hard (crisis)",
    netWorth: 371_029,
    profit: -166_381,
    bankruptYear: 1931,
  },
];

const NW_BAND: [number, number] = [0.6, 1.6];
const PROFIT_BAND = 0.15; // x start cash

const money = (n: number): string => "$" + Math.round(n).toLocaleString("en-US");

async function play(row: Row): Promise<CanaryResult> {
  const { stdout } = await run(
    "npx",
    ["tsx", "tools/bench/canary.ts", String(row.start), row.difficulty],
    {
      cwd: process.cwd(),
      maxBuffer: 1 << 24,
    },
  );
  const line = stdout.split("\n").find((l) => l.startsWith("CANARY "));
  if (!line) throw new Error(`canary ${row.era}: no result line`);
  return JSON.parse(line.slice(7)) as CanaryResult;
}

describe("balance canary (Phase 84)", () => {
  it("every era stays inside its band", { timeout: 180_000 }, async () => {
    const results = await Promise.all(RECORD.map(play));
    const problems: string[] = [];
    RECORD.forEach((rec, i) => {
      const got = results[i]!;
      if (got.bankruptYear !== rec.bankruptYear)
        problems.push(
          `${rec.era}: bankruptcy moved (recorded ${rec.bankruptYear ?? "none"}, now ${got.bankruptYear ?? "none"})`,
        );
      const lo = rec.netWorth * NW_BAND[0];
      const hi = rec.netWorth * NW_BAND[1];
      if (got.netWorth < lo || got.netWorth > hi)
        problems.push(
          `${rec.era}: net worth after 2 years moved to ${money(got.netWorth)} (recorded ${money(rec.netWorth)}, band ${money(lo)}..${money(hi)}): the era got ${got.netWorth > hi ? "richer" : "poorer"}`,
        );
      const tol = PROFIT_BAND * got.startCash;
      if (Math.abs(got.profit - rec.profit) > tol)
        problems.push(
          `${rec.era}: two-year operating profit moved to ${money(got.profit)} (recorded ${money(rec.profit)}, +-${money(tol)})`,
        );
    });
    expect(
      problems,
      "an era moved far, a balance change did this:\n" + problems.join("\n"),
    ).toEqual([]);
  });

  it(
    "Hard is harder than Normal (Phase 87): less net worth, also per dollar of start cash",
    { timeout: 180_000 },
    async () => {
      const hardRows = RECORD.filter((r) => r.difficulty === "hard");
      const results = await Promise.all(
        hardRows
          .flatMap((h) => [
            h,
            RECORD.find((r) => r.difficulty === "normal" && r.start === h.start)!,
          ])
          .map(play),
      );
      const problems: string[] = [];
      hardRows.forEach((h, i) => {
        const hard = results[2 * i]!;
        const normal = results[2 * i + 1]!;
        if (hard.netWorth >= normal.netWorth)
          problems.push(
            `${h.start}: Hard ends with ${money(hard.netWorth)}, not less than Normal's ${money(normal.netWorth)}`,
          );
        if (hard.netWorth / hard.startCash >= normal.netWorth / normal.startCash)
          problems.push(`${h.start}: Hard is not poorer than Normal per dollar of start cash`);
      });
      expect(problems, "Hard is not harder than Normal:\n" + problems.join("\n")).toEqual([]);
    },
  );
});

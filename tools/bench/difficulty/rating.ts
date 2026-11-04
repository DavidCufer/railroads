/**
 * Phase 83: the difficulty rating. Pure functions on plain numbers (no sim, no clock), so they are unit-tested.
 * The score is "points of trouble": every part grows (never shrinks) when the map gets worse in that respect, and the rating
 * is a band of the total. Bands and the calibration table: docs/bench/difficulty-calibration.md.
 */
import type { Panic1, Run, Survey } from "./play";

export type Rating = "easy" | "fair" | "hard" | "brutal";

/** Upper edges of the bands (score below the edge = that rating); at or above the last edge = brutal. */
export const BANDS: ReadonlyArray<readonly [Rating, number]> = [
  ["easy", 2.5],
  ["fair", 4.5],
  ["hard", 6.5],
];

export interface Metrics {
  /** Best player's median completed-year operating profit (reference year, 5 when reached) / starting cash. */
  profitRatio5: number | null;
  strongBankrupt: number;
  cautiousBankrupt: number;
  sloppyBankrupt: number;
  /** Months to the first operating profit (median; null = never), and years to pay back the first line (null = never). */
  firstProfitMonth: number | null;
  paybackYears: number | null;
  /** 1 - sloppy / best operating profit at the reference year (0 = skill does not matter). */
  skillGap: number;
  /** Depth (0-1) of the deepest downturn that falls inside the horizon (0 = none). */
  panicDepth: number;
}

export interface Part {
  name: string;
  points: number;
  max: number;
}

/** Linear between two points, flat outside them; `from` -> 0 points, `to` -> `max` (either direction). */
export function ramp(x: number, from: number, to: number, max: number): number {
  const t = (x - from) / (to - from);
  return max * Math.min(1, Math.max(0, t));
}

export function parts(m: Metrics): Part[] {
  const profit = m.profitRatio5 === null ? 3 : ramp(m.profitRatio5, 1.0, 0, 3);
  const failure = 4 * m.strongBankrupt + 2 * m.cautiousBankrupt + 2.5 * m.sloppyBankrupt;
  const slow = (ramp(m.firstProfitMonth ?? 48, 6, 36, 2) + ramp(m.paybackYears ?? 10, 2, 8, 2)) / 2;
  return [
    { name: "profit", points: profit, max: 3 },
    { name: "failure", points: failure, max: 6.5 },
    { name: "slow start", points: slow, max: 2 },
    { name: "skill gap", points: ramp(m.skillGap, 0.1, 0.6, 1.5), max: 1.5 },
    { name: "crisis", points: ramp(m.panicDepth, 0, 0.3, 1.5), max: 1.5 },
  ];
}

export function score(m: Metrics): number {
  return parts(m).reduce((a, p) => a + p.points, 0);
}

export function band(s: number): Rating {
  for (const [name, edge] of BANDS) if (s < edge) return name;
  return "brutal";
}

export function rate(m: Metrics): { score: number; rating: Rating; parts: Part[] } {
  return { score: score(m), rating: band(score(m)), parts: parts(m) };
}

const median = (xs: number[]): number | null => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2]! : (s[s.length / 2 - 1]! + s[s.length / 2]!) / 2;
};
export { median };

/** Operating profit of a run in `year` (1 = first year played); a company that went bankrupt earlier earned nothing. */
export function profitAt(r: Run, year: number): number {
  return r.profit[year - 1] ?? (r.bankruptYear !== null ? 0 : NaN);
}

/** The year the report compares: 5 when every run reached it, else the longest year all runs reached. */
export function referenceYear(runs: readonly Run[]): number {
  const reach = Math.min(...runs.map((r) => (r.bankruptYear !== null ? 99 : r.profit.length)));
  return Math.max(1, Math.min(5, reach === 99 ? 5 : reach));
}

export function summarize(runs: readonly Run[], refYear = referenceYear(runs)): Metrics {
  const of = (v: Run["variant"]): Run[] => runs.filter((r) => r.variant === v);
  const strong = of("strong");
  const rate = (rs: Run[]): number =>
    rs.length ? rs.filter((r) => r.bankruptYear !== null).length / rs.length : 0;
  const med = (rs: Run[]): number | null =>
    median(rs.map((r) => profitAt(r, refYear)).filter(Number.isFinite));
  // "what a good player earns" is the best median of the three players: the lookahead player is the best in a full run, but in
  // a `--quick` run its lookahead is so short that a plain policy can beat it, and the rating must not depend on that
  const meds = [med(strong), med(of("cautious")), med(of("sloppy"))].filter(
    (x): x is number => x !== null,
  );
  const s = meds.length ? Math.max(...meds) : null;
  const l = med(of("sloppy"));
  const startCash = median(runs.map((r) => r.startCash)) ?? 1;
  const ratio = s === null ? null : s / startCash;
  const gap =
    s !== null && l !== null && s > 0
      ? Math.min(1, Math.max(0, 1 - Math.max(0, l) / s))
      : s !== null && s <= 0
        ? 0
        : 0;
  const depth = Math.max(0, ...strong.flatMap((r) => r.panics.map((p: Panic1) => p.depth)));
  return {
    profitRatio5: ratio,
    strongBankrupt: rate(strong),
    cautiousBankrupt: rate(of("cautious")),
    sloppyBankrupt: rate(of("sloppy")),
    firstProfitMonth: median(
      strong.map((r) => r.firstProfitMonth).filter((x): x is number => x !== null),
    ),
    paybackYears: median(strong.map((r) => r.paybackYears).filter((x): x is number => x !== null)),
    skillGap: gap,
    panicDepth: depth,
  };
}

/** Plain-words reasons, strongest first. */
export function reasons(m: Metrics, runs: readonly Run[], survey: Survey | null): string[] {
  const out: Array<[number, string]> = [];
  const strong = runs.filter((r) => r.variant === "strong");
  const p = parts(m);
  const pts = (n: string): number => p.find((x) => x.name === n)?.points ?? 0;
  if (m.strongBankrupt > 0)
    out.push([
      10,
      `even the lookahead player goes bankrupt (${Math.round(m.strongBankrupt * 100)} % of runs)`,
    ]);
  if (m.sloppyBankrupt > 0 || m.cautiousBankrupt > 0)
    out.push([
      pts("failure"),
      `ordinary play goes bankrupt (sloppy ${Math.round(m.sloppyBankrupt * 100)} %, cautious ${Math.round(m.cautiousBankrupt * 100)} % of runs)`,
    ]);
  const idle = median(strong.map((r) => r.idleShare)) ?? 0;
  const first =
    median(strong.map((r) => (r.firstLineCapital ?? 0) / (r.startCash + r.startCredit))) ?? 0;
  if (first > 0.6 && idle < 0.05)
    out.push([
      3,
      "capital-limited: the first line eats most of the money and cash never sits idle",
    ]);
  const first1 = strong.find((r) => r.panics.length)?.panics.sort((a, b) => b.depth - a.depth)[0];
  if (first1 && first1.depth >= 0.08)
    out.push([
      pts("crisis") + 0.5,
      `crisis at year ${Math.floor(first1.atYear) + 1}: ${first1.name}, demand falls ${Math.round(first1.depth * 100)} %`,
    ]);
  if (pts("profit") >= 1.5)
    out.push([
      pts("profit"),
      `weak profit: about ${(m.profitRatio5 ?? 0).toFixed(2)}x the starting cash a year in year 5`,
    ]);
  if (pts("slow start") >= 1)
    out.push([
      pts("slow start"),
      `slow start: first profit after ${m.firstProfitMonth ?? "never"} months, first line paid back in ${m.paybackYears?.toFixed(1) ?? "never"} years`,
    ]);
  if (m.skillGap >= 0.35)
    out.push([
      pts("skill gap"),
      `skill matters: sloppy play earns ${Math.round((1 - m.skillGap) * 100)} % of the strong player's profit`,
    ]);
  if (survey) {
    if (survey.good <= 3)
      out.push([2, `few good town pairs: only ${survey.good} projects pay back inside 9 years`]);
    if ((survey.medianPairTiles ?? 0) > 45)
      out.push([
        1.5,
        `long distances: the best town pairs are ${Math.round(survey.medianPairTiles ?? 0)} tiles apart`,
      ]);
  }
  if (out.length === 0)
    out.push([0, "nothing in the way: money comes quickly and mistakes are forgiven"]);
  return out.sort((a, b) => b[0] - a[0]).map((x) => x[1]);
}

/** Scenario rating: the Strategist's margin. `maxStars` is what the solver reaches (the target). */
export function rateScenario(r: {
  status: string;
  stars: number;
  maxStars: number;
  /** Share of the allowed time left when the goal was reached (0-1); null for a survival goal. */
  spare: number | null;
  /** Survival goal: last-year profit over the top star's bar. */
  profitOverBar: number;
}): Rating {
  if (r.status !== "won") return "brutal";
  let rank = 0; // 0 easy .. 2 hard
  if (r.spare !== null) rank = r.spare >= 0.6 ? 0 : r.spare >= 0.25 ? 1 : 2;
  else rank = r.profitOverBar >= 1.5 ? 0 : r.profitOverBar >= 1 ? 1 : 2;
  if (r.stars < r.maxStars) rank = Math.min(2, rank + 1);
  return (["easy", "fair", "hard"] as const)[rank]!;
}

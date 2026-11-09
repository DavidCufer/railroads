/** Phase 91: tables from docs/explore/data/yardstick.jsonl (see yardstick.ts), plus the plain calculation of how many more
 * travellers the hub line H would have if people could change trains once at the hub.
 *   npx tsx tools/bench/yardstickSummary.ts [detail]   -> markdown on stdout ("detail": every train count, not just the summary) */
import { readFileSync } from "node:fs";
import { PARTY_SIZE, ROUTE_DEMAND, tripsPerHeadPerMonth } from "../../src/data/economy";
import { routeDemandPerMonth } from "../../src/sim/stations/passengerFlows";
import { octileTileDistance } from "../../src/sim/trains/geometry";
import { layoutOf, OUT, type Row } from "./yardstick";

const rows: Row[] = readFileSync(OUT, "utf8")
  .split("\n")
  .filter((l) => l.trim())
  .map((l) => JSON.parse(l) as Row);

interface Avg {
  n: number;
  config: string;
  demand: number;
  carried: number;
  lost: number;
  carriedPct: number;
  fullMonthsPct: number;
  fullDaysPct: number;
  net: number;
  price: number;
  payback: number;
  total: number;
}
const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);

/** Seed-averaged rows of one line, year, exponent, by configuration and train count. */
function table(line: string, year: number, exp: number): Avg[] {
  const groups = new Map<string, Row[]>();
  for (const r of rows)
    if (r.line === line && r.year === year && r.exp === exp) {
      const k = `${r.config}|${r.n}`;
      groups.set(k, [...(groups.get(k) ?? []), r]);
    }
  const out: Avg[] = [];
  for (const g of groups.values()) {
    const first = g[0] as Row;
    const net = mean(g.map((r) => r.netPerTrain));
    const price = mean(g.map((r) => r.trainPrice));
    out.push({
      n: first.n,
      config: first.config,
      demand: mean(g.map((r) => r.demand)),
      carried: mean(g.map((r) => r.carried)),
      lost: mean(g.map((r) => r.lost)),
      carriedPct: mean(g.map((r) => (100 * r.carried) / Math.max(1, r.demand))),
      fullMonthsPct: mean(g.map((r) => r.fullMonthsPct)),
      fullDaysPct: mean(g.map((r) => r.fullDaysPct)),
      net,
      price,
      payback: net > 0 ? price / net : Infinity,
      total: net * first.n,
    });
  }
  return out.sort((a, b) => a.config.localeCompare(b.config) || a.n - b.n);
}

const k = (x: number): string => `${Math.round(x / 1000)}k`;
const pct = (x: number): string => `${Math.round(x)}%`;
const yrs = (x: number): string =>
  Number.isFinite(x) ? (x < 10 ? x.toFixed(1) : `${Math.round(x)}`) : "never";

/** The first train count (of one configuration) whose people carried reach 90% of the line's demand. */
function firstNinety(t: Avg[], config: string): Avg | undefined {
  return t.filter((a) => a.config === config).find((a) => a.carriedPct >= 90);
}

/** T only: for each train count, the mix (locals only, 1 express, 2 expresses) with the most money in total. */
function bestMix(t: Avg[]): Avg[] {
  const best = new Map<number, Avg>();
  for (const a of t) {
    const b = best.get(a.n);
    if (!b || a.total > b.total) best.set(a.n, a);
  }
  return [...best.values()].sort((a, b) => a.n - b.n);
}

const YEARS = [1842, 1870, 1900];
const LINES: Array<[string, string]> = [
  ["P20", "P20: two large towns, 20 tiles apart"],
  ["P60", "P60: the same two towns, 60 tiles apart"],
  ["T", "T: the five-town line (two cities, three small towns, about 70 tiles)"],
  ["H", "H: a hub city with three branches of two towns each"],
  ["B", "B: a thin branch of two small towns off a big city"],
];

function detail(line: string, year: number, exp: number): string {
  const t = table(line, year, exp);
  const lines = [
    `#### ${line} ${year} (distance exponent ${exp})`,
    "",
    "| trains | mix | carried | turned away (people/yr) | platform full | net per train | pays back in |",
    "|---|---|---|---|---|---|---|",
  ];
  for (const a of t)
    lines.push(
      `| ${a.n} | ${a.config} | ${pct(a.carriedPct)} | ${Math.round(a.lost)} | ${pct(a.fullMonthsPct)} | $${k(a.net)} | ${yrs(a.payback)} y |`,
    );
  return lines.join("\n");
}

/** One row per era: where the line first carries 90%, and what it looks like there and with one train. */
function summaryRow(line: string, year: number, exp: number): string {
  const t = table(line, year, exp);
  const configs = [...new Set(t.map((a) => a.config))];
  const cells: string[] = [];
  for (const c of configs) {
    const hit = firstNinety(t, c);
    const one = t.find((a) => a.config === c);
    const last = t.filter((a) => a.config === c).at(-1) as Avg;
    const at = hit ?? last;
    cells.push(
      `| ${year} | ${c === "locals" ? (line === "T" ? "locals only" : "locals") : c} | ${hit ? hit.n : `not by ${last.n} (${pct(last.carriedPct)})`} | ${pct(at.fullMonthsPct)} | $${k(at.net)} | ${yrs(at.payback)} y | ${one ? pct(one.carriedPct) : "-"} / ${one ? pct(one.fullMonthsPct) : "-"} |`,
    );
  }
  return cells.join("\n");
}

const out: string[] = [];
const detailMode = process.argv[2] === "detail";
for (const [line, title] of LINES) {
  out.push(`### ${title}`, "");
  out.push(
    "| year | trains | trains to carry 90% | platform full then | net per train then | pays back in | 1 train: carried / full |",
    "|---|---|---|---|---|---|---|",
  );
  for (const y of YEARS) out.push(summaryRow(line, y, 0.5));
  out.push("");
}
if (detailMode) {
  out.push("## Every train count", "");
  for (const [line] of LINES)
    for (const y of YEARS) out.push(detail(line, y, ROUTE_DEMAND.distExponent), "");
}

// --- Candidates: the distance exponent --------------------------------------------------------------------------------
out.push("## Candidates: the distance exponent", "");
out.push(
  "| line | year | exponent | demand (people/yr) | trains to carry 90% | platform full then | net per train then | pays back in |",
  "|---|---|---|---|---|---|---|---|",
);
for (const [line] of LINES)
  for (const y of YEARS)
    for (const e of [0.5, 1, 2]) {
      const t = table(line, y, e);
      const c = line === "T" ? "locals" : "locals";
      const hit = firstNinety(t, c);
      const last = t.filter((a) => a.config === c).at(-1) as Avg | undefined;
      const at = hit ?? last;
      if (!at) continue;
      const one = t.find((a) => a.config === c && a.n === 1) as Avg;
      out.push(
        `| ${line} | ${y} | ${e} | ${Math.round(one.demand)} | ${hit ? hit.n : `not by ${last?.n}`} | ${pct(at.fullMonthsPct)} | $${k(at.net)} | ${yrs(at.payback)} y |`,
      );
    }
out.push("");

// --- Changing trains once at the hub -------------------------------------------------------------------------------
out.push("## How many more travellers H would have if people changed trains once at the hub", "");
out.push(
  "Plain calculation, no simulation: the same route formula for the pairs of towns on different branches (today only the hub and a branch's own towns are linked). A station still sends at most 1.5 times its own town total. Per year, people, all three branches served, average of the 2 layouts.",
  "",
  "| year | exponent | today (people/yr) | more, with the hub cap (as the game would) | more, without any cap |",
  "|---|---|---|---|---|",
);
for (const y of YEARS)
  for (const e of [0.5, 1, 2]) {
    ROUTE_DEMAND.distExponent = e;
    const res = [1, 2].map((seed) => transfer(seed, y));
    const avg = (f: (r: ReturnType<typeof transfer>) => number): number => mean(res.map(f));
    out.push(
      `| ${y} | ${e} | ${Math.round(avg((r) => r.direct))} | +${Math.round((100 * avg((r) => r.crossCapped)) / avg((r) => r.direct))}% (${Math.round(avg((r) => r.crossCapped))}) | +${Math.round((100 * avg((r) => r.cross)) / avg((r) => r.direct))}% (${Math.round(avg((r) => r.cross))}) |`,
    );
  }
ROUTE_DEMAND.distExponent = 0.5;

/** People a year on H's direct routes, and on the pairs of towns of different branches, from the same formula. */
function transfer(
  seed: number,
  year: number,
): { direct: number; cross: number; crossCapped: number } {
  const lay = layoutOf("H", seed);
  const width = lay.width;
  const arm = (i: number): number => (i === 0 ? -1 : Math.floor((i - 1) / 2));
  const dist = (a: number, b: number): number => {
    const ta = lay.towns[a]!;
    const tb = lay.towns[b]!;
    return octileTileDistance(ta.y * width + ta.x, tb.y * width + tb.x, width);
  };
  const total = (i: number): number =>
    (lay.towns[i]!.pop * tripsPerHeadPerMonth(year)) / PARTY_SIZE;
  const demand = (a: number, b: number): number =>
    routeDemandPerMonth(lay.towns[a]!.pop, lay.towns[b]!.pop, dist(a, b), year);
  const n = lay.towns.length;
  const sums = (pairs: Array<[number, number]>): { direct: number; crossCapped: number } => {
    // each station's outgoing routes, scaled down if they exceed 1.5 x its own total (as the sim does)
    let sum = 0;
    for (let a = 0; a < n; a++) {
      const mine = pairs.filter(([x, y]) => x === a || y === a);
      const s = mine.reduce((u, [x, y]) => u + demand(x, y), 0);
      const cap = ROUTE_DEMAND.townCap * total(a);
      sum += s > cap ? cap : s;
    }
    return { direct: sum, crossCapped: sum };
  };
  const directPairs: Array<[number, number]> = [];
  const crossPairs: Array<[number, number]> = [];
  for (let a = 0; a < n; a++)
    for (let b = a + 1; b < n; b++)
      (a === 0 || arm(a) === arm(b) ? directPairs : crossPairs).push([a, b]);
  const d = sums(directPairs).direct * 12 * PARTY_SIZE;
  const all = sums([...directPairs, ...crossPairs]).direct * 12 * PARTY_SIZE;
  const crossUncapped = crossPairs.reduce((u, [a, b]) => u + 2 * demand(a, b), 0) * 12 * PARTY_SIZE;
  return { direct: d, cross: crossUncapped, crossCapped: all - d };
}

console.log(out.join("\n"));

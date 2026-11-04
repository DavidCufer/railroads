import { describe, expect, it } from "vitest";
import {
  BANDS,
  band,
  rate,
  rateScenario,
  ramp,
  score,
  summarize,
  type Metrics,
} from "../../tools/bench/difficulty/rating";
import { playCompany, surveyMap, type Spec } from "../../tools/bench/difficulty/play";

const base: Metrics = {
  profitRatio5: 1,
  strongBankrupt: 0,
  cautiousBankrupt: 0,
  sloppyBankrupt: 0,
  firstProfitMonth: 6,
  paybackYears: 2,
  skillGap: 0,
  panicDepth: 0,
};

/** Each change makes the map worse in one respect; the score must never fall and the rating never get easier. */
const WORSE: Array<[string, Partial<Metrics>[]]> = [
  [
    "profitRatio5",
    [
      { profitRatio5: 0.7 },
      { profitRatio5: 0.3 },
      { profitRatio5: 0 },
      { profitRatio5: -0.5 },
      { profitRatio5: null },
    ],
  ],
  ["strongBankrupt", [{ strongBankrupt: 0.33 }, { strongBankrupt: 0.67 }, { strongBankrupt: 1 }]],
  ["cautiousBankrupt", [{ cautiousBankrupt: 0.5 }, { cautiousBankrupt: 1 }]],
  ["sloppyBankrupt", [{ sloppyBankrupt: 0.5 }, { sloppyBankrupt: 1 }]],
  [
    "firstProfitMonth",
    [{ firstProfitMonth: 12 }, { firstProfitMonth: 30 }, { firstProfitMonth: null }],
  ],
  ["paybackYears", [{ paybackYears: 4 }, { paybackYears: 7 }, { paybackYears: null }]],
  ["skillGap", [{ skillGap: 0.3 }, { skillGap: 0.6 }, { skillGap: 1 }]],
  ["panicDepth", [{ panicDepth: 0.1 }, { panicDepth: 0.3 }, { panicDepth: 0.6 }]],
];

describe("difficulty rating (Phase 83)", () => {
  it("is monotonic: every worsening input raises the score and never gives an easier band", () => {
    const order = ["easy", "fair", "hard", "brutal"];
    for (const [name, steps] of WORSE) {
      let prev = score(base);
      let prevBand = order.indexOf(band(prev));
      for (const step of steps) {
        const m = { ...base, ...step };
        const s = score(m);
        expect(s, `${name} ${JSON.stringify(step)}`).toBeGreaterThanOrEqual(prev);
        const b = order.indexOf(rate(m).rating);
        expect(b, name).toBeGreaterThanOrEqual(prevBand);
        prev = s;
        prevBand = b;
      }
    }
  });

  it("an untroubled map is easy and a hopeless one brutal; the bands are increasing", () => {
    expect(rate(base).rating).toBe("easy");
    const bad: Metrics = {
      ...base,
      profitRatio5: 0,
      strongBankrupt: 1,
      cautiousBankrupt: 1,
      sloppyBankrupt: 1,
      firstProfitMonth: null,
      paybackYears: null,
      skillGap: 1,
      panicDepth: 0.5,
    };
    expect(rate(bad).rating).toBe("brutal");
    const edges = BANDS.map((b) => b[1]);
    expect([...edges].sort((a, b) => a - b)).toEqual(edges);
  });

  it("ramp is linear and clamped, in either direction", () => {
    expect(ramp(5, 0, 10, 2)).toBe(1);
    expect(ramp(-1, 0, 10, 2)).toBe(0);
    expect(ramp(11, 0, 10, 2)).toBe(2);
    expect(ramp(0.5, 1, 0, 3)).toBe(1.5);
  });

  it("a scenario that is lost is brutal; more spare time is never harder", () => {
    const won = (spare: number, stars = 2) =>
      rateScenario({ status: "won", stars, maxStars: 2, spare, profitOverBar: 0 });
    expect(
      rateScenario({ status: "lost", stars: 0, maxStars: 2, spare: null, profitOverBar: 0 }),
    ).toBe("brutal");
    const order = ["easy", "fair", "hard"];
    expect(order.indexOf(won(0.9))).toBeLessThanOrEqual(order.indexOf(won(0.4)));
    expect(order.indexOf(won(0.4))).toBeLessThanOrEqual(order.indexOf(won(0.05)));
    expect(order.indexOf(won(0.9, 1))).toBeGreaterThanOrEqual(order.indexOf(won(0.9, 2)));
  });

  it("runs on a tiny random map in quick mode and gives a rating", { timeout: 300_000 }, () => {
    const spec: Spec = {
      kind: "random",
      id: "random:3",
      startYear: 1870,
      difficulty: "normal",
      mapSize: "small",
    };
    const survey = surveyMap(spec, 3);
    expect(survey.good).toBeGreaterThanOrEqual(0);
    const runs = (["strong", "cautious", "sloppy"] as const).map((v) =>
      playCompany(spec, v, { seed: 3, years: 1, quick: true, maxMonths: 14 }),
    );
    for (const r of runs) {
      expect(r.profit.length).toBe(1);
      expect(r.startCash).toBeGreaterThan(0);
    }
    const m = summarize(runs, 1);
    const res = rate(m);
    expect(["easy", "fair", "hard", "brutal"]).toContain(res.rating);
    expect(Number.isFinite(res.score)).toBe(true);
  });
});

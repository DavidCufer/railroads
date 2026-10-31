/** Sentences for scenarios (Phase 46), built from the data table; the words are in strings.ts. */
import { CARGO } from "../data/cargo";
import type { ScenarioDef } from "../data/scenarios";
import { formatMoney } from "./format";
import { h } from "./h";
import { strings } from "./strings";

export function scenarioName(id: string): string {
  return strings.scenarios.items[id]?.name ?? id;
}

export function scenarioBlurb(id: string): string {
  return strings.scenarios.items[id]?.blurb ?? "";
}

export function scenarioGoalLine(def: ScenarioDef): string {
  const g = def.goal;
  const t = strings.scenarios.goalLine;
  if (g.type === "connect") return t.connect(g.cities.join(" – "), g.byYear);
  if (g.type === "survive") return t.survive(g.untilYear, formatMoney(g.maxDebt));
  return t.deliver(
    `${g.amount.toLocaleString("en-US")} t`,
    CARGO[g.cargo].name.toLowerCase(),
    g.byYear,
  );
}

/** What earns the second and third star. */
export function scenarioStarsLine(def: ScenarioDef): string {
  const [a, b] = def.stars;
  if (def.goal.type === "survive")
    return `★★ profit ${formatMoney(a)} a year · ★★★ ${formatMoney(b)}`;
  return `★★ by ${a} · ★★★ also profit ${formatMoney(b)} a year`;
}

export interface ScenarioStarLine {
  stars: 1 | 2 | 3;
  text: string;
}

/** The star ladder, one line per star, each saying the whole condition (Phase 73). */
export function scenarioStarLadder(def: ScenarioDef): ScenarioStarLine[] {
  const [a, b] = def.stars;
  const t = strings.scenarios.ladder;
  const g = def.goal;
  const base = scenarioGoalLine(def);
  if (g.type === "survive") {
    return [
      { stars: 1, text: base },
      { stars: 2, text: t.survive(base, formatMoney(a)) },
      { stars: 3, text: t.survive(base, formatMoney(b)) },
    ];
  }
  return [
    { stars: 1, text: base },
    { stars: 2, text: t.earlier(base, a) },
    { stars: 3, text: t.earlierProfit(base, a, formatMoney(b)) },
  ];
}

/** Which of the ladder's stars were earned: a finished run has `run.stars` of them; a running one none. */
export function scenarioStarLadderEl(def: ScenarioDef, earned: number): HTMLElement {
  const lines = scenarioStarLadder(def).map((l) =>
    h(
      "li",
      { className: `scenario-star-line${l.stars <= earned ? " earned" : ""}` },
      h("span", { className: "scenario-star-mark" }, "★".repeat(l.stars)),
      h("span", { className: "scenario-star-text" }, l.text),
      h(
        "span",
        { className: "scenario-star-tick", "aria-hidden": "true" },
        l.stars <= earned ? "✓" : "",
      ),
    ),
  );
  return h("ul", { className: "scenario-star-ladder", "data-testid": "scenario-ladder" }, ...lines);
}

/** The Complete card's one line (Phase 73): what the next star needs, short because the card has a word limit; the Goals
 * panel keeps the full ladder. Null when all three stars were earned. */
export function scenarioNextStarLine(
  def: ScenarioDef,
  stars: number,
  endYear: number,
  profit: number,
): string | null {
  if (stars >= 3) return null;
  const [a, b] = def.stars;
  const t = strings.scenarios.next;
  const mark = "★".repeat(stars + 1);
  if (def.goal.type === "survive") {
    return t.profit(mark, formatMoney(stars <= 1 ? a : b), formatMoney(profit));
  }
  if (endYear > a) return t.by(mark, a);
  return t.profit(mark, formatMoney(b), formatMoney(profit));
}

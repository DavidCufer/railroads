/** Sentences for scenarios (Phase 46), built from the data table; the words are in strings.ts. */
import { CARGO } from "../data/cargo";
import type { ScenarioDef } from "../data/scenarios";
import { formatMoney } from "./format";
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

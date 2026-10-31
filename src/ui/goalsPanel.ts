/**
 * Goals panel and celebration dialog (SPEC §11: "Goals panel shows progress; reaching gold shows
 * a celebration dialog; game continues"). Both are plain slide-in panels (`openPanel`), matching
 * this codebase's only existing "automatically-opened dialog" precedent (the yearly report).
 */
import { goalLandGrant } from "../data/economy";
import { calendarFromTicks } from "../sim/time";
import { evaluateGoals } from "../sim/goals/evaluate";
import type { Goal } from "../sim/goals/types";
import type { GameState } from "../sim/state";
import { describeGoal, goalTargetYear } from "./goalStrings";
import { scenarioDefOf, scenarioProgress } from "../sim/scenario";
import { scenarioGoalLine, scenarioName, scenarioStarLadderEl } from "./scenarioStrings";
import { footerButton } from "./components/footer";
import { emptyState } from "./components/emptyState";
import { meter } from "./components/meter";
import { formatMoney } from "./format";
import { h } from "./h";
import { icon } from "./icons";
import { closePanel, openPanel } from "./panel";
import { strings } from "./strings";

function goalCard(state: GameState, status: ReturnType<typeof evaluateGoals>[number]): HTMLElement {
  const goal = status.goal;
  const pct = Math.round(status.progress * 100);
  const year = calendarFromTicks(state.startYear, state.ticks).year;
  const grant = formatMoney(goalLandGrant(goal.tier, year));
  return h(
    "div",
    { className: `goal-card goal-tier-${goal.tier}${status.complete ? " goal-complete" : ""}` },
    h(
      "span",
      { className: "goal-medal", "aria-label": strings.goals.tierNames[goal.tier] },
      icon("trophy"),
    ),
    h(
      "div",
      { className: "goal-main" },
      h("div", { className: "goal-desc" }, describeGoal(state, goal)),
      h(
        "div",
        { className: "goal-sub" },
        h(
          "span",
          { className: "goal-year", title: strings.goals.byYear(goalTargetYear(goal)) },
          icon("calendar", "icon-xs"),
          String(goalTargetYear(goal)),
        ),
        status.overdue ? h("span", { className: "goal-overdue" }, strings.goals.overdue) : null,
      ),
      h(
        "div",
        {
          className: "goal-reward",
          title: status.complete ? strings.goals.rewardReceived : strings.goals.reward(grant),
        },
        icon(status.complete ? "check" : "coin", "icon-xs"),
        status.complete ? "" : grant,
      ),
      meter(status.progress, 1, status.complete ? "go" : "brass"),
    ),
    h(
      "span",
      { className: `goal-value${status.complete ? " tone-go" : ""}` },
      status.complete ? icon("check", "icon-sm") : `${pct}%`,
    ),
  );
}

/** The scenario's goal and progress (Phase 46), above the region's bronze/silver/gold goals. */
function scenarioCard(state: GameState): HTMLElement | null {
  const def = scenarioDefOf(state);
  const progress = scenarioProgress(state);
  const run = state.scenario;
  if (!def || !progress || !run) return null;
  const t = strings.scenarios;
  const money = def.goal.type === "survive";
  const fmt = (n: number): string =>
    money ? formatMoney(n) : Math.round(n).toLocaleString("en-US");
  const label = run.status === "won" ? t.stars(run.stars) : run.status === "lost" ? t.lost : "";
  return h(
    "div",
    { className: "scenario-panel-card", "data-testid": "scenario-card" },
    h("div", { className: "goal-desc" }, `${scenarioName(def.id)} · ${scenarioGoalLine(def)}`),
    def.goal.type === "connect"
      ? null
      : meter(
          progress.current,
          progress.target,
          def.goal.type !== "survive"
            ? "brass"
            : progress.current < progress.target
              ? "go"
              : "signal",
          t.progress(fmt(progress.current), fmt(progress.target)),
        ),
    scenarioStarLadderEl(def, run.stars),
    label ? h("div", { className: "goal-sub" }, label) : null,
  );
}

export function openGoalsPanel(container: HTMLElement, state: GameState): void {
  const scenario = scenarioCard(state);
  // In a scenario only the scenario is shown: no free-play trophies (Phase 73).
  const statuses = scenario ? [] : evaluateGoals(state);
  const done = statuses.filter((s) => s.complete).length;
  const body: Node[] = [
    ...(scenario ? [scenario] : []),
    ...(statuses.length === 0
      ? scenario
        ? []
        : [emptyState(strings.goals.none, "goals")]
      : statuses.map((status) => goalCard(state, status))),
  ];
  openPanel(container, {
    title: strings.goals.title,
    subtitle: statuses.length > 0 ? strings.goals.doneCount(done, statuses.length) : undefined,
    thumb: icon("goals"),
    body,
    key: "goals",
    live: () => openGoalsPanel(container, state),
  });
}

export function openGoalCelebration(container: HTMLElement, state: GameState, goal: Goal): void {
  openPanel(container, {
    title: strings.celebration.title,
    thumb: icon("trophy"),
    body: [
      h(
        "div",
        { className: "yearly-report-headline good" },
        icon("trophy"),
        strings.goals.tierNames[goal.tier],
      ),
      h("div", { className: "panel-row" }, describeGoal(state, goal)),
    ],
    footer: [
      footerButton({
        kind: "primary",
        label: strings.celebration.close,
        className: "panel-action-build",
        onClick: () => closePanel(),
      }),
    ],
  });
}

export function createGoalsButton(container: HTMLElement, onClick: () => void): HTMLElement {
  const btn = h(
    "button",
    { className: "goals-button", "aria-label": strings.goals.button, onClick },
    icon("goals"),
  );
  container.appendChild(btn);
  return btn;
}

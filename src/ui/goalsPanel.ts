/**
 * Goals panel and celebration dialog (SPEC §11: "Goals panel shows progress; reaching gold shows
 * a celebration dialog; game continues"). Both are plain slide-in panels (`openPanel`), matching
 * this codebase's only existing "automatically-opened dialog" precedent (the yearly report).
 */
import { evaluateGoals } from "../sim/goals/evaluate";
import type { Goal } from "../sim/goals/types";
import type { GameState } from "../sim/state";
import { describeGoal, goalTargetYear } from "./goalStrings";
import { h } from "./h";
import { closePanel, openPanel } from "./panel";
import { strings } from "./strings";

function goalCard(state: GameState, status: ReturnType<typeof evaluateGoals>[number]): HTMLElement {
  const goal = status.goal;
  return h(
    "div",
    { className: `goal-card goal-tier-${goal.tier}${status.complete ? " goal-complete" : ""}` },
    h(
      "div",
      { className: "goal-card-header" },
      h("span", { className: "goal-tier-badge" }, strings.goals.tierNames[goal.tier]),
      h("span", { className: "goal-year" }, strings.goals.byYear(goalTargetYear(goal))),
    ),
    h("div", { className: "goal-desc" }, describeGoal(state, goal)),
    h(
      "div",
      { className: "cargo-bar-row" },
      h(
        "div",
        { className: "cargo-bar-track" },
        h("div", {
          className: "cargo-bar-fill",
          style: {
            width: `${Math.round(status.progress * 100)}%`,
            background: status.complete ? "#5bc27a" : "#f2b544",
          },
        }),
      ),
      h(
        "span",
        { className: "cargo-bar-value" },
        status.complete ? "✓" : `${Math.round(status.progress * 100)}%`,
      ),
    ),
    status.overdue ? h("div", { className: "goal-overdue" }, strings.goals.overdue) : null,
  );
}

export function openGoalsPanel(container: HTMLElement, state: GameState): void {
  const statuses = evaluateGoals(state);
  const body: Node[] =
    statuses.length === 0
      ? [h("div", { className: "panel-row" }, strings.goals.none)]
      : statuses.map((status) => goalCard(state, status));
  openPanel(container, { title: strings.goals.title, body });
}

export function openGoalCelebration(container: HTMLElement, state: GameState, goal: Goal): void {
  openPanel(container, {
    title: strings.celebration.title,
    body: [
      h("div", { className: "yearly-report-headline good" }, strings.goals.tierNames[goal.tier]),
      h("div", { className: "panel-row" }, describeGoal(state, goal)),
    ],
    footer: [
      h(
        "button",
        { className: "panel-action-build", onClick: () => closePanel() },
        strings.celebration.close,
      ),
    ],
  });
}

export function createGoalsButton(container: HTMLElement, onClick: () => void): HTMLElement {
  const btn = h(
    "button",
    { className: "goals-button", "aria-label": strings.goals.button, onClick },
    h("span", null, "\u{1F3C6}"),
    h("span", null, strings.goals.button),
  );
  container.appendChild(btn);
  return btn;
}

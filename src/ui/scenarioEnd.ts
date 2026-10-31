/** Scenario win/lose card (Phase 46): the game-over card style, with stars, the reason and what next. */
import { ledgerOperatingProfit } from "../data/finance";
import { scenarioDefOf } from "../sim/scenario";
import type { GameState } from "../sim/state";
import { formatMoney } from "./format";
import { h } from "./h";
import { scenarioGoalLine, scenarioName, scenarioStarLadderEl } from "./scenarioStrings";
import { strings } from "./strings";

export interface ScenarioEndHandlers {
  onRetry: () => void;
  onScenarios: () => void;
  /** Won only: close the card and carry on (the result stays recorded). */
  onKeepPlaying: () => void;
  onHistory?: () => void;
  /** The result beat the profile's best. */
  newBest: boolean;
}

export function openScenarioEnd(
  container: HTMLElement,
  state: GameState,
  handlers: ScenarioEndHandlers,
): HTMLElement | null {
  const run = state.scenario;
  const def = scenarioDefOf(state);
  if (!run || !def || run.status === "active") return null;
  const t = strings.scenarios;
  const won = run.status === "won";
  const root = h(
    "div",
    { className: "game-over", "data-testid": "scenario-end" },
    h(
      "div",
      { className: `game-over-card${won ? " scenario-won" : ""}` },
      h("h2", null, won ? t.won : t.lost),
      h("p", null, scenarioName(def.id)),
      won ? null : h("p", null, scenarioGoalLine(def)),
      won
        ? h(
            "div",
            { className: "scenario-end-stars", "data-testid": "scenario-end-stars" },
            t.stars(run.stars),
            handlers.newBest ? h("span", { className: "scenario-new-best" }, t.newBest) : null,
          )
        : h("p", null, run.reason ? t.reasons[run.reason] : ""),
      won ? scenarioStarLadderEl(def, run.stars) : null,
      h("p", null, t.profit(formatMoney(ledgerOperatingProfit(state.finance.lastYear)))),
      h(
        "div",
        { className: "game-over-buttons" },
        won
          ? h(
              "button",
              { className: "title-btn title-btn-primary", onClick: handlers.onKeepPlaying },
              t.keepPlaying,
            )
          : null,
        handlers.onHistory
          ? h(
              "button",
              { className: "title-btn", onClick: handlers.onHistory },
              strings.history.button,
            )
          : null,
        h(
          "button",
          { className: `title-btn${won ? "" : " title-btn-primary"}`, onClick: handlers.onRetry },
          t.retry,
        ),
        h("button", { className: "title-btn", onClick: handlers.onScenarios }, t.toScenarios),
      ),
    ),
  );
  container.appendChild(root);
  return root;
}

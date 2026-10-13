/** Scenario list (Phase 46): title screen -> Scenarios. One card per scenario with its goal, the best stars and Start. */
import { SCENARIOS, scenarioNewGameOptions } from "../data/scenarios";
import { loadProfile } from "../save/profile";
import type { NewGameOptions } from "../sim/state";
import { scenarioBlurb, scenarioName, scenarioStarsLine } from "./scenarioStrings";
import { h } from "./h";
import { icon } from "./icons";
import { screenHeader } from "./screenHeader";
import { strings } from "./strings";

export interface ScenariosScreenHandlers {
  onBack: () => void;
  onStart: (options: NewGameOptions) => void;
}

export function renderScenariosScreen(handlers: ScenariosScreenHandlers): HTMLElement {
  const s = strings.scenarios;
  const profile = loadProfile();
  const cards = SCENARIOS.map((def) =>
    h(
      "div",
      { className: "save-slot-card scenario-card", "data-testid": `scenario-${def.id}` },
      icon("goals", "save-slot-icon"),
      h(
        "div",
        { className: "save-slot-info" },
        h(
          "div",
          { className: "save-slot-name" },
          scenarioName(def.id),
          h("span", { className: "scenario-stars" }, s.best(profile.scenarioStars[def.id] ?? 0)),
        ),
        h("div", { className: "save-slot-detail" }, scenarioBlurb(def.id)),
        h("div", { className: "save-slot-detail" }, scenarioStarsLine(def)),
      ),
      h(
        "div",
        { className: "save-slot-actions" },
        h(
          "button",
          {
            className: "save-slot-btn save-slot-btn-primary",
            onClick: () => handlers.onStart(scenarioNewGameOptions(def)),
          },
          icon("play", "icon-sm"),
          s.start,
        ),
      ),
    ),
  );
  return h(
    "div",
    { className: "save-load-screen" },
    screenHeader(s.title, handlers.onBack),
    h(
      "div",
      { className: "new-game-content" },
      h("div", { className: "save-slot-list" }, ...cards),
    ),
  );
}

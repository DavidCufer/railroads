/** Shared full-screen header (STYLE §4): back arrow + title in display serif. Used by the New
 * Game, Settings and Save/Load screens. */
import { h } from "./h";
import { icon } from "./icons";
import { strings } from "./strings";

export function screenHeader(title: string, onBack: () => void): HTMLElement {
  return h(
    "div",
    { className: "new-game-header" },
    h(
      "button",
      { className: "new-game-back-arrow", "aria-label": strings.ui.back, onClick: onBack },
      icon("back"),
    ),
    h("span", null, title),
  );
}

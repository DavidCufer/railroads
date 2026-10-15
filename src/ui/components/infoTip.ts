/**
 * Small (i) button that opens a one-paragraph tip (STYLE §16). The tip is not in the DOM until opened, so
 * it adds no visible words to a panel. `tipRow` puts the (i) at the right of a row and the paragraph below it.
 */
import { h } from "../h";
import { strings } from "../strings";

export interface InfoTip {
  /** The (i) button, to place inline. */
  button: HTMLButtonElement;
  /** The host the paragraph is shown in; place it right below the row holding the button. */
  host: HTMLElement;
}

export function infoTip(text: string): InfoTip {
  const host = h("div", { className: "info-tip-host" });
  const button = h("button", {
    className: "info-tip-btn",
    type: "button",
    "aria-label": strings.ui.moreInfo,
    "aria-expanded": "false",
  });
  button.addEventListener("click", (e) => {
    e.stopPropagation();
    const open = button.getAttribute("aria-expanded") === "true";
    button.setAttribute("aria-expanded", String(!open));
    if (open) host.replaceChildren();
    else host.replaceChildren(h("p", { className: "info-tip", role: "note" }, text));
  });
  return { button, host };
}

/** `content` with an (i) at its right end; the tip paragraph opens under the row. */
export function tipRow(content: HTMLElement | string, text: string, className = ""): HTMLElement {
  const tip = infoTip(text);
  return h(
    "div",
    { className: `tip-row-wrap ${className}`.trim() },
    h(
      "div",
      { className: "tip-row" },
      typeof content === "string" ? h("span", { className: "tip-row-text" }, content) : content,
      tip.button,
    ),
    tip.host,
  );
}

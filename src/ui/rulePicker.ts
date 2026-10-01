/** Loading-rule picker (Playtest 2: "a tap on the order's rule chip silently cycles"). A small centred card that
 * lists every rule with its explanation; nothing changes until the player picks one. */
import type { LoadingRule } from "../sim/trains/types";
import { pushBackHandler } from "./backButton";
import { h } from "./h";
import { icon } from "./icons";
import { LOADING_RULES, RULE_ICONS } from "./routeTimeline";
import { strings } from "./strings";

let closeOpen: (() => void) | null = null;

export function openRulePicker(
  current: LoadingRule,
  onPick: (rule: LoadingRule) => void,
  stopName?: string,
): void {
  closeOpen?.();
  const t = strings.trains;
  const unregister = pushBackHandler(() => close());
  const scrim = h("div", {
    className: "rule-picker-scrim",
    onClick: (e: Event) => {
      if (e.target === scrim) close();
    },
  });
  function close(): void {
    unregister();
    scrim.remove();
    closeOpen = null;
  }
  closeOpen = close;
  const card = h(
    "div",
    { className: "rule-picker", role: "dialog", "aria-label": t.rulePickerTitle },
    h(
      "div",
      { className: "rule-picker-head" },
      h("span", { className: "panel-section-title" }, t.rulePickerTitle),
      stopName ? h("span", { className: "rule-picker-stop" }, stopName) : null,
    ),
    ...LOADING_RULES.map((rule) =>
      h(
        "button",
        {
          className: `rule-picker-row${rule === current ? " active" : ""}`,
          "data-testid": `rule-option-${rule}`,
          "aria-pressed": rule === current ? "true" : "false",
          onClick: () => {
            close();
            if (rule !== current) onPick(rule);
          },
        },
        icon(RULE_ICONS[rule], "icon-sm"),
        h(
          "span",
          { className: "rule-picker-text" },
          h("b", null, t.loadingRules[rule]),
          h("span", null, t.ruleHint[rule]),
        ),
        rule === current ? icon("check", "icon-sm") : null,
      ),
    ),
  );
  scrim.appendChild(card);
  document.body.appendChild(scrim);
}

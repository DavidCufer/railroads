import { h } from "../h";
import { icon, type IconName } from "../icons";

export interface ToggleRowOptions {
  icon?: IconName;
  label: string;
  desc?: string;
  on: boolean;
  onToggle: () => void;
  testId?: string;
}

/** STYLE §8.2 Toggle row: icon, label, and a real switch (brass when on). */
export function toggleRow(options: ToggleRowOptions): HTMLElement {
  return h(
    "button",
    {
      className: `toggle-row${options.on ? " active" : ""}`,
      role: "switch",
      "aria-checked": options.on ? "true" : "false",
      onClick: options.onToggle,
      ...(options.testId ? { "data-testid": options.testId } : {}),
    },
    options.icon ? icon(options.icon, "toggle-icon") : null,
    h(
      "span",
      { className: "toggle-text" },
      h("span", { className: "toggle-label" }, options.label),
      options.desc ? h("span", { className: "toggle-desc" }, options.desc) : null,
    ),
    h("span", { className: "switch" }),
  );
}

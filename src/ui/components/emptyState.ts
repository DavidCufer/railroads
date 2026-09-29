import { h } from "../h";
import { icon, type IconName } from "../icons";

/** STYLE §8.2 Empty state: one muted line with an icon — never a lone "—". */
export function emptyState(text: string, iconName: IconName = "info"): HTMLElement {
  return h("div", { className: "empty-state" }, icon(iconName, "icon-sm"), h("span", null, text));
}

import { h } from "../h";
import { icon, type IconName } from "../icons";

export interface TabItem<Id extends string> {
  id: Id;
  label: string;
  icon?: IconName;
}

/** STYLE §8.2 Tabs: 36px sticky row, icon + short label, brass underline on the active one. */
export function tabs<Id extends string>(
  items: readonly TabItem<Id>[],
  active: Id,
  onSelect: (id: Id) => void,
): HTMLElement {
  return h(
    "div",
    { className: "tabs", role: "tablist" },
    ...items.map((item) =>
      h(
        "button",
        {
          className: `tab${item.id === active ? " active" : ""}`,
          role: "tab",
          "aria-selected": item.id === active ? "true" : "false",
          "data-tab": item.id,
          onClick: () => {
            if (item.id !== active) onSelect(item.id);
          },
        },
        item.icon ? icon(item.icon, "icon-sm") : null,
        item.label,
      ),
    ),
  );
}

/**
 * Left build toolbar (SPEC §10.1): Track, Double, Electrify, Station, Bulldoze, Info.
 * Only Info exists this phase (SPEC §4.2 steps 4–6 / §8.2-3 — placement and info only, no
 * building yet); the rest are shown per the SPEC layout but disabled until their phases land.
 */
import { h } from "./h";
import { strings } from "./strings";

const TOOLS: Array<{ id: string; label: string; icon: string; enabled: boolean }> = [
  { id: "track", label: strings.toolbar.track, icon: "🛤", enabled: false },
  { id: "double", label: strings.toolbar.double, icon: "≡", enabled: false },
  { id: "electrify", label: strings.toolbar.electrify, icon: "⚡", enabled: false },
  { id: "station", label: strings.toolbar.station, icon: "🚉", enabled: false },
  { id: "bulldoze", label: strings.toolbar.bulldoze, icon: "🛠", enabled: false },
  { id: "info", label: strings.toolbar.info, icon: "ℹ", enabled: true },
];

export function createToolbar(container: HTMLElement): HTMLElement {
  const buttons = TOOLS.map((tool) =>
    h(
      "button",
      {
        "aria-label": tool.label,
        disabled: !tool.enabled,
        ...(tool.id === "info" ? { className: "active" } : {}),
      },
      h("span", null, tool.icon),
      h("span", null, tool.label),
    ),
  );
  const root = h("div", { className: "toolbar" }, ...buttons);
  container.appendChild(root);
  return root;
}

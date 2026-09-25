/**
 * Left build toolbar (SPEC §10.1): Track, Double, Electrify, Station, Bulldoze, Info. All live —
 * Electrify's 1905 era gate (SPEC §5.3) is enforced by the command/plan it drives (main.ts), same
 * as Track mode's own era-gated bridge types, rather than by disabling the button itself.
 */
import { h } from "./h";
import { strings } from "./strings";

export type ToolId = "track" | "double" | "electrify" | "station" | "bulldoze" | "info";

const TOOLS: Array<{ id: ToolId; label: string; icon: string; enabled: boolean }> = [
  { id: "track", label: strings.toolbar.track, icon: "🛤", enabled: true },
  { id: "double", label: strings.toolbar.double, icon: "≡", enabled: true },
  { id: "electrify", label: strings.toolbar.electrify, icon: "⚡", enabled: true },
  { id: "station", label: strings.toolbar.station, icon: "🚉", enabled: true },
  { id: "bulldoze", label: strings.toolbar.bulldoze, icon: "🛠", enabled: true },
  { id: "info", label: strings.toolbar.info, icon: "ℹ", enabled: true },
];

export interface ToolbarController {
  root: HTMLElement;
  setActive: (tool: ToolId) => void;
}

export function createToolbar(
  container: HTMLElement,
  onSelect: (tool: ToolId) => void,
): ToolbarController {
  const buttonById = new Map<ToolId, HTMLButtonElement>();

  const buttons = TOOLS.map((tool) => {
    const btn = h(
      "button",
      {
        "aria-label": tool.label,
        disabled: !tool.enabled,
        className: tool.id === "info" ? "active" : "",
        onClick: () => {
          if (!tool.enabled) return;
          setActive(tool.id);
          onSelect(tool.id);
        },
      },
      h("span", null, tool.icon),
      h("span", null, tool.label),
    );
    buttonById.set(tool.id, btn);
    return btn;
  });

  function setActive(tool: ToolId): void {
    for (const [id, btn] of buttonById) btn.classList.toggle("active", id === tool);
  }

  const root = h("div", { className: "toolbar" }, ...buttons);
  container.appendChild(root);

  return { root, setActive };
}

/**
 * Quick build toggle (SPEC §5.2: "releasing builds immediately"; §13: setting lives in
 * localStorage). Kept out of the vertical build toolbar — on a short landscape phone viewport
 * that toolbar is already tall enough to nearly fill the screen height (SPEC §10.1 calls it
 * "collapsible"; full collapse behavior is Phase 11's Settings screen) — and placed bottom-right,
 * a corner this phase doesn't otherwise use yet (the Trains/News buttons land there in later
 * phases).
 */
export const QUICK_BUILD_STORAGE_KEY = "railroads.quickBuild";

function readQuickBuildSetting(): boolean {
  try {
    return window.localStorage.getItem(QUICK_BUILD_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeQuickBuildSetting(enabled: boolean): void {
  try {
    window.localStorage.setItem(QUICK_BUILD_STORAGE_KEY, enabled ? "1" : "0");
  } catch {
    // localStorage unavailable (private browsing, etc.) — setting just won't persist.
  }
}

/** Floating "Trains" button (SPEC PLAN Phase 6): opens the train list. Stacked above the quick
 * build toggle in the same bottom-right corner the toolbar.ts comment above earmarked for it. */
export function createTrainListButton(container: HTMLElement, onClick: () => void): HTMLElement {
  const btn = h(
    "button",
    { className: "train-list-button", "aria-label": strings.trains.trainsButton, onClick },
    h("span", null, "🚆"),
    h("span", null, strings.trains.trainsButton),
  );
  container.appendChild(btn);
  return btn;
}

export function createQuickBuildToggle(
  container: HTMLElement,
  onChange: (enabled: boolean) => void,
): HTMLElement {
  let quickBuild = readQuickBuildSetting();
  const toggle = h(
    "button",
    {
      className: `quick-build-toggle${quickBuild ? " active" : ""}`,
      "aria-label": strings.build.quickBuild,
      onClick: () => {
        quickBuild = !quickBuild;
        toggle.classList.toggle("active", quickBuild);
        writeQuickBuildSetting(quickBuild);
        onChange(quickBuild);
      },
    },
    h("span", { className: "switch" }),
    h("span", { className: "quick-build-label" }, strings.build.quickBuild),
  );
  container.appendChild(toggle);
  onChange(quickBuild); // fire once on startup so callers know the initial persisted value
  return toggle;
}

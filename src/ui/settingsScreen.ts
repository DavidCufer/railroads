/**
 * Settings screen (SPEC §13: units, quick build, sound, show grid, UI scale — all persisted in
 * localStorage). Reachable from the title screen (before any game exists) and from the in-game ☰
 * menu (`main.ts`'s `openSettingsOverlay`) — both just call `renderSettingsScreen` into their own
 * container, so this module doesn't need to know which context it's in beyond the handlers passed
 * to it.
 */
import { h } from "./h";
import { strings } from "./strings";
import {
  loadSettings,
  saveSettings,
  UI_SCALE_CHOICES,
  type Settings,
  type Units,
} from "./settings";
import { QUICK_BUILD_STORAGE_KEY } from "./toolbar";

function readQuickBuild(): boolean {
  try {
    return window.localStorage.getItem(QUICK_BUILD_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeQuickBuild(enabled: boolean): void {
  try {
    window.localStorage.setItem(QUICK_BUILD_STORAGE_KEY, enabled ? "1" : "0");
  } catch {
    // localStorage unavailable — setting just won't persist, same as toolbar.ts's own toggle.
  }
}

export interface SettingsScreenHandlers {
  onBack: () => void;
  /** Fires on every change so a live game can apply it immediately (grid overlay, UI scale,
   * quick-build's floating toggle) without waiting for the screen to close. Absent when there's no
   * live game to apply to yet (the title screen). */
  onChange?: (settings: Settings, quickBuild: boolean) => void;
}

function toggleRow(
  label: string,
  desc: string | undefined,
  active: boolean,
  onClick: () => void,
): HTMLElement {
  return h(
    "button",
    { className: `settings-toggle-row${active ? " active" : ""}`, onClick },
    h(
      "div",
      { className: "settings-toggle-text" },
      h("div", { className: "settings-toggle-label" }, label),
      desc ? h("div", { className: "settings-toggle-desc" }, desc) : null,
    ),
    h("span", { className: "switch" }),
  );
}

export function renderSettingsScreen(handlers: SettingsScreenHandlers): HTMLElement {
  const s = strings.settings;
  let settings: Settings = loadSettings();
  let quickBuild = readQuickBuild();

  const root = h("div", { className: "settings-screen" });

  function commit(): void {
    saveSettings(settings);
    writeQuickBuild(quickBuild);
    handlers.onChange?.(settings, quickBuild);
    render();
  }

  function render(): void {
    root.replaceChildren(
      h("div", { className: "new-game-header" }, h("span", null, s.title)),
      h(
        "div",
        { className: "new-game-content settings-content" },
        h(
          "div",
          { className: "option-row" },
          h("span", { className: "option-label" }, s.units),
          h(
            "div",
            { className: "segmented-row" },
            ...(["kmh", "mph"] as Units[]).map((u) =>
              h(
                "button",
                {
                  className: `segmented-btn${settings.units === u ? " active" : ""}`,
                  onClick: () => {
                    settings = { ...settings, units: u };
                    commit();
                  },
                },
                s.unitsNames[u],
              ),
            ),
          ),
        ),
        toggleRow(s.quickBuild, s.quickBuildDesc, quickBuild, () => {
          quickBuild = !quickBuild;
          commit();
        }),
        toggleRow(s.sound, s.soundDesc, settings.sound, () => {
          settings = { ...settings, sound: !settings.sound };
          commit();
        }),
        toggleRow(s.grid, undefined, settings.grid, () => {
          settings = { ...settings, grid: !settings.grid };
          commit();
        }),
        h(
          "div",
          { className: "option-row" },
          h("span", { className: "option-label" }, s.uiScale),
          h(
            "div",
            { className: "segmented-row" },
            ...UI_SCALE_CHOICES.map((scale) =>
              h(
                "button",
                {
                  className: `segmented-btn${settings.uiScale === scale ? " active" : ""}`,
                  onClick: () => {
                    settings = { ...settings, uiScale: scale };
                    commit();
                  },
                },
                s.uiScaleNames[String(scale) as "0.85" | "1" | "1.15"],
              ),
            ),
          ),
        ),
      ),
      h(
        "div",
        { className: "new-game-footer" },
        h(
          "button",
          { className: "new-game-back-btn settings-back-btn", onClick: handlers.onBack },
          s.back,
        ),
      ),
    );
  }

  render();
  return root;
}

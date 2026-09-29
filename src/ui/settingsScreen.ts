/**
 * Settings screen (SPEC §13: units, quick build, sound, show grid, UI scale — all persisted in
 * localStorage). Reachable from the title screen (before any game exists) and from the in-game ☰
 * menu (`main.ts`'s `openSettingsOverlay`) — both just call `renderSettingsScreen` into their own
 * container, so this module doesn't need to know which context it's in beyond the handlers passed
 * to it.
 */
import { cardList } from "./components/cardRow";
import { section } from "./components/section";
import { toggleRow } from "./components/toggleRow";
import { h } from "./h";
import { icon, type IconName } from "./icons";
import { screenHeader } from "./screenHeader";
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

interface Segment {
  label: string;
  active: boolean;
  onClick: () => void;
}

/** An icon + label row with a segmented control on the right (units, UI scale). */
function optionRow(iconName: IconName, label: string, segments: Segment[]): HTMLElement {
  return h(
    "div",
    { className: "option-row settings-option-row" },
    icon(iconName, "toggle-icon"),
    h("span", { className: "option-label" }, label),
    h(
      "div",
      { className: "segmented-row" },
      ...segments.map((seg) =>
        h(
          "button",
          { className: `segmented-btn${seg.active ? " active" : ""}`, onClick: seg.onClick },
          seg.label,
        ),
      ),
    ),
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
      screenHeader(s.title, handlers.onBack),
      h(
        "div",
        { className: "new-game-content settings-content" },
        section(s.groupPlay, [
          cardList(
            optionRow(
              "tags",
              s.units,
              (["kmh", "mph"] as Units[]).map((u) => ({
                label: s.unitsNames[u],
                active: settings.units === u,
                onClick: () => {
                  settings = { ...settings, units: u };
                  commit();
                },
              })),
            ),
            toggleRow({
              icon: "hammer",
              label: s.quickBuild,
              desc: s.quickBuildDesc,
              on: quickBuild,
              onToggle: () => {
                quickBuild = !quickBuild;
                commit();
              },
            }),
          ),
        ]),
        section(s.groupDisplay, [
          cardList(
            toggleRow({
              icon: settings.sound ? "sound" : "soundOff",
              label: s.sound,
              desc: s.soundDesc,
              on: settings.sound,
              onToggle: () => {
                settings = { ...settings, sound: !settings.sound };
                commit();
              },
            }),
            toggleRow({
              icon: "layers",
              label: s.grid,
              on: settings.grid,
              onToggle: () => {
                settings = { ...settings, grid: !settings.grid };
                commit();
              },
            }),
            optionRow(
              "settings",
              s.uiScale,
              UI_SCALE_CHOICES.map((scale) => ({
                label: s.uiScaleNames[String(scale) as "0.85" | "1" | "1.15"],
                active: settings.uiScale === scale,
                onClick: () => {
                  settings = { ...settings, uiScale: scale };
                  commit();
                },
              })),
            ),
          ),
        ]),
      ),
    );
  }

  render();
  return root;
}

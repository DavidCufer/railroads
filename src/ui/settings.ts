/** Persisted app settings (SPEC §13: "units km/h vs mph, quick build, sound, show grid, UI
 * scale" — all in localStorage, never IndexedDB). Quick build keeps its own pre-existing key
 * (`toolbar.ts`'s `QUICK_BUILD_STORAGE_KEY`, already shipped and e2e-tested since Phase 4) rather
 * than folding it into this blob, so this module only owns the four settings Phase 11 adds. */

export type Units = "kmh" | "mph";

export interface Settings {
  units: Units;
  sound: boolean;
  grid: boolean;
  /** A CSS scale factor applied to the whole `#ui` overlay. */
  uiScale: number;
}

export const UI_SCALE_CHOICES = [0.85, 1, 1.15] as const;

const STORAGE_KEY = "railroads.settings";

export const DEFAULT_SETTINGS: Settings = {
  units: "kmh",
  sound: false, // SPEC §13/§1: sound is opt-in, off by default
  grid: false,
  uiScale: 1,
};

function isUnits(v: unknown): v is Units {
  return v === "kmh" || v === "mph";
}

export function loadSettings(): Settings {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return {
      units: isUnits(parsed.units) ? parsed.units : DEFAULT_SETTINGS.units,
      sound: typeof parsed.sound === "boolean" ? parsed.sound : DEFAULT_SETTINGS.sound,
      grid: typeof parsed.grid === "boolean" ? parsed.grid : DEFAULT_SETTINGS.grid,
      uiScale:
        typeof parsed.uiScale === "number" &&
        (UI_SCALE_CHOICES as readonly number[]).includes(parsed.uiScale)
          ? parsed.uiScale
          : DEFAULT_SETTINGS.uiScale,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: Settings): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // localStorage unavailable (private browsing, etc.) — setting just won't persist.
  }
}

/** km/h -> the unit the player picked, formatted with its symbol (SPEC §13). */
export function formatSpeed(kmh: number, units: Units): string {
  if (units === "mph") return `${Math.round(kmh * 0.621371)} mph`;
  return `${Math.round(kmh)} km/h`;
}

/**
 * The player profile (Phase 46): things that outlive any one game - best scenario stars and unlocked achievements. Kept in
 * localStorage, outside the game save; every access is wrapped because storage can be missing or blocked.
 */
const KEY = "railroads.profile";

export interface Profile {
  /** Scenario id -> best stars (1-3). */
  scenarioStars: Record<string, number>;
  /** Achievement id -> the real date it was first unlocked (YYYY-MM-DD). */
  achievements: Record<string, string>;
}

export function loadProfile(): Profile {
  const empty: Profile = { scenarioStars: {}, achievements: {} };
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return empty;
    const parsed = JSON.parse(raw) as Partial<Profile>;
    return {
      scenarioStars: { ...parsed.scenarioStars },
      achievements: { ...parsed.achievements },
    };
  } catch {
    return empty;
  }
}

function saveProfile(profile: Profile): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(profile));
  } catch {
    // Storage unavailable: the profile just does not persist.
  }
}

/** Keeps the best result; returns true when `stars` beats the stored one. */
export function recordScenarioStars(id: string, stars: number): boolean {
  const profile = loadProfile();
  if ((profile.scenarioStars[id] ?? 0) >= stars) return false;
  profile.scenarioStars[id] = stars;
  saveProfile(profile);
  return true;
}

/** Remembers an unlock (the first date wins). */
export function recordAchievement(id: string, date: string): void {
  const profile = loadProfile();
  if (profile.achievements[id]) return;
  profile.achievements[id] = date;
  saveProfile(profile);
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

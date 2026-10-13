/** Achievements list (Phase 46): every achievement, locked or unlocked with the date. Title screen and in-game menu. */
import { ACHIEVEMENT_IDS } from "../data/achievements";
import { loadProfile } from "../save/profile";
import type { GameState } from "../sim/state";
import { calendarFromTicks } from "../sim/time";
import { cardList, cardRow } from "./components/cardRow";
import { formatDate } from "./format";
import { h } from "./h";
import { icon } from "./icons";
import { screenHeader } from "./screenHeader";
import { strings } from "./strings";

/** `state` adds the achievements of the running game to the profile's (the profile keeps the real date of the first unlock). */
export function renderAchievementsScreen(onBack: () => void, state?: GameState): HTMLElement {
  const t = strings.achievements;
  const profile = loadProfile();
  const rows = ACHIEVEMENT_IDS.map((id) => {
    const item = t.items[id];
    const tick = state?.history.achievements[id];
    const date =
      profile.achievements[id] ??
      (tick !== undefined ? formatDate(calendarFromTicks(state!.startYear, tick)) : undefined);
    return cardRow({
      thumb: icon(date ? "trophy" : "lock"),
      title: item?.name ?? id,
      meta: item?.desc ?? "",
      trailing: date ?? t.locked,
      className: date ? "achievement-row unlocked" : "achievement-row locked",
      testId: `achievement-${id}`,
    });
  });
  const unlocked = rows.filter((r) => r.classList.contains("unlocked")).length;
  return h(
    "div",
    { className: "save-load-screen achievements-screen", "data-testid": "achievements-screen" },
    screenHeader(`${t.title} · ${t.count(unlocked, ACHIEVEMENT_IDS.length)}`, onBack),
    h("div", { className: "new-game-content" }, cardList(...rows)),
  );
}

export function openAchievementsScreen(container: HTMLElement, state: GameState): void {
  const overlay = h("div", { className: "overlay-screen" });
  overlay.appendChild(renderAchievementsScreen(() => overlay.remove(), state));
  container.appendChild(overlay);
}

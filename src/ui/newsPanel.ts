/**
 * News panel (SPEC §10.1: "News button with unread badge") — history of news items (capped at
 * `NEWS_HISTORY_MAX` in the sim), newest first. Also the shared formatter `formatNewsItem` used
 * both here and for toasts (src/main.ts drains `state.pendingNews` on every tick).
 */
import { locomotiveById } from "../data/trains";
import { markAllNewsRead, unreadNewsCount, type NewsItem } from "../sim/news";
import type { GameState } from "../sim/state";
import { h } from "./h";
import { openPanel } from "./panel";
import { strings } from "./strings";

function trainName(state: GameState, trainId: number): string {
  return state.trains.find((t) => t.id === trainId)?.name ?? "?";
}

function stationName(state: GameState, stationId: number): string {
  return state.stations.find((s) => s.id === stationId)?.name ?? "?";
}

function cityName(state: GameState, cityId: number): string {
  return state.cities.find((c) => c.id === cityId)?.name ?? "?";
}

/** Nearest built station to `tile` by straight-line tile distance — used to name a place for
 * tile-anchored news (traffic jams, washouts) that don't reference a specific station. */
function nearestStationName(state: GameState, tile: number): string {
  const width = state.map.width;
  const tx = tile % width;
  const ty = Math.floor(tile / width);
  let best: { name: string; d: number } | null = null;
  for (const s of state.stations) {
    const sx = s.tile % width;
    const sy = Math.floor(s.tile / width);
    const d = Math.hypot(sx - tx, sy - ty);
    if (!best || d < best.d) best = { name: s.name, d };
  }
  return best?.name ?? "?";
}

export function formatNewsItem(state: GameState, item: NewsItem): string {
  switch (item.kind) {
    case "newLocomotive":
      return strings.news.kinds.newLocomotive(locomotiveById(item.locoId)?.name ?? "?");
    case "breakdown":
      return strings.news.kinds.breakdown(trainName(state, item.trainId));
    case "washout":
      return strings.news.kinds.washout(nearestStationName(state, item.tile));
    case "trafficJam":
      return strings.news.kinds.trafficJam(nearestStationName(state, item.tile));
    case "noRoute":
      return strings.news.kinds.noRoute(
        trainName(state, item.trainId),
        stationName(state, item.stationId),
      );
    case "cityGrowth":
      return strings.news.kinds.cityGrowth(
        cityName(state, item.cityId),
        strings.city.tierNames[item.tier],
      );
    case "civicInvestment":
      return strings.news.kinds.civicInvestment(cityName(state, item.cityId));
  }
}

export function openNewsPanel(container: HTMLElement, state: GameState): void {
  const items = [...state.news].reverse();
  const body: Node[] =
    items.length === 0
      ? [h("div", { className: "panel-row" }, strings.news.empty)]
      : items.map((item) => h("div", { className: "news-item" }, formatNewsItem(state, item)));

  markAllNewsRead(state);
  openPanel(container, { title: strings.news.title, body });
}

export interface NewsButtonController {
  root: HTMLElement;
  /** Takes the *current* `GameState` explicitly each call (rather than closing over one) so it
   * stays correct across `regenerate()`/new-game, which replaces `main.ts`'s `state` binding with
   * a fresh object entirely — a captured reference here would go stale. */
  refreshBadge: (state: GameState) => void;
}

/** Floating "News" button (SPEC §10.1, bottom-right alongside the Trains button) with an unread
 * count badge. Call `refreshBadge` whenever `state.news`/`newsReadUpTo` might have changed (new
 * items pushed, the panel just marked everything read, or a new game started). */
export function createNewsButton(
  container: HTMLElement,
  onClick: () => void,
): NewsButtonController {
  const badge = h("span", { className: "news-unread-badge" });
  const btn = h(
    "button",
    { className: "news-button", "aria-label": strings.news.button, onClick },
    h("span", null, "📰"),
    h("span", null, strings.news.button),
    badge,
  );
  container.appendChild(btn);

  function refreshBadge(state: GameState): void {
    const count = unreadNewsCount(state);
    badge.textContent = count > 0 ? String(Math.min(count, 99)) : "";
    badge.classList.toggle("visible", count > 0);
  }

  return { root: btn, refreshBadge };
}

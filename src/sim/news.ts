/**
 * News system (SPEC §10.1: "News button with unread badge"; messages listed across §5.3, §7.3,
 * §7.5, §7.6, §7.7 — washouts, no-route, traffic jams, breakdowns, new technology). Sim only stores
 * structured items (kind + ids); src/ui/newsPanel.ts resolves current names from `GameState` and
 * formats the text (CLAUDE.md: user-facing strings live in ui/strings.ts, not here).
 */
import { NEWS_HISTORY_MAX } from "../data/news";
import type { GameState } from "./state";

/** A news item's kind-specific data — `keyof` over a union only yields the *common* keys, so this
 * (not `Omit<NewsItem, "id"|"tick">`) is what `NewsItem` is built from, to keep each kind's own
 * fields (e.g. `trainId` only on the ones about a specific train) type-safe per variant. */
export type NewsPayload =
  | { kind: "newLocomotive"; locoId: string }
  | { kind: "breakdown"; trainId: number }
  | { kind: "washout"; tile: number }
  | { kind: "trafficJam"; tile: number }
  | { kind: "noRoute"; trainId: number; stationId: number };

export type NewsItem = NewsPayload & { id: number; tick: number };

/** Appends a news item (capped at `NEWS_HISTORY_MAX`, oldest dropped first) and queues it for the
 * UI to show as a toast — same drain-once pattern as `GameState.pendingDeliveries`. */
export function pushNews(state: GameState, payload: NewsPayload): NewsItem {
  const item: NewsItem = { ...payload, id: state.nextNewsId++, tick: state.ticks };
  state.news.push(item);
  if (state.news.length > NEWS_HISTORY_MAX) state.news.shift();
  state.pendingNews.push(item);
  return item;
}

/** Number of news items not yet seen in the News panel (SPEC §10.1's unread badge). */
export function unreadNewsCount(state: GameState): number {
  let count = 0;
  for (let i = state.news.length - 1; i >= 0; i--) {
    if ((state.news[i] as NewsItem).id <= state.newsReadUpTo) break;
    count++;
  }
  return count;
}

/** Marks every current news item as read (called when the News panel opens). */
export function markAllNewsRead(state: GameState): void {
  const last = state.news[state.news.length - 1];
  if (last) state.newsReadUpTo = last.id;
}

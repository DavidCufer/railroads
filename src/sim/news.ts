/**
 * News system (SPEC §10.1: "News button with unread badge"; messages listed across §5.3, §7.3,
 * §7.5, §7.6, §7.7 — washouts, no-route, traffic jams, breakdowns, new technology). Sim only stores
 * structured items (kind + ids); src/ui/newsPanel.ts resolves current names from `GameState` and
 * formats the text (CLAUDE.md: user-facing strings live in ui/strings.ts, not here).
 */
import { NEWS_COLLAPSE_DAYS, NEWS_HISTORY_MAX, NEWS_JAM_MIN_DAYS } from "../data/news";
import type { CargoType } from "../data/cargo";
import type { CityTier } from "../data/cities";
import type { GoalTier } from "../data/goals";
import type { GameState } from "./state";
import { HOURS_PER_DAY } from "./time";

/** A news item's kind-specific data — `keyof` over a union only yields the *common* keys, so this
 * (not `Omit<NewsItem, "id"|"tick">`) is what `NewsItem` is built from, to keep each kind's own
 * fields (e.g. `trainId` only on the ones about a specific train) type-safe per variant. */
export type NewsPayload =
  | { kind: "newLocomotive"; locoId: string }
  | { kind: "breakdown"; trainId: number }
  | { kind: "washout"; tile: number }
  | { kind: "slowOrders"; tile: number; edges: number }
  | { kind: "locoWornOut"; trainId: number }
  | { kind: "trafficJam"; tile: number; toStationId?: number | undefined }
  | { kind: "noRoute"; trainId: number; stationId: number }
  | { kind: "undeliverable"; trainId: number; cargo: CargoType; cars: number }
  | { kind: "stationDemolished"; name: string; trains: number }
  | { kind: "fewStops"; trainId: number }
  | { kind: "forcedLoan"; amount: number }
  | { kind: "insolvent"; monthsLeft: number }
  | { kind: "cityGrowth"; cityId: number; tier: CityTier }
  | { kind: "civicInvestment"; cityId: number }
  | { kind: "cityFounded"; cityId: number }
  | { kind: "discovery"; industryId: number }
  | { kind: "goalCompleted"; goalId: string; tier: GoalTier; grant?: number }
  | { kind: "competition"; mode: "road" | "truck" | "air" };

/** `count` is the number of occurrences folded into this item (absent = 1); `tick` is the latest one. */
export type NewsItem = NewsPayload & { id: number; tick: number; count?: number };

/** Nearest station id to `tile`, or -1 — the "place" of tile-anchored news (jams, washouts). */
function nearestStationId(state: GameState, tile: number): number {
  const width = state.map.width;
  const tx = tile % width;
  const ty = Math.floor(tile / width);
  let best = -1;
  let bestD = Infinity;
  for (const s of state.stations) {
    const d = Math.hypot((s.tile % width) - tx, Math.floor(s.tile / width) - ty);
    if (d < bestD) {
      bestD = d;
      best = s.id;
    }
  }
  return best;
}

/** Identity of "the same news about the same place"; null = never collapsed. */
function newsKey(state: GameState, p: NewsPayload): string | null {
  switch (p.kind) {
    case "trafficJam": {
      // One item per station pair (Phase 28B): the nearest station to the jam plus the one the train was heading for.
      const a = nearestStationId(state, p.tile);
      const b = p.toStationId ?? -1;
      return `trafficJam:${Math.min(a, b)}-${Math.max(a, b)}`;
    }
    case "washout":
      return `${p.kind}:${nearestStationId(state, p.tile)}`;
    case "slowOrders":
      return "slowOrders";
    case "breakdown":
      return `breakdown:${p.trainId}`;
    case "locoWornOut":
      return `locoWornOut:${p.trainId}`;
    case "noRoute":
      return `noRoute:${p.trainId}:${p.stationId}`;
    case "undeliverable":
      return `undeliverable:${p.trainId}:${p.cargo}`;
    default:
      return null;
  }
}

/** Appends a news item (capped at `NEWS_HISTORY_MAX`, oldest dropped first) and queues it for the
 * UI to show as a toast — same drain-once pattern as `GameState.pendingDeliveries`. Repeats of the
 * same kind and place within `NEWS_COLLAPSE_DAYS` fold into the earlier item (count + latest tick)
 * without a new toast; a traffic jam repeating within `NEWS_JAM_MIN_DAYS` is dropped outright. */
export function pushNews(state: GameState, payload: NewsPayload): NewsItem {
  const key = newsKey(state, payload);
  if (key !== null) {
    for (let i = state.news.length - 1; i >= 0; i--) {
      const prev = state.news[i] as NewsItem;
      const ageDays = (state.ticks - prev.tick) / HOURS_PER_DAY;
      if (ageDays > NEWS_COLLAPSE_DAYS) break;
      if (newsKey(state, prev) !== key) continue;
      if (payload.kind !== "trafficJam" || ageDays >= NEWS_JAM_MIN_DAYS) {
        prev.count = (prev.count ?? 1) + 1;
        prev.tick = state.ticks;
      }
      return prev;
    }
  }
  const item: NewsItem = { ...payload, id: state.nextNewsId++, tick: state.ticks };
  state.news.push(item);
  if (state.news.length > NEWS_HISTORY_MAX) state.news.shift();
  state.pendingNews.push(item);
  return item;
}

/** Empties the news history (the "Clear all" button). Ids keep counting up. */
export function clearNews(state: GameState): void {
  const last = state.news[state.news.length - 1];
  if (last) state.newsReadUpTo = last.id;
  state.news.length = 0;
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

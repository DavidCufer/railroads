/** Company history screen (Phase 46): charts of net worth, revenue and track by year, then the timeline of key events. */
import { netWorth } from "../sim/finance/ledger";
import { trackKm } from "../sim/history/achievements";
import type { YearSnapshot } from "../sim/history";
import { calendarFromTicks } from "../sim/time";
import type { GameState } from "../sim/state";
import { formatDate, formatMoney } from "./format";
import { describeHistoryEvent } from "./historyStrings";
import { historyChart } from "./historyCharts";
import { h } from "./h";
import { screenHeader } from "./screenHeader";
import { strings } from "./strings";

/** The yearly snapshots plus today as the last point, so the charts end where the company stands. */
function netWorthPoints(state: GameState): YearSnapshot[] {
  const snaps = [...state.history.snapshots];
  const year = calendarFromTicks(state.startYear, state.ticks).year;
  const last = snaps[snaps.length - 1];
  const now: YearSnapshot = {
    year,
    netWorth: netWorth(state),
    revenue: 0,
    trackKm: trackKm(state),
    cash: state.cash,
    loans: state.finance.loans,
  };
  if (last && last.year === year) snaps[snaps.length - 1] = now;
  else snaps.push(now);
  return snaps;
}

const SHOWN_EVENTS = 40;

export function renderHistoryScreen(state: GameState, onBack: () => void): HTMLElement {
  const t = strings.history;
  const points = netWorthPoints(state);
  // A snapshot carries the revenue of the year before it, so the revenue chart runs one year behind and has no live point.
  const revenue = state.history.snapshots
    .slice(1)
    .map((s) => ({ year: s.year - 1, revenue: s.revenue }));
  const km = (n: number): string => `${Math.round(n).toLocaleString("en-US")} km`;
  const charts = [
    {
      key: "nw",
      title: t.charts.netWorth,
      years: points.map((p) => p.year),
      values: points.map((p) => p.netWorth),
      format: formatMoney,
    },
    {
      key: "rev",
      title: t.charts.revenue,
      years: revenue.map((p) => p.year),
      values: revenue.map((p) => p.revenue),
      format: formatMoney,
    },
    {
      key: "km",
      title: t.charts.track,
      years: points.map((p) => p.year),
      values: points.map((p) => p.trackKm),
      format: km,
    },
  ].map((series) => historyChart(series));
  const events = [...state.history.events].reverse().slice(0, SHOWN_EVENTS);
  const timeline =
    events.length === 0
      ? h("div", { className: "history-empty" }, t.none)
      : h(
          "div",
          { className: "history-timeline" },
          ...events.map((e) =>
            h(
              "div",
              { className: `history-event history-event-${e.kind}` },
              h(
                "span",
                { className: "history-event-date" },
                formatDate(calendarFromTicks(state.startYear, e.tick)),
              ),
              h("span", { className: "history-event-text" }, describeHistoryEvent(e)),
            ),
          ),
        );
  return h(
    "div",
    { className: "save-load-screen history-screen", "data-testid": "history-screen" },
    screenHeader(t.title, onBack),
    h(
      "div",
      { className: "new-game-content history-content" },
      h("div", { className: "history-charts" }, ...charts),
      h("div", { className: "history-section-title" }, t.timeline),
      timeline,
    ),
  );
}

/** Opens the history as a full-screen overlay above everything (the game-over card too); Back closes it. */
export function openHistoryScreen(container: HTMLElement, state: GameState): void {
  const overlay = h("div", { className: "overlay-screen" });
  overlay.appendChild(renderHistoryScreen(state, () => overlay.remove()));
  container.appendChild(overlay);
}

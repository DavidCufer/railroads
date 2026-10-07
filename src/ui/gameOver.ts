/** Game-over screen (Phase 39): shown when the company goes bankrupt. A short summary, then load or start over. */
import { netWorth } from "../sim/finance/ledger";
import { calendarFromTicks } from "../sim/time";
import type { GameState } from "../sim/state";
import { formatDate, formatMoney } from "./format";
import { h } from "./h";
import { strings } from "./strings";

export interface GameOverHandlers {
  onLoadLast: () => void;
  onNewGame: () => void;
}

export function openGameOver(
  container: HTMLElement,
  state: GameState,
  handlers: GameOverHandlers,
): HTMLElement {
  const t = strings.gameOver;
  const best = Math.max(netWorth(state), ...state.finance.netWorthHistory.map((s) => s.netWorth));
  const years = Math.floor(state.ticks / (24 * 360));
  const root = h(
    "div",
    { className: "game-over" },
    h(
      "div",
      { className: "game-over-card" },
      h("h2", null, t.title),
      h("p", null, t.line(formatDate(calendarFromTicks(state.startYear, state.ticks)))),
      h(
        "ul",
        null,
        h("li", null, t.years(years)),
        h("li", null, t.bestWorth(formatMoney(best))),
        h("li", null, t.owed(formatMoney(state.finance.loans))),
        h("li", null, t.network(state.trains.length, state.stations.length)),
      ),
      h(
        "div",
        { className: "game-over-buttons" },
        h(
          "button",
          { className: "title-btn title-btn-primary", onClick: handlers.onLoadLast },
          t.loadLast,
        ),
        h("button", { className: "title-btn", onClick: handlers.onNewGame }, t.newGame),
      ),
    ),
  );
  container.appendChild(root);
  return root;
}

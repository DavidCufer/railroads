/** One-line status strip under the top bar (Phase 39): insolvency with the days left, else the panic in force. */
import { activePanic } from "../sim/finance/panics";
import { insolvencyMonthsLeft } from "../sim/finance/credit";
import { creditWarning } from "../sim/finance/warnings";
import { HOURS_PER_DAY } from "../sim/time";
import { formatMoney } from "./format";
import type { GameState } from "../sim/state";
import { h } from "./h";
import { icon } from "./icons";
import { strings } from "./strings";

export interface StatusBanner {
  update: (state: GameState) => void;
}

export function createStatusBanner(container: HTMLElement, onTap: () => void): StatusBanner {
  const text = h("span", null, "");
  const root = h(
    "button",
    { className: "status-banner", hidden: true, onClick: onTap },
    icon("warning", "icon-sm"),
    text,
  );
  container.appendChild(root);
  let last = "";
  // The credit warning prices net worth: once a game day is plenty.
  let warningDay = -1;
  let warningState: GameState | undefined;
  let warningNow: ReturnType<typeof creditWarning>;
  return {
    update: (state) => {
      const months = insolvencyMonthsLeft(state);
      const day = Math.floor(state.ticks / HOURS_PER_DAY);
      if (day !== warningDay || state !== warningState) {
        warningDay = day;
        warningState = state;
        warningNow = creditWarning(state);
      }
      const warning = months === undefined ? warningNow : undefined;
      const panic = months === undefined && !warning ? activePanic(state) : undefined;
      const k = strings.news.kinds;
      const label =
        months !== undefined
          ? strings.finance.insolvent(months)
          : warning?.kind === "overLimit"
            ? k.overLimit(formatMoney(warning.debt), formatMoney(warning.limit))
            : warning
              ? k.startupCreditEnding(warning.monthsLeft, formatMoney(warning.limit))
              : panic
                ? strings.finance.panic(
                    panic.panic.name,
                    Math.round(panic.demandFall * 100),
                    panic.monthsLeft,
                  )
                : "";
      if (label === last) return;
      last = label;
      root.hidden = label === "";
      root.classList.toggle("insolvent", months !== undefined || warning?.kind === "overLimit");
      container.classList.toggle("has-status-banner", label !== "");
      text.textContent = label;
    },
  };
}

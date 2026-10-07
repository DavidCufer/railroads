/** One-line status strip under the top bar (Phase 39): insolvency with the days left, else the panic in force. */
import { activePanic } from "../sim/finance/panics";
import { insolvencyDaysLeft } from "../sim/finance/credit";
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
  return {
    update: (state) => {
      const days = insolvencyDaysLeft(state);
      const panic = days === undefined ? activePanic(state) : undefined;
      const label =
        days !== undefined
          ? strings.finance.insolvent(days)
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
      root.classList.toggle("insolvent", days !== undefined);
      text.textContent = label;
    },
  };
}

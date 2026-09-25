/**
 * Top bar (SPEC §10.1): company cash, date, speed controls, menu button.
 * Speed buttons drive the GameLoop's tick rate directly (SPEC §3: 24 ticks/s at 1x); the date
 * updates from `GameState.ticks` each render.
 */
import type { GameSpeed } from "../render/loop";
import { h } from "./h";
import { strings } from "./strings";
import { formatDate, formatMoney } from "./format";
import type { Calendar } from "../sim/time";

const SPEEDS: GameSpeed[] = [0, 1, 2, 4, 8];
const SPEED_LABELS: Record<GameSpeed, string> = { 0: "⏸", 1: "1×", 2: "2×", 4: "4×", 8: "8×" };

export interface TopBarHandlers {
  onSetSpeed: (speed: GameSpeed) => void;
  getSpeed: () => GameSpeed;
  /** Tapping the cash figure opens the Finance panel (SPEC §10.1). */
  onOpenFinance: () => void;
  /** Tapping ☰ opens the menu (SPEC §10.1: overlay toggles, Phase 9's mini-map toggle). */
  onOpenMenu: () => void;
}

export interface TopBarController {
  root: HTMLElement;
  update: (calendar: Calendar, cash: number) => void;
}

export function createTopBar(container: HTMLElement, handlers: TopBarHandlers): TopBarController {
  const dateEl = h("span", { className: "date" }, "");
  const cashEl = h("button", { className: "cash", onClick: () => handlers.onOpenFinance() }, "");

  const speedButtons = new Map<GameSpeed, HTMLButtonElement>();
  const speedGroup = h(
    "div",
    { className: "speed-group" },
    ...SPEEDS.map((speed) => {
      const btn = h(
        "button",
        {
          "aria-label": speed === 0 ? strings.topBar.pause : SPEED_LABELS[speed],
          onClick: () => {
            handlers.onSetSpeed(speed);
            refreshSpeedButtons();
          },
        },
        SPEED_LABELS[speed],
      );
      speedButtons.set(speed, btn);
      return btn;
    }),
  );

  function refreshSpeedButtons(): void {
    const current = handlers.getSpeed();
    for (const [speed, btn] of speedButtons) {
      btn.classList.toggle("active", speed === current);
    }
  }
  refreshSpeedButtons();

  const root = h(
    "div",
    { className: "top-bar" },
    cashEl,
    dateEl,
    h("div", { className: "spacer" }),
    speedGroup,
    h(
      "button",
      {
        className: "menu-btn",
        "aria-label": strings.topBar.menu,
        onClick: () => handlers.onOpenMenu(),
      },
      "☰",
    ),
  );
  container.appendChild(root);

  return {
    root,
    update: (calendar, cash) => {
      dateEl.textContent = formatDate(calendar);
      cashEl.textContent = formatMoney(cash);
    },
  };
}

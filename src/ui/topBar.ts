/**
 * Top bar (SPEC §10.1): company cash, date, speed controls, menu button.
 * Speed buttons drive the GameLoop's tick rate directly (SPEC §3: 24 ticks/s at 1x); the date
 * updates from `GameState.ticks` each render.
 */
import type { GameSpeed } from "../render/loop";
import { buyableLocomotivesIn } from "../data/trains";
import { cashFlashTone } from "./components/chartMath";
import { h } from "./h";
import { icon, type IconName } from "./icons";
import { strings } from "./strings";
import { formatDate, formatMoney } from "./format";
import type { Calendar } from "../sim/time";
import { onYearReportBadgeChange, yearReportBadge } from "./yearReportBadge";

const SPEEDS: GameSpeed[] = [0, 1, 2, 4, 8];
const SPEED_LABELS: Record<GameSpeed, string> = { 0: "", 1: "1×", 2: "2×", 4: "4×", 8: "8×" };

export interface TopBarHandlers {
  onSetSpeed: (speed: GameSpeed) => void;
  getSpeed: () => GameSpeed;
  /** Tapping the cash figure opens the Finance panel (SPEC §10.1). */
  onOpenFinance: () => void;
  /** Tapping ☰ opens the menu (SPEC §10.1: overlay toggles, Phase 9's mini-map toggle). */
  onOpenMenu: () => void;
  /** Tapping the era badge opens the Roster (STYLE §8.3; Phase 22 wires the real screen). */
  onOpenRoster?: () => void;
  /** Tapping the ⚠ chip jumps to the next stuck train (Phase 28B). */
  onStuckTap?: () => void;
}

export interface TopBarController {
  root: HTMLElement;
  update: (calendar: Calendar, cash: number) => void;
  /** Number of trains needing attention; the chip hides at 0. */
  setStuckCount: (count: number) => void;
}

export function createTopBar(container: HTMLElement, handlers: TopBarHandlers): TopBarController {
  const dateEl = h("span", { className: "date" }, "");
  const cashAmount = h("span", { className: "cash-amount" }, "");
  const cashEl = h(
    "button",
    {
      className: "cash",
      "aria-label": strings.topBar.cash,
      onClick: () => handlers.onOpenFinance(),
    },
    icon("coin", "icon-sm"),
    cashAmount,
  );
  const syncBadge = (): void => {
    cashEl.classList.toggle("has-badge", yearReportBadge() !== null);
  };
  onYearReportBadgeChange(syncBadge);
  const eraIcon = h("span", { className: "era-icon" });
  const eraYear = h("span", { className: "era-year" }, "");
  const eraEl = h(
    "button",
    { className: "era-badge", onClick: () => handlers.onOpenRoster?.() },
    eraIcon,
    eraYear,
  );
  const stuckCount = h("span", { className: "stuck-count" }, "");
  const stuckEl = h(
    "button",
    {
      className: "stuck-chip",
      hidden: true,
      onClick: () => handlers.onStuckTap?.(),
    },
    icon("warning", "icon-sm"),
    stuckCount,
  );
  let lastStuck = 0;
  let lastCash: number | null = null;
  let flashTimer: number | undefined;
  let lastEraKey = "";

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
        speed === 0 ? icon("pause", "icon-sm") : SPEED_LABELS[speed],
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

  /** Era badge: traction icon + intro year of the newest buyable locomotive (STYLE §8.3). */
  function refreshEra(year: number): void {
    const newest = buyableLocomotivesIn(year).reduce<
      ReturnType<typeof buyableLocomotivesIn>[number] | null
    >((best, l) => (!best || l.introYear >= best.introYear ? l : best), null);
    if (!newest) return;
    const key = `${newest.id}`;
    if (key === lastEraKey) return;
    lastEraKey = key;
    const name: IconName = newest.type === "electric" ? "electrify" : newest.type;
    eraIcon.replaceChildren(icon(name, "icon-sm"));
    eraYear.textContent = String(newest.introYear);
    eraEl.setAttribute("aria-label", strings.topBar.era(newest.name, newest.introYear));
  }

  const root = h(
    "div",
    { className: "top-bar" },
    cashEl,
    dateEl,
    eraEl,
    stuckEl,
    h("div", { className: "spacer" }),
    speedGroup,
    h(
      "button",
      {
        className: "menu-btn",
        "aria-label": strings.topBar.menu,
        onClick: () => handlers.onOpenMenu(),
      },
      icon("menu"),
    ),
  );
  container.appendChild(root);

  return {
    root,
    setStuckCount: (count) => {
      if (count === lastStuck) return;
      lastStuck = count;
      stuckEl.hidden = count === 0;
      stuckCount.textContent = String(count);
      stuckEl.setAttribute("aria-label", strings.topBar.stuck(count));
    },
    update: (calendar, cash) => {
      dateEl.textContent = formatDate(calendar);
      cashAmount.textContent = formatMoney(cash);
      const tone = lastCash === null ? null : cashFlashTone(lastCash, cash);
      lastCash = cash;
      if (tone) {
        cashEl.classList.remove("flash-go", "flash-signal");
        void cashEl.offsetWidth; // restart the animation on back-to-back changes
        cashEl.classList.add(`flash-${tone}`);
        window.clearTimeout(flashTimer);
        flashTimer = window.setTimeout(
          () => cashEl.classList.remove("flash-go", "flash-signal"),
          600,
        );
      }
      refreshEra(calendar.year);
    },
  };
}

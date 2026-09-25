/**
 * Yearly report dialog (SPEC §10.2, PLAN Phase 7): summarizes the year that just ended. Opened
 * automatically at the year boundary (src/main.ts, when no other panel is in the way) and from the
 * Finance panel's own button.
 */
import { ledgerExpenses, ledgerNetProfit, ledgerRevenue } from "../data/finance";
import { netWorth } from "../sim/finance/ledger";
import type { GameState } from "../sim/state";
import { calendarFromTicks } from "../sim/time";
import { newlyAvailableLocomotives } from "../sim/tick";
import { h } from "./h";
import { openPanel } from "./panel";
import { strings } from "./strings";
import { formatMoney } from "./format";
import { formatSpeed, loadSettings } from "./settings";

function row(label: string, value: string): HTMLElement {
  return h(
    "div",
    { className: "panel-row" },
    h("span", { className: "label" }, label),
    h("span", null, value),
  );
}

export function openYearlyReport(container: HTMLElement, state: GameState): void {
  // The report opens right after the year-boundary rollover (src/sim/tick.ts), so `lastYear` is
  // the year that just finished and the current calendar year is the new one already underway.
  const year = calendarFromTicks(state.startYear, state.ticks).year - 1;
  const period = state.finance.lastYear;
  const profit = ledgerNetProfit(period);

  const body: Node[] = [
    h(
      "div",
      { className: `yearly-report-headline ${profit >= 0 ? "good" : "bad"}` },
      `${strings.finance.netProfit}: ${formatMoney(profit)}`,
    ),
    row(strings.finance.revenue, formatMoney(ledgerRevenue(period))),
    row(strings.finance.passengers, formatMoney(period.passengers)),
    row(strings.finance.mail, formatMoney(period.mail)),
    row(strings.finance.freight, formatMoney(period.freight)),
    row(strings.finance.expenses, formatMoney(ledgerExpenses(period))),
    row(strings.finance.trainMaintenance, formatMoney(period.trainMaintenance)),
    row(strings.finance.trackMaintenance, formatMoney(period.trackMaintenance)),
    row(strings.finance.stationMaintenance, formatMoney(period.stationMaintenance)),
    row(strings.finance.interest, formatMoney(period.interest)),
    row(strings.finance.construction, formatMoney(period.construction)),
    row(strings.finance.rollingStock, formatMoney(period.rollingStock)),
    row(strings.finance.cash, formatMoney(state.cash)),
    row(strings.finance.netWorth, formatMoney(netWorth(state))),
  ];

  // Tech announcements key off the year that just *started* (src/sim/tick.ts pushes their news at
  // the same boundary, the moment a model actually becomes purchasable), not the reported `year`
  // above (the one whose ledger this report is summarizing) — these are one apart.
  const newLocos = newlyAvailableLocomotives(state, year + 1);
  if (newLocos.length > 0) {
    body.push(h("div", { className: "panel-section-title" }, strings.yearlyReport.newTechnology));
    for (const loco of newLocos) {
      body.push(
        h(
          "div",
          { className: "yearly-report-tech-card" },
          h("span", { className: "train-loco-new-badge" }, strings.trains.newBadge),
          h(
            "span",
            null,
            `${loco.name} (${strings.trains.locoTypes[loco.type]}) — ${formatSpeed(loco.maxSpeedKmh, loadSettings().units)} · ${loco.maxCars} cars · ${formatMoney(loco.cost)}`,
          ),
        ),
      );
    }
  }

  openPanel(container, { title: strings.yearlyReport.title(year), body });
}

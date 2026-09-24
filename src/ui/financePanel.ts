/**
 * Finance panel (SPEC §10.2): cash, loans (borrow/repay), this-year-vs-last-year ledger table, and
 * a simple cash/net-worth line chart from the monthly samples in `GameState.finance.netWorthHistory`.
 */
import { LOAN_INCREMENT, ledgerNetProfit, type LedgerPeriod } from "../data/finance";
import { creditLimit, repayLoan, takeLoan } from "../sim/commands";
import { netWorth } from "../sim/finance/ledger";
import type { NetWorthSample } from "../sim/finance/types";
import type { GameState } from "../sim/state";
import { UI_ACCENT, UI_GOOD } from "../render/palette";
import { h } from "./h";
import { openPanel } from "./panel";
import { strings } from "./strings";
import { formatMoney } from "./format";
import { showToast } from "./toast";
import { openYearlyReport } from "./yearlyReport";

function ledgerRows(period: LedgerPeriod): Node[] {
  return [
    h("div", { className: "panel-section-title" }, strings.finance.revenue),
    row(strings.finance.passengers, formatMoney(period.passengers)),
    row(strings.finance.mail, formatMoney(period.mail)),
    row(strings.finance.freight, formatMoney(period.freight)),
    h("div", { className: "panel-section-title" }, strings.finance.expenses),
    row(strings.finance.trainMaintenance, formatMoney(period.trainMaintenance)),
    row(strings.finance.trackMaintenance, formatMoney(period.trackMaintenance)),
    row(strings.finance.stationMaintenance, formatMoney(period.stationMaintenance)),
    row(strings.finance.breakdownRepairs, formatMoney(period.breakdownRepairs)),
    row(strings.finance.interest, formatMoney(period.interest)),
    row(strings.finance.construction, formatMoney(period.construction)),
    row(strings.finance.rollingStock, formatMoney(period.rollingStock)),
    h(
      "div",
      { className: "panel-row ledger-net-row" },
      h("span", { className: "label" }, strings.finance.netProfit),
      h("span", null, formatMoney(ledgerNetProfit(period))),
    ),
  ];
}

function row(label: string, value: string): HTMLElement {
  return h(
    "div",
    { className: "panel-row" },
    h("span", { className: "label" }, label),
    h("span", null, value),
  );
}

const CHART_W = 300;
const CHART_H = 84;

function drawChart(canvas: HTMLCanvasElement, history: readonly NetWorthSample[]): void {
  const context = canvas.getContext("2d");
  if (!context) return;
  const ctx: CanvasRenderingContext2D = context;
  ctx.clearRect(0, 0, CHART_W, CHART_H);

  if (history.length < 2) {
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.font = "11px sans-serif";
    ctx.fillText("Not enough history yet", 8, CHART_H / 2);
    return;
  }

  const cashVals = history.map((s) => s.cash);
  const netWorthVals = history.map((s) => s.netWorth);
  const all = [...cashVals, ...netWorthVals, 0];
  const min = Math.min(...all);
  const max = Math.max(...all, 1);
  const pad = 4;

  const xAt = (i: number): number => pad + (i / (history.length - 1)) * (CHART_W - pad * 2);
  const yAt = (v: number): number =>
    CHART_H - pad - ((v - min) / (max - min || 1)) * (CHART_H - pad * 2);

  function line(values: number[], color: string): void {
    ctx.beginPath();
    values.forEach((v, i) => (i === 0 ? ctx.moveTo(xAt(i), yAt(v)) : ctx.lineTo(xAt(i), yAt(v))));
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  line(cashVals, UI_GOOD);
  line(netWorthVals, UI_ACCENT);
}

export function openFinancePanel(container: HTMLElement, state: GameState): void {
  const render = (): void => {
    const limit = creditLimit(state);

    const body: Node[] = [
      row(strings.finance.cash, formatMoney(state.cash)),
      row(strings.finance.netWorth, formatMoney(netWorth(state))),
      row(strings.finance.loans, formatMoney(state.finance.loans)),
      row(strings.finance.creditLimit, formatMoney(limit)),
      h(
        "div",
        { className: "panel-row finance-loan-actions" },
        h(
          "button",
          {
            className: "finance-loan-btn",
            disabled: state.finance.loans + LOAN_INCREMENT > limit,
            onClick: () => {
              const result = takeLoan(state, LOAN_INCREMENT);
              if (!result.ok) showToast(container, strings.build.reasons[result.reason], "warn");
              render();
            },
          },
          strings.finance.borrow,
        ),
        h(
          "button",
          {
            className: "finance-loan-btn",
            disabled: state.finance.loans <= 0,
            onClick: () => {
              const result = repayLoan(state, LOAN_INCREMENT);
              if (!result.ok) showToast(container, strings.build.reasons[result.reason], "warn");
              render();
            },
          },
          strings.finance.repay,
        ),
      ),
    ];

    if (state.finance.bankrupt) {
      body.push(
        h(
          "div",
          { className: "panel-row finance-bankrupt-warning" },
          strings.finance.bankruptWarning,
        ),
      );
    }

    body.push(h("div", { className: "panel-section-title" }, strings.finance.chartTitle));
    const canvas = h("canvas", {
      className: "finance-chart",
      width: String(CHART_W),
      height: String(CHART_H),
    });
    body.push(canvas);
    body.push(
      h(
        "div",
        { className: "finance-chart-legend" },
        h("span", { className: "legend-dot", style: { background: UI_GOOD } }, ""),
        h("span", null, strings.finance.chartCash),
        h("span", { className: "legend-dot", style: { background: UI_ACCENT } }, ""),
        h("span", null, strings.finance.chartNetWorth),
      ),
    );

    body.push(h("div", { className: "panel-section-title" }, strings.finance.thisYear));
    body.push(...ledgerRows(state.finance.thisYear));
    body.push(h("div", { className: "panel-section-title" }, strings.finance.lastYear));
    body.push(...ledgerRows(state.finance.lastYear));

    body.push(
      h(
        "div",
        { className: "panel-actions" },
        h(
          "button",
          {
            className: "panel-action-build",
            onClick: () => openYearlyReport(container, state),
          },
          strings.finance.yearlyReport,
        ),
      ),
    );

    openPanel(container, { title: strings.finance.title, body });
    drawChart(canvas, state.finance.netWorthHistory);
  };

  render();
}

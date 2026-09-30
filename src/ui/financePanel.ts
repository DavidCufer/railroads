/**
 * Finance panel (SPEC §10.2, STYLE §8.4): tabs **Overview** (Cash / Net worth / Loans tiles, net-worth
 * sparkline, credit meter) and **This year** (income + cost stacked bars with legends, this/last
 * year switch). Borrow / Repay / Yearly Report live in the footer on both tabs.
 */
import {
  LOAN_INCREMENT,
  ledgerExpenses,
  ledgerInvestments,
  ledgerNetProfit,
  ledgerRevenue,
} from "../data/finance";
import { creditLimit, repayLoan, takeLoan } from "../sim/commands";
import { netWorth } from "../sim/finance/ledger";
import { operatingLast30Days, operatingTrailing } from "../sim/finance/operating";
import type { GameState } from "../sim/state";
import { drawSparkline, stackedBar } from "./components/charts";
import { costParts, incomeParts } from "./components/ledgerParts";
import { footerButton } from "./components/footer";
import { meter } from "./components/meter";
import { section } from "./components/section";
import { statRow, statTile } from "./components/statTile";
import { tabs } from "./components/tabs";
import { h } from "./h";
import { icon } from "./icons";
import { openPanel } from "./panel";
import { strings } from "./strings";
import { formatMoney } from "./format";
import { showToast } from "./toast";
import { openYearlyReport } from "./yearlyReport";
import { yearReportBadge } from "./yearReportBadge";

type FinanceTab = "overview" | "year";
type YearView = "thisYear" | "lastYear";

const CHART_W = 360;
const CHART_H = 48;

/** Headline "Operating profit +$12k / month" with an income-vs-costs bar pair (Phase 24A). */
function operatingSection(state: GameState): HTMLElement {
  const f = strings.finance;
  const avg = operatingTrailing(state);
  const last = operatingLast30Days(state);
  const scale = Math.max(1, avg.income, avg.costs);
  const sign = (v: number): string => `${v >= 0 ? "+" : "−"}${formatMoney(Math.abs(v))}`;
  const bar = (label: string, value: number, tone: "go" | "signal"): HTMLElement =>
    h(
      "div",
      { className: "op-bar-row" },
      h("span", { className: "op-bar-label" }, label),
      meter(value, scale, tone, formatMoney(value)),
    );
  return h(
    "div",
    { className: "section operating" },
    h(
      "div",
      { className: `operating-headline ${avg.profit >= 0 ? "tone-go" : "tone-signal"}` },
      h("span", { className: "panel-section-title" }, f.operatingProfit),
      h("b", { className: "operating-value" }, `${sign(avg.profit)} ${f.perMonth}`),
    ),
    bar(f.operatingIncome, avg.income, "go"),
    bar(f.operatingCosts, avg.costs, "signal"),
    h(
      "div",
      { className: "operating-notes" },
      h("span", null, `${f.avg12(avg.months)} · ${f.last30}: ${sign(last.profit)}`),
      h(
        "span",
        { title: f.investmentsNote },
        `${f.investments}: ${formatMoney(avg.investments)} ${f.perMonth}`,
      ),
    ),
  );
}

export function openFinancePanel(container: HTMLElement, state: GameState): void {
  let tab: FinanceTab = "overview";
  let yearView: YearView = "thisYear";

  const render = (): void => {
    const limit = creditLimit(state);
    const loans = state.finance.loans;
    let canvas: HTMLCanvasElement | null = null;
    const body: Node[] = [];

    if (tab === "overview") {
      body.push(operatingSection(state));
      body.push(
        statRow(
          statTile({
            icon: "coin",
            value: formatMoney(state.cash),
            caption: strings.finance.cash,
            tone: state.cash < 0 ? "signal" : "brass",
          }),
          statTile({
            icon: "trendUp",
            value: formatMoney(netWorth(state)),
            caption: strings.finance.netWorth,
          }),
          statTile({
            icon: "finance",
            value: formatMoney(loans),
            caption: strings.finance.loans,
            tone: loans > 0 ? "signal" : undefined,
          }),
        ),
      );
      canvas = h("canvas", {
        className: "finance-chart",
        width: String(CHART_W * 2),
        height: String(CHART_H * 2),
        role: "img",
        "aria-label": strings.finance.chartTitle,
      });
      body.push(
        canvas,
        h(
          "div",
          { className: "credit-row", title: strings.finance.creditNote },
          h("span", { className: "panel-section-title" }, strings.finance.creditLimit),
          meter(
            loans,
            limit,
            loans / Math.max(1, limit) > 0.8 ? "signal" : "brass",
            `${formatMoney(loans)} / ${formatMoney(limit)}`,
          ),
        ),
      );
      if (state.finance.bankrupt) {
        body.push(
          h("div", { className: "finance-bankrupt-warning" }, strings.finance.bankruptWarning),
        );
      }
    } else {
      const period = yearView === "thisYear" ? state.finance.thisYear : state.finance.lastYear;
      const profit = ledgerNetProfit(period);
      body.push(
        h(
          "div",
          { className: "segmented-row year-switch" },
          ...(["thisYear", "lastYear"] as const).map((view) =>
            h(
              "button",
              {
                className: `segmented-btn${yearView === view ? " active" : ""}`,
                onClick: () => {
                  yearView = view;
                  render();
                },
              },
              view === "thisYear" ? strings.finance.thisYear : strings.finance.lastYear,
            ),
          ),
        ),
        statRow(
          statTile({
            icon: "arrowUp",
            value: formatMoney(ledgerRevenue(period)),
            caption: strings.finance.revenue,
            tone: "go",
          }),
          statTile({
            icon: "arrowDown",
            value: formatMoney(ledgerExpenses(period)),
            caption: strings.finance.expenses,
            tone: "signal",
          }),
          statTile({
            icon: "coin",
            value: formatMoney(profit),
            caption: strings.finance.netProfit,
            tone: profit >= 0 ? "go" : "signal",
          }),
        ),
        section(strings.finance.revenue, [
          stackedBar(incomeParts(period), strings.finance.noneYet),
        ]),
        section(
          strings.finance.expenses,
          [stackedBar(costParts(period), strings.finance.noneYet)],
          `${strings.finance.investments}: ${formatMoney(ledgerInvestments(period))}`,
        ),
      );
    }

    const footer: Node[] = [
      footerButton({
        kind: "primary",
        icon: "arrowUp",
        label: strings.finance.borrow,
        title: strings.finance.borrowTip,
        className: "finance-loan-btn",
        disabled: loans + LOAN_INCREMENT > limit,
        onClick: () => {
          const result = takeLoan(state, LOAN_INCREMENT);
          if (!result.ok) showToast(container, strings.build.reasons[result.reason], "warn");
          render();
        },
      }),
      footerButton({
        icon: "arrowDown",
        label: strings.finance.repay,
        title: strings.finance.repayTip,
        className: "finance-loan-btn",
        disabled: loans <= 0,
        onClick: () => {
          const result = repayLoan(state, LOAN_INCREMENT);
          if (!result.ok) showToast(container, strings.build.reasons[result.reason], "warn");
          render();
        },
      }),
      footerButton({
        icon: "news",
        label: strings.finance.yearlyReport,
        className: `fbtn-wide${yearReportBadge() !== null ? " has-badge" : ""}`,
        onClick: () => openYearlyReport(container, state),
      }),
    ];

    openPanel(container, {
      title: strings.finance.title,
      subtitle: strings.finance.subtitle,
      thumb: icon("finance"),
      tabs: tabs(
        [
          { id: "overview", label: strings.finance.tabs.overview, icon: "trendUp" },
          { id: "year", label: strings.finance.tabs.year, icon: "news" },
        ] as const,
        tab,
        (id) => {
          tab = id;
          render();
        },
      ),
      body,
      footer,
      key: `finance:${tab}`,
    });
    if (canvas)
      drawSparkline(
        canvas,
        state.finance.netWorthHistory.map((s) => s.netWorth),
      );
  };

  render();
}

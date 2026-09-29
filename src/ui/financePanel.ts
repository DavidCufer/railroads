/**
 * Finance panel (SPEC §10.2, STYLE §8.4): tabs **Overview** (Cash / Net worth / Loans tiles, net-worth
 * sparkline, credit meter) and **This year** (income + cost stacked bars with legends, this/last
 * year switch). Borrow / Repay / Yearly Report live in the footer on both tabs.
 */
import { LOAN_INCREMENT, ledgerExpenses, ledgerNetProfit, ledgerRevenue } from "../data/finance";
import { creditLimit, repayLoan, takeLoan } from "../sim/commands";
import { netWorth } from "../sim/finance/ledger";
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

type FinanceTab = "overview" | "year";
type YearView = "thisYear" | "lastYear";

const CHART_W = 360;
const CHART_H = 48;

export function openFinancePanel(container: HTMLElement, state: GameState): void {
  let tab: FinanceTab = "overview";
  let yearView: YearView = "thisYear";

  const render = (): void => {
    const limit = creditLimit(state);
    const loans = state.finance.loans;
    let canvas: HTMLCanvasElement | null = null;
    const body: Node[] = [];

    if (tab === "overview") {
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
        section(strings.finance.expenses, [stackedBar(costParts(period), strings.finance.noneYet)]),
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
        className: "fbtn-wide",
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

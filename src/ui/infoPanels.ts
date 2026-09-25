/** Info-mode panels: tap a city or industry to see its basic info (SPEC §10.2, PLAN Phase 3). */
import { CARGO, type CargoType } from "../data/cargo";
import { INDUSTRIES } from "../data/industries";
import { CIVIC_INVESTMENT_COOLDOWN_YEARS } from "../data/cities";
import type { Industry } from "../sim/economy/types";
import { cityAcceptance, citySupply } from "../sim/economy/cityStats";
import { civicInvestment, computeCivicInvestmentPlan } from "../sim/commands";
import type { GameState } from "../sim/state";
import { calendarFromTicks, DAYS_PER_YEAR, HOURS_PER_DAY } from "../sim/time";
import { h } from "./h";
import { openPanel } from "./panel";
import { showToast } from "./toast";
import { strings } from "./strings";
import { formatMoney, formatPopulation } from "./format";

export function row(label: string, value: string): HTMLElement {
  return h(
    "div",
    { className: "panel-row" },
    h("span", { className: "label" }, label),
    h("span", null, value),
  );
}

/** Picks readable black/white chip text against an arbitrary `#rrggbb` background. */
export function chipTextColor(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.55 ? "#1a1a1a" : "#f4f1e8";
}

export function cargoChip(
  cargo: CargoType,
  amount: number,
  suffix = "",
  dimmed = false,
): HTMLElement {
  const def = CARGO[cargo];
  return h(
    "span",
    {
      className: `chip${dimmed ? " chip-dim" : ""}`,
      style: { background: def.color, color: chipTextColor(def.color) },
    },
    `${def.name} ${amount}${suffix}`,
  );
}

export function openCityPanel(container: HTMLElement, state: GameState, cityId: number): void {
  const render = (): void => {
    const city = state.cities.find((c) => c.id === cityId);
    if (!city) return;
    const currentYear = calendarFromTicks(state.startYear, state.ticks).year;
    const supply = citySupply(city);
    const accepts = cityAcceptance(city, currentYear);
    const acceptEntries = Object.entries(accepts) as Array<[CargoType, number]>;
    const growth = state.cityGrowth.get(cityId);

    const body: Node[] = [
      row(strings.city.tier, strings.city.tierNames[city.tier]),
      row(strings.city.population, formatPopulation(city.population)),
      row(
        strings.city.growthTrend,
        growth?.lastServed ? strings.city.growing : strings.city.stagnant,
      ),
      h("div", { className: "panel-section-title" }, "Supplies (full coverage, per month)"),
      h(
        "div",
        { className: "panel-row" },
        cargoChip("passengers", supply.passengers),
        cargoChip("mail", supply.mail),
      ),
      h("div", { className: "panel-section-title" }, "Accepts (points, full footprint)"),
      h(
        "div",
        { className: "panel-row", style: { flexWrap: "wrap" } },
        ...acceptEntries.map(([cargo, points]) => cargoChip(cargo, points)),
      ),
    ];

    const plan = computeCivicInvestmentPlan(state, cityId);
    const lastTick = growth?.lastCivicInvestmentTick;
    const onCooldown = !plan.valid && lastTick !== undefined;
    let civicLabel = `${strings.city.civicInvestment} (${formatMoney(plan.cost)})`;
    if (onCooldown) {
      const yearsSince = (state.ticks - lastTick) / (HOURS_PER_DAY * DAYS_PER_YEAR);
      const yearsLeft = Math.max(0, Math.ceil(CIVIC_INVESTMENT_COOLDOWN_YEARS - yearsSince));
      civicLabel = `${strings.city.civicInvestment} — ${strings.city.civicInvestmentCooldown(yearsLeft)}`;
    }
    body.push(h("div", { className: "panel-section-title" }, strings.city.civicInvestment));
    body.push(h("div", { className: "panel-row" }, strings.city.civicInvestmentDesc));
    body.push(
      h(
        "button",
        {
          className: "city-civic-investment-btn",
          disabled: !plan.valid || plan.cost > state.cash,
          onClick: () => {
            const result = civicInvestment(state, cityId);
            if (!result.ok) {
              showToast(container, strings.build.reasons[result.reason], "warn");
              return;
            }
            render();
          },
        },
        civicLabel,
      ),
    );

    openPanel(container, { title: city.name, body });
  };

  render();
}

export function openIndustryPanel(container: HTMLElement, industry: Industry): void {
  const def = INDUSTRIES[industry.type];
  const produces = Object.entries(def.produces) as Array<[CargoType, number]>;
  const consumes = Object.entries(def.consumes) as Array<[CargoType, number]>;

  const body: Node[] = [row(strings.industry.availableFrom, String(def.era))];

  if (produces.length > 0) {
    body.push(h("div", { className: "panel-section-title" }, strings.industry.produces));
    body.push(
      h(
        "div",
        { className: "panel-row", style: { flexWrap: "wrap" } },
        ...produces.map(([cargo, amount]) => cargoChip(cargo, amount, strings.industry.perMonth)),
      ),
    );
  }
  if (consumes.length > 0) {
    body.push(h("div", { className: "panel-section-title" }, strings.industry.consumes));
    body.push(
      h(
        "div",
        { className: "panel-row", style: { flexWrap: "wrap" } },
        ...consumes.map(([cargo, amount]) => cargoChip(cargo, amount, strings.industry.perMonth)),
      ),
    );
  }

  openPanel(container, { title: def.name, body });
}

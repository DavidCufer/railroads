/** Info-mode panels: tap a city or industry to see its basic info (SPEC §10.2, PLAN Phase 3). */
import { CARGO, type CargoType } from "../data/cargo";
import { INDUSTRIES } from "../data/industries";
import type { City, Industry } from "../sim/economy/types";
import { cityAcceptance, citySupply } from "../sim/economy/cityStats";
import { h } from "./h";
import { openPanel } from "./panel";
import { strings } from "./strings";
import { formatPopulation } from "./format";

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

export function openCityPanel(container: HTMLElement, city: City, currentYear: number): void {
  const supply = citySupply(city);
  const accepts = cityAcceptance(city, currentYear);
  const acceptEntries = Object.entries(accepts) as Array<[CargoType, number]>;

  openPanel(container, {
    title: city.name,
    body: [
      row(strings.city.tier, strings.city.tierNames[city.tier]),
      row(strings.city.population, formatPopulation(city.population)),
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
    ],
  });
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

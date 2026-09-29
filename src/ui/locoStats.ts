/** Engine stat block (STYLE §11.1): icon + label + bar relative to the best engine on offer + value.
 * Shared by the buy wizard's hero, the roster detail and the new-engine card. */
import type { LocomotiveDef } from "../data/trains";
import { h } from "./h";
import { icon, type IconName } from "./icons";
import { formatMoney } from "./format";
import { pips } from "./components/meter";
import { strings } from "./strings";
import { formatSpeed, loadSettings, type Units } from "./settings";

export interface BestOf {
  maxSpeedKmh: number;
  power: number;
  maxCars: number;
  cost: number;
  maintenancePerYear: number;
}

export function bestOf(list: readonly LocomotiveDef[]): BestOf {
  const best: BestOf = { maxSpeedKmh: 1, power: 1, maxCars: 1, cost: 1, maintenancePerYear: 1 };
  for (const l of list) {
    best.maxSpeedKmh = Math.max(best.maxSpeedKmh, l.maxSpeedKmh);
    best.power = Math.max(best.power, l.power);
    best.maxCars = Math.max(best.maxCars, l.maxCars);
    best.cost = Math.max(best.cost, l.cost);
    best.maintenancePerYear = Math.max(best.maintenancePerYear, l.maintenancePerYear);
  }
  return best;
}

interface StatRow {
  key: string;
  icon: IconName;
  label: string;
  value: string;
  /** 0..1 bar fill, or null for pips. */
  fraction: number | null;
  pipsValue?: number;
  /** Bars that are costs read in signal tint instead of brass. */
  cost?: boolean;
}

function statRow(r: StatRow): HTMLElement {
  return h(
    "div",
    { className: "eng-stat", "data-stat": r.key },
    icon(r.icon, "icon-sm eng-stat-icon"),
    h("span", { className: "eng-stat-label" }, r.label),
    r.fraction === null
      ? h("div", { className: "eng-stat-bar" }, pips(r.pipsValue ?? 0))
      : h(
          "div",
          { className: "eng-stat-bar" },
          h(
            "div",
            { className: "meter" },
            h("div", {
              className: `meter-fill${r.cost ? " tone-steel" : ""}`,
              style: { width: `${Math.round(Math.max(0.04, Math.min(1, r.fraction)) * 100)}%` },
            }),
          ),
        ),
    h("span", { className: "eng-stat-value tabular" }, r.value),
  );
}

/** `price` is the era-adjusted purchase price; `keys` picks a subset (new-engine card shows 3). */
export function engineStats(
  def: LocomotiveDef,
  best: BestOf,
  price: number,
  keys?: readonly string[],
  units: Units = loadSettings().units,
): HTMLElement {
  const s = strings.trains.stats;
  const rows: StatRow[] = [
    {
      key: "speed",
      icon: "gauge",
      label: s.speed,
      value: formatSpeed(def.maxSpeedKmh, units),
      fraction: def.maxSpeedKmh / best.maxSpeedKmh,
    },
    {
      key: "power",
      icon: "power",
      label: s.power,
      value: String(def.power),
      fraction: def.power / best.power,
    },
    {
      key: "cars",
      icon: "trains",
      label: s.maxCars,
      value: String(def.maxCars),
      fraction: def.maxCars / best.maxCars,
    },
    {
      key: "reliability",
      icon: "reliability",
      label: s.reliability,
      value: "",
      fraction: null,
      pipsValue: def.reliability,
    },
    {
      key: "price",
      icon: "coin",
      label: s.price,
      value: formatMoney(price),
      fraction: def.cost / best.cost,
      cost: true,
    },
    {
      key: "running",
      icon: "wrench",
      label: s.running,
      value: `${formatMoney(def.maintenancePerYear)}${s.perYear}`,
      fraction: def.maintenancePerYear / best.maintenancePerYear,
      cost: true,
    },
  ];
  return h(
    "div",
    { className: "eng-stats" },
    ...rows.filter((r) => !keys || keys.includes(r.key)).map(statRow),
  );
}

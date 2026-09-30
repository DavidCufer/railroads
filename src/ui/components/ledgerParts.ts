import { CARGO } from "../../data/cargo";
import type { LedgerPeriod } from "../../data/finance";
import { formatMoney } from "../format";
import { strings } from "../strings";
import type { StackedBarPart } from "./charts";

/** Income by kind, in the cargo colours of SPEC §8.1 (freight uses the goods crate colour). */
export function incomeParts(period: LedgerPeriod): StackedBarPart[] {
  return [
    {
      key: "passengers",
      value: period.passengers,
      color: CARGO.passengers.color,
      label: strings.finance.passengers,
      display: formatMoney(period.passengers),
    },
    {
      key: "mail",
      value: period.mail,
      color: CARGO.mail.color,
      label: strings.finance.mail,
      display: formatMoney(period.mail),
    },
    {
      key: "freight",
      value: period.freight,
      color: CARGO.goods.color,
      label: strings.finance.freight,
      display: formatMoney(period.freight),
    },
  ];
}

/** Costs in graded steel-blue tints (Phase 28B: the old `--signal` reds clashed with the Mail colour). */
const COST_TINTS = [
  "#6f8aa6",
  "#8aa1b8",
  "#5a7490",
  "#a4b6c8",
  "#485d75",
  "#c0cdda",
  "#374a5e",
  "#7d95ad",
  "#9bb0c4",
  "#506a85",
  "#b2c2d2",
];

export function costParts(period: LedgerPeriod): StackedBarPart[] {
  const f = strings.finance;
  const rows: Array<[string, string, number]> = [
    ["trainMaintenance", f.trainMaintenance, period.trainMaintenance],
    ["crewWages", f.crewWages, period.crewWages],
    ["trackMaintenance", f.trackMaintenance, period.trackMaintenance],
    ["trackWear", f.trackWear, period.trackWear],
    ["stationMaintenance", f.stationMaintenance, period.stationMaintenance],
    ["propertyTax", f.propertyTax, period.propertyTax],
    ["incomeTax", f.incomeTax, period.incomeTax],
    ["breakdownRepairs", f.breakdownRepairs, period.breakdownRepairs],
    ["interest", f.interest, period.interest],
    ["construction", f.investmentLabel(f.construction), period.construction],
    ["rollingStock", f.investmentLabel(f.rollingStock), period.rollingStock],
  ];
  return rows.map(([key, label, value], i) => ({
    key,
    value,
    label,
    color: COST_TINTS[i % COST_TINTS.length]!,
    display: formatMoney(value),
    ...(key in f.costNotes ? { note: f.costNotes[key as keyof typeof f.costNotes] } : {}),
  }));
}

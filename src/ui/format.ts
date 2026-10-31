/** Shared number/date formatting for UI display (SPEC §8.1: "$12k", "$1.2M"). */
import type { Calendar } from "../sim/time";
import { MONTH_NAMES } from "../sim/time";

export function formatMoney(n: number): string {
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) {
    const millions = abs / 1_000_000;
    return `${sign}$${millions >= 10 ? Math.round(millions) : millions.toFixed(1)}M`;
  }
  if (abs >= 1_000) return `${sign}$${Math.round(abs / 1000)}k`;
  return `${sign}$${Math.round(abs)}`;
}

/** Phase 74: money is shown per year everywhere; this turns a monthly figure into the yearly one ("$1.6k"). */
export function formatYearly(monthly: number): string {
  const yearly = monthly * 12;
  // Small yearly sums keep a decimal ("$3.3k"): a whole "$3k" would hide a tenth of the figure.
  if (Math.abs(yearly) >= 1_000 && Math.abs(yearly) < 10_000)
    return `${yearly < 0 ? "-" : ""}$${(Math.abs(yearly) / 1000).toFixed(1)}k`;
  return formatMoney(yearly);
}

/** "+$12k" / "−$3k" — always signed, for profit figures. */
export function formatSigned(n: number): string {
  return `${n < 0 ? "−" : "+"}${formatMoney(Math.abs(n))}`;
}

export function formatDate(calendar: Calendar): string {
  const month = MONTH_NAMES[calendar.month - 1] ?? "";
  return `${month.slice(0, 3)} ${calendar.day}, ${calendar.year}`;
}

export function formatPopulation(n: number): string {
  if (n >= 1_000) return `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k`;
  return `${n}`;
}

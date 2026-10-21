/** Phase 64: the bench headline. Goals and bands are on yearly operating profit and revenue, never cash or net worth
 * (owner: "we want players to spend money to build things, not hoard it"). Reads the `YEAR` rows a bot prints. */
export function yearFigures(
  rows: readonly string[],
  startYear: number,
  yearIndex: number,
): { revenueM: number; profitM: number } | null {
  const row = rows.find((r) => r.startsWith(`YEAR ${startYear + yearIndex - 1} `));
  if (!row) return null;
  const rev = /rev (-?[\d.]+)M/.exec(row);
  const profit = /opprofit (-?[\d.]+)M/.exec(row);
  return rev && profit ? { revenueM: Number(rev[1]), profitM: Number(profit[1]) } : null;
}

export function headline(rows: readonly string[], startYear: number): string {
  const at = (i: number): { revenueM: number; profitM: number } | null =>
    yearFigures(rows, startYear, i);
  const fmt = (k: "revenueM" | "profitM"): string =>
    [5, 10, 16].map((i) => at(i)?.[k].toFixed(2) ?? "-").join(" / ");
  return `HEADLINE operating profit $M y5/y10/y16 ${fmt("profitM")} | revenue $M y5/y10/y16 ${fmt("revenueM")}`;
}

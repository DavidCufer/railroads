/** Phase 84: prints every goal that follows the strong-player medians (for the old -> new table). */
import { REGION_GOALS, strongPlayerAmount } from "../../src/data/goals";
import { scenarioById } from "../../src/data/scenarios";
const f = (n: number): string => (n / 1e6).toFixed(2) + "M";
for (const [r, gs] of Object.entries(REGION_GOALS))
  for (const g of gs)
    if (g.def.type === "annualProfit" || g.def.type === "annualRevenue")
      console.log(`${r} ${g.tier} ${g.def.type} by ${g.def.byYear}: ${f(g.def.amount)}`);
for (const s of ["semmering", "coalTrieste", "transcontinental", "silverRush", "panic1873"]) {
  const d = scenarioById(s);
  if (d) console.log(`scenario ${s} stars ${JSON.stringify(d.stars)}`);
}
for (const start of [1830, 1840, 1870, 1900, 1930, 1950]) {
  const gy = start + 50;
  console.log(
    `random ${start} gold (year 16, in ${gy} money): profit ${f(strongPlayerAmount("profit", 16, gy, start))}  revenue ${f(strongPlayerAmount("revenue", 16, gy, start))}`,
  );
}
console.log(
  `reference y5 profit by era: ${[1840, 1870, 1900, 1930, 1950].map((e) => e + " " + f(strongPlayerAmount("profit", 5, e + 4, e))).join(", ")}`,
);

/** Summarise `JSON=` rows of engineCosts.ts: best payback engine per era, line and consist label, and which case each
 * engine wins. `npx tsx tools/bench/engineCostsSummary.ts <rows.jsonl>` */
import { readFileSync } from "node:fs";

interface Row {
  start: number;
  line: string;
  engine: string;
  cars: number;
  label: string;
  payback: number;
}

const rows = readFileSync(process.argv[2] as string, "utf8")
  .split("\n")
  .filter(Boolean)
  .map((l) => JSON.parse(l) as Row);
const labels = ["1", "3", "6", "max"];
const wins = new Map<string, string[]>();
console.log("| era | line | " + labels.join(" | ") + " |");
console.log("|---|---|" + labels.map(() => "---").join("|") + "|");
for (const start of [...new Set(rows.map((r) => r.start))]) {
  for (const line of [...new Set(rows.map((r) => r.line))]) {
    const cells: string[] = [];
    for (const label of labels) {
      const c = rows.filter((r) => r.start === start && r.line === line && r.label === label);
      if (c.length === 0) {
        cells.push("-");
        continue;
      }
      const b = c.reduce((a, x) => (x.payback < a.payback ? x : a));
      cells.push(
        Number.isFinite(b.payback) ? `${b.engine.split("-")[0]} ${b.payback.toFixed(1)}` : "never",
      );
      if (Number.isFinite(b.payback)) {
        const k = b.engine.split("-")[0] as string;
        wins.set(k, [...(wins.get(k) ?? []), `${start}/${line}/${label}`]);
      }
    }
    console.log(`| ${start} | ${line} | ${cells.join(" | ")} |`);
  }
}
console.log("\nWins per engine:");
for (const [e, w] of [...wins].sort()) console.log(`- ${e}: ${w.length} (${w.join(", ")})`);

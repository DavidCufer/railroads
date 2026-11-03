/**
 * Benchmark: a strong, owner-like player (PLAN Phase 59 item 2). Keep `goodPlayer.ts` as the cautious reference.
 * `npx tsx tools/bench/strongPlayer.ts [region] [startYear] [difficulty] [endYear] [seed]`.
 *
 * Policy: spend cash as soon as a profitable build is available (reserve: one month of operating costs); every ten days
 * rank the candidate projects by payback (track + stations + the first train over the train's yearly profit, from
 * `paybackEstimate.ts`) and build the best affordable one:
 *   - passenger lines through towns (a new town extends the nearest line, as the owner does, or gets its own line),
 *   - freight lines: raw producers and processors to the industries or towns that take their cargo, Terminals and
 *     "wait for full load" where the output is big,
 * then add trains wherever cargo is piling up at a line's stations, double the track of busy lines, and borrow for a good
 * project when cash is short (never past a third of net worth). Output: the same text lines as goodPlayer (`NW`, `MINCASH`,
 * `BANKRUPT`) plus a `YEAR` row per year with the books and `IDLE20` (the first year cash > 20 % of net worth at a
 * year end, the owner's "cannot build as fast as I make money").
 *
 * Phase 77 (V2; the Phase 59-69 bot is kept as `strongPlayerV1.ts`): plays more like a good human.
 *   - engine per route by the route's own payback, and engines are replaced when a much better one appears;
 *   - consists are right-sized from the trains' load history (cars off trains under ~40 % full, cars on where cargo piles);
 *   - the long-haul chain (silver / uranium) is a candidate project of its own;
 *   - feeder lines: a small town into the nearest big station;
 *   - full-load waits at big freight sources, double track only where trains were seen waiting for a block.
 */
import "./p79Env";
import "./pairEnv";
import { createStrongBot } from "./strongBot";
import * as commands from "../../src/sim/commands";
import { createGameState } from "../../src/sim/state";
import {} from "../../src/sim/tick";
import {} from "../../src/sim/track/pathfind";
import {} from "../../src/data/trains";
import {} from "../../src/data/industries";
import {} from "../../src/data/trains";
import {} from "../../src/sim/trains/loading";
import {} from "../../src/sim/trains/headway";
import {} from "../../src/data/economy";
import { STATION_TYPE_DEFS } from "../../src/data/stations";
import {
  ledgerOperatingCosts,
  ledgerOperatingProfit,
  ledgerRevenue,
  type LedgerPeriod,
} from "../../src/data/finance";
import { activePanic } from "../../src/sim/finance/panics";
import { netWorth } from "../../src/sim/finance/ledger";
import { headline } from "./headline";
import {} from "../../src/sim/economy/land";
import {} from "../../src/sim/economy/cityStats";
import {} from "../../src/sim/time";
import {} from "../../src/sim/finance/costs";
import type {} from "../../src/sim/track/types";
import {} from "./layUp";
import { booksProfit } from "../../src/sim/trains/profit";
import {} from "./fixBridges";
import {} from "./paybackEstimate";
import type {} from "../../src/sim/economy/types";
import type {} from "../../src/sim/stations/types";
import type {} from "../../src/data/stations";

const region = (process.argv[2] ?? "central-eu") as "central-eu";
const startYear = Number(process.argv[3] ?? 1900);
const difficulty = (process.argv[4] ?? "normal") as "easy" | "normal" | "hard";
const endYear = Number(process.argv[5] ?? startYear + 16);
const seed = Number(process.argv[6] ?? 1);

const T0 = Date.now();
const state = createGameState({ seed, region, startYear, difficulty });
const bot = createStrongBot(state);
const { lines, layUp } = bot;
const year = bot.year;
const simMsNow = (): number => bot.simMs();
void lines;

/** The year's running costs by ledger line, in $k, for the cost-split table (trainMaintenance = fuel, servicing, car upkeep). */
function splitOf(p: LedgerPeriod): string {
  const keys = [
    "trainMaintenance",
    "crewWages",
    "trackMaintenance",
    "trackWear",
    "stationMaintenance",
    "administration",
    "propertyTax",
    "breakdownRepairs",
    "interest",
    "incomeTax",
  ] as const;
  return keys
    .map((k) => `${k}=${Math.round(((p as unknown as Record<string, number>)[k] ?? 0) / 1000)}`)
    .join(",");
}

let minCash = Infinity;
let trackTiles = 0;
const report: string[] = [];
const rows: string[] = [];
let idle20: number | null = null;
let idleMonths = 0;
let months = 0;
const wanted = new Set([1, 2, 3, 4, 5, 8, 10, 13, 16, 20, 25, 30]);

for (let y = 1; startYear + y <= endYear + 0; y++) {
  for (let m = 0; m < 12; m++) {
    bot.monthA();
    if (process.env["DIAG"] && m === 10) {
      const rev: Record<string, number> = {};
      for (const t of state.trains) {
        const k = t.cars[0]?.cargoType ?? "none";
        rev[k] = (rev[k] ?? 0) + t.profit.thisYear.revenue;
      }
      const sup: string[] = [];
      for (const st of state.stations) {
        const e = state.stationEconomy.get(st.id);
        const bits = Object.entries(e?.supply ?? {}).filter(
          ([c]) => !["passengers", "mail"].includes(c),
        );
        if (bits.length)
          sup.push(
            `st${st.id}:` + bits.map(([c, v]) => `${c}=${Math.round(v as number)}`).join(","),
          );
      }
      console.log(
        `DIAG ${year()} delivered ${JSON.stringify(state.cargoDeliveredThisYear)} trainRev ${JSON.stringify(Object.fromEntries(Object.entries(rev).map(([k, v]) => [k, Math.round(v / 1000)])))} supply ${sup.join(" ")}`,
      );
    }
    bot.monthB(m);
    if (process.env["TRACE"])
      console.log(
        year(),
        `m${m}`,
        `cash ${Math.round(state.cash / 1e3)}k loans ${Math.round(state.finance.loans / 1e3)}k NW ${Math.round(netWorth(state) / 1e3)}k neg ${state.finance.negativeCashMonths} trains ${state.trains.length} laid ${state.trains.filter((t) => t.laidUp).length} rev ${Math.round(ledgerRevenue(state.finance.monthHistory.at(-1) ?? state.finance.thisMonth) / 1e3)}k wages ${Math.round((state.finance.monthHistory.at(-1)?.crewWages ?? 0) / 1e3)}k serv ${Math.round((state.finance.monthHistory.at(-1)?.trainMaintenance ?? 0) / 1e3)}k track ${Math.round((state.finance.monthHistory.at(-1)?.trackMaintenance ?? 0) / 1e3)}k stn ${Math.round((state.finance.monthHistory.at(-1)?.stationMaintenance ?? 0) / 1e3)}k int ${Math.round((state.finance.monthHistory.at(-1)?.interest ?? 0) / 1e3)}k panic ${activePanic(state)?.panic.name ?? "-"} limit ${Math.round(commands.creditLimit(state) / 1e3)}k`,
      );
    minCash = Math.min(minCash, state.cash);
    months++;
    if (state.cash > 0.2 * netWorth(state) && state.ticks > 24 * 360 * 2) idleMonths++;
    if (state.finance.bankrupt) {
      report.push(`BANKRUPT in ${year()}`);
      break;
    }
  }
  const last = state.finance.lastYear;
  const rev = ledgerRevenue(last);
  const op = ledgerOperatingCosts(last);
  trackTiles = state.trackGraph.allEdges().length;
  const nw = netWorth(state);
  if (idle20 === null && state.cash > 0.2 * nw && y >= 2) idle20 = startYear + y;
  rows.push(
    `YEAR ${startYear + y} cash ${(state.cash / 1e6).toFixed(2)}M NW ${(nw / 1e6).toFixed(2)}M trains ${state.trains.length} edges ${trackTiles} stations ${state.stations.length} rev ${(rev / 1e6).toFixed(2)}M opcost ${(op / 1e6).toFixed(2)}M opratio ${rev > 0 ? (op / rev).toFixed(2) : "-"} opprofit ${(ledgerOperatingProfit(last) / 1e6).toFixed(2)}M capital ${(state.finance.capitalInvested / 1e6).toFixed(2)}M loans ${(state.finance.loans / 1e6).toFixed(1)}M idle ${((100 * Math.max(0, state.cash)) / Math.max(1, nw)).toFixed(0)}% stock ${((nw - state.cash + state.finance.loans - 0.5 * state.finance.capitalInvested) / 1e6).toFixed(2)}M split ${splitOf(last)}`,
  );
  // Phase 79: LINES=1 prints the completed year's books split by line type (trunk passenger / feeder / freight by cargo / chain).
  if (process.env["LINES"]) {
    const agg = new Map<
      string,
      { n: number; trains: number; tiles: number; rev: number; profit: number }
    >();
    for (const l of lines) {
      const kind = l.chain
        ? "chain"
        : l.feeder
          ? "feeder"
          : l.kind === "pax"
            ? "trunk"
            : `freight:${l.cargo}`;
      const a = agg.get(kind) ?? { n: 0, trains: 0, tiles: 0, rev: 0, profit: 0 };
      a.n++;
      a.tiles += l.path.length;
      for (const id of l.trains) {
        const t = state.trains.find((q) => q.id === id);
        if (!t) continue;
        a.trains++;
        a.rev += t.profit.lastYear.revenue;
        a.profit += booksProfit(t.profit.lastYear);
      }
      agg.set(kind, a);
    }
    for (const [k, a] of agg)
      rows.push(
        `LINES ${startYear + y} ${k} lines ${a.n} trains ${a.trains} tiles ${a.tiles} rev ${(a.rev / 1e3).toFixed(0)}k trainProfit ${(a.profit / 1e3).toFixed(0)}k revPerTile ${(a.rev / Math.max(1, a.tiles)).toFixed(0)} revPerTrain ${(a.rev / Math.max(1, a.trains) / 1e3).toFixed(0)}k`,
      );
  }
  if (wanted.has(y))
    report.push(
      [
        `Jan ${startYear + y}`,
        `cash ${(state.cash / 1e6).toFixed(2)}M`,
        `NW ${(nw / 1e6).toFixed(2)}M`,
        `rev ${(rev / 1e6).toFixed(2)}M`,
        `loans ${(state.finance.loans / 1e6).toFixed(1)}M`,
        `trains ${state.trains.length}`,
        `stations ${state.stations.length}`,
      ].join(" · "),
    );
  if (state.finance.bankrupt) break;
}
void STATION_TYPE_DEFS;
console.log(`# strong ${region} ${startYear} ${difficulty} seed ${seed}`);
console.log(report.join("\n"));
console.log(rows.join("\n"));
// Phase 64: the headline is yearly operating profit and revenue (completed years 5 / 10 / 16), not cash or net worth.
console.log(headline(rows, startYear));
console.log(
  `TIME total ${Math.round((Date.now() - T0) / 1000)}s sim ${Math.round(simMsNow() / 1000)}s`,
);
console.log(
  `LAYUP laidUp ${layUp.stats.laidUp} returned ${layUp.stats.returned} stillLaid ${state.trains.filter((t) => t.laidUp).length} of ${state.trains.length}`,
);
console.log(`MINCASH ${(minCash / 1e6).toFixed(2)}`);
console.log(
  `IDLE20 ${idle20 ?? "never"} idleMonthShare ${(idleMonths / Math.max(1, months)).toFixed(2)}`,
);
const ly = state.finance.lastYear as unknown as Record<string, number>;
console.log(
  "last year ledger:",
  Object.entries(ly)
    .filter(([, v]) => typeof v === "number" && Math.abs(v) > 1000)
    .map(([k, v]) => `${k} ${(v / 1e3).toFixed(0)}k`)
    .join(", "),
);
console.log(
  `lines ${lines.filter((l) => l.kind === "pax").length} pax, ${lines.filter((l) => l.kind === "freight").length} freight`,
);
// Phase 72: DUMP_SAVE=<path> writes the final state as a save file (store screenshots load it in the browser).
if (process.env["DUMP_SAVE"]) {
  const { exportSaveJson } = await import("../../src/save/index");
  const { writeFileSync } = await import("node:fs");
  writeFileSync(process.env["DUMP_SAVE"], exportSaveJson(state));
}

/** Phase 56 item 3: payback of every buyable engine, per era, line length and consist, on the balance fixtures
 * (tests/sim/balanceRoutes.ts: one straight plain line between two towns of `POP` people, one train, three seeds' mean of
 * the last of three years). Profit is the train's own books (fares less crew, fuel, upkeep, repairs and the track wear it
 * causes, renewal share included); the track and the two stations cost the same whatever engine runs on them and are left out.
 * Payback years = train price (engine + cars) / profit per year; "-" when the train does not earn its keep.
 * Lines: short 12 tiles (60 km), medium 48 tiles (240 km, Venice-Milan), long 72 tiles (360 km); consists 1, 3 and 6 cars (and the engine's `maxCars` when it hauls more than 6 or fewer than 6); freight: a coal mine to a steel mill over 240 km. Electric engines run on an
 * electrified line (the catenary is not in the price).
 * `npx tsx tools/bench/engineCosts.ts`, env STARTS=1840,1870,... LINES=short,medium,long,coal POP=20000 SEEDS=1,2,3
 * JSON=<file> appends one JSON row per case. */
import { appendFileSync } from "node:fs";
import { buyableLocomotivesIn, type LocomotiveDef } from "../../src/data/trains";
import { buildRoute, tickDays, type RouteSpec } from "../../tests/sim/balanceRoutes";
import { WEAR_ROUTINE_SHARE } from "../../src/data/economy";

const starts = (process.env["STARTS"] ?? "1840,1870,1900,1930,1950").split(",").map(Number);
const lineNames = (process.env["LINES"] ?? "short,medium,long,coal").split(",");
const POP = Number(process.env["POP"] ?? 20_000);
const seeds = (process.env["SEEDS"] ?? "1,2,3").split(",").map(Number);
const json = process.env["JSON"];
const LINES: Record<string, { km: number; cargo: "passengers" | "coal" }> = {
  short: { km: 60, cargo: "passengers" },
  medium: { km: 240, cargo: "passengers" },
  long: { km: 360, cargo: "passengers" },
  coal: { km: 240, cargo: "coal" },
};
const k = (v: number): string => `${Math.round(v / 1000)}k`;

export interface Case {
  start: number;
  line: string;
  engine: string;
  cars: number;
  price: number;
  upkeep: number;
  profit: number;
  payback: number;
}

function consists(loco: LocomotiveDef): Array<[string, number]> {
  const out: Array<[string, number]> = [];
  for (const n of [1, 3, 6]) if (n <= loco.maxCars) out.push([String(n), n]);
  if (loco.maxCars > 6) out.push(["max", loco.maxCars]);
  // an engine that cannot haul 6 cars is judged at its own full train
  else if (loco.maxCars < 6 && !out.some(([, n]) => n === loco.maxCars))
    out.push(["max", loco.maxCars]);
  return out;
}

export function runCase(start: number, line: string, loco: LocomotiveDef, cars: number): Case {
  const l = LINES[line]!;
  const spec: RouteSpec = {
    cargo: l.cargo,
    km: l.km,
    loco: loco.id,
    year: start,
    cars,
    ...(l.cargo === "passengers"
      ? { population: POP, tier: "town" as const }
      : { producer: "coalMine" as const, acceptor: "steelMill" as const }),
    ...(loco.type === "electric" ? { electrified: true } : {}),
  };
  let price = 0;
  let upkeep = 0;
  let profit = 0;
  for (const seed of seeds) {
    const { state } = buildRoute({ ...spec, seed });
    tickDays(state, 3 * 360);
    const t = state.trains[0]!;
    const b = t.profit.lastYear;
    // the renewal share of wear is paid when the track is relaid: charge it to the train that caused it
    const wear = (b.wear ?? 0) / WEAR_ROUTINE_SHARE;
    price += t.purchasePrice / seeds.length;
    upkeep += (b.running + (b.wages ?? 0) + wear + b.repairs) / seeds.length;
    profit += (b.revenue - b.running - (b.wages ?? 0) - wear - b.repairs) / seeds.length;
  }
  const payback = profit > 0 ? price / profit : Infinity;
  return { start, line, engine: loco.id, cars, price, upkeep, profit, payback };
}

if (process.argv[1]?.endsWith("engineCosts.ts")) {
  for (const start of starts) {
    for (const line of lineNames) {
      const locos = buyableLocomotivesIn(start).filter(
        (l) => LINES[line]!.cargo === "passengers" || !l.passengerMailOnly,
      );
      console.log(
        `\n### ${start}, Normal; ${line} line (${LINES[line]!.km} km, ${LINES[line]!.cargo}${LINES[line]!.cargo === "passengers" ? `, towns of ${POP}` : ""})`,
      );
      console.log(
        "| engine | kmh | t | cars | train price | costs /yr (upkeep, fuel, repairs, wages, wear) | profit /yr | payback yrs |",
      );
      console.log("|---|---|---|---|---|---|---|---|");
      const best = new Map<string, number>();
      const rows: Case[] = [];
      for (const loco of locos)
        for (const [label, cars] of consists(loco)) {
          if (rows.some((x) => x.engine === loco.id && x.cars === cars)) continue;
          const c = runCase(start, line, loco, cars);
          rows.push(c);
          if (json) appendFileSync(json, JSON.stringify({ ...c, label }) + "\n");
          best.set(loco.id, Math.min(best.get(loco.id) ?? Infinity, c.payback));
          console.log(
            `| ${loco.id} | ${loco.maxSpeedKmh} | ${loco.weightTonnes} | ${cars} (${label}) | ${k(c.price)} | ${k(c.upkeep)} | ${k(c.profit)} | ${Number.isFinite(c.payback) ? c.payback.toFixed(1) : "never"} |`,
          );
        }
    }
  }
}

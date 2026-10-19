/** Phase 57 item 3a: a coal line on hill terrain, payback of every buyable engine by consist length.
 * The mine stands in a valley (elevation 2), the line climbs a ridge of 5 elevation steps in 5 tiles (the game's own
 * steepest hill grade, one step per tile) and runs down to the plain 28 tiles later; the steel mill is 240 km away on
 * the plain. Loaded trains climb the ridge, empties descend it.
 * Output is held at `mult` x the base 60 t a month (3 car-loads) by resetting the growth multiplier every day: a mine
 * served well grows 8 % a year (`INDUSTRY_GROWTH_RATE_ANCHORS`), so x2.16 is the mine after 10 years, x3 (the cap,
 * `INDUSTRY_GROWTH_MULT_MAX`) after 14. `MINES=3` puts three such mines in one loading station's catchment.
 * Profit is the train's own books as in engineCosts.ts (fares less crew, fuel, upkeep, repairs and track wear).
 * `npx tsx tools/bench/freight.ts`, env STARTS=1870,1900,1930,1950 MULTS=1,2.16,3 MINES=1,3 FACILITY=depot|terminal CARS=3,6,10,14,max SEEDS=1,2 FLAT=1 */
import { buyableLocomotivesIn, type LocomotiveDef } from "../../src/data/trains";
import { WEAR_ROUTINE_SHARE } from "../../src/data/economy";
import { advanceHour, buildRoute } from "../../tests/sim/balanceRoutes";

const starts = (process.env["STARTS"] ?? "1870,1900,1930,1950").split(",").map(Number);
const mults = (process.env["MULTS"] ?? "1,2.16,3").split(",").map(Number);
const mineCounts = (process.env["MINES"] ?? "1,3").split(",").map(Number);
const carSpecs = (process.env["CARS"] ?? "3,6,10,14,max").split(",");
const seeds = (process.env["SEEDS"] ?? "1,2").split(",").map(Number);
const flat = Boolean(process.env["FLAT"]);
/** FACILITY=depot (default: a Depot, 40 t pile, "auto" loading) or terminal (a Terminal at both ends, a Warehouse at the
 * mine, "wait for full load" there): what a player hauling long trains builds. */
const facility = process.env["FACILITY"] ?? "depot";
const KM = 240;

/** Valley at 2, a five-step ridge over x = 3..7, then down one step per four tiles to the plain. */
function ridge(x: number): number {
  if (x <= 2) return 2;
  if (x <= 7) return 2 + (x - 2);
  if (x <= 9) return 7;
  return Math.max(0, 7 - Math.floor((x - 9) / 4));
}

export interface FreightCase {
  engine: string;
  cars: number;
  price: number;
  profit: number;
  payback: number;
  tonsPerYear: number;
}

export function runFreight(
  start: number,
  loco: LocomotiveDef,
  cars: number,
  mult: number,
  mines: number,
): FreightCase {
  let price = 0;
  let profit = 0;
  let tons = 0;
  for (const seed of seeds) {
    const { state } = buildRoute({
      cargo: "coal",
      km: KM,
      loco: loco.id,
      year: start,
      cars,
      seed,
      producer: "coalMine",
      acceptor: "steelMill",
      outputMult: mult,
      extraProducers: mines - 1,
      ...(flat ? {} : { elevationByX: ridge }),
      ...(facility === "terminal"
        ? { stationType: "terminal" as const, warehouse: true, loadRule: "fullLoad" as const }
        : {}),
      ...(loco.type === "electric" ? { electrified: true } : {}),
    });
    const ids = state.industries.filter((i) => i.type === "coalMine").map((i) => i.id);
    for (let day = 0; day < 3 * 360; day++) {
      for (const id of ids) state.industryEconomy.get(id)!.growthMult = mult;
      for (let h = 0; h < 24; h++) advanceHour(state);
    }
    const t = state.trains[0]!;
    const b = t.profit.lastYear;
    const wear = (b.wear ?? 0) / WEAR_ROUTINE_SHARE;
    price += t.purchasePrice / seeds.length;
    profit += (b.revenue - b.running - (b.wages ?? 0) - wear - b.repairs) / seeds.length;
    tons += (state.cargoDeliveredBestYear.coal ?? 0) / seeds.length;
  }
  return {
    engine: loco.id,
    cars,
    price,
    profit,
    payback: profit > 0 ? price / profit : Infinity,
    tonsPerYear: tons,
  };
}

if (process.argv[1]?.endsWith("freight.ts")) {
  for (const start of starts) {
    for (const mines of mineCounts)
      for (const mult of mults) {
        console.log(
          `\n### ${start} Normal; ${mines} mine(s) at x${mult} (${Math.round(60 * mult * mines)} t/month, ${Math.round((60 * mult * mines) / 20)} car-loads); ${flat ? "flat" : "ridge"} ${KM} km`,
        );
        console.log("| engine | t | power | cars | train price | profit /yr | payback yrs |");
        console.log("|---|---|---|---|---|---|---|");
        const rows: FreightCase[] = [];
        for (const loco of buyableLocomotivesIn(start).filter((l) => !l.passengerMailOnly)) {
          const ns = new Set<number>();
          for (const c of carSpecs) {
            const n = c === "max" ? loco.maxCars : Number(c);
            if (n <= loco.maxCars) ns.add(n);
          }
          for (const n of [...ns].sort((a, b) => a - b)) {
            const r = runFreight(start, loco, n, mult, mines);
            rows.push(r);
            console.log(
              `| ${loco.id} | ${loco.weightTonnes} | ${loco.power} | ${n} | ${Math.round(r.price / 1000)}k | ${Math.round(r.profit / 1000)}k | ${Number.isFinite(r.payback) ? r.payback.toFixed(1) : "never"} |`,
            );
          }
        }
        const best = rows.reduce((a, b) => (b.payback < a.payback ? b : a));
        const bestProfit = rows.reduce((a, b) => (b.profit > a.profit ? b : a));
        console.log(
          `**best payback: ${best.engine} x${best.cars} ${best.payback.toFixed(1)} yrs; best profit: ${bestProfit.engine} x${bestProfit.cars} ${Math.round(bestProfit.profit / 1000)}k/yr**`,
        );
      }
  }
}

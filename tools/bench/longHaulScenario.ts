/**
 * The long-haul chain scenario (Phase 40) shared by `tools/bench/longHaul.ts` and the balance test: ore -> processor ->
 * customer on an L-shaped line with legs of `legTiles` tiles, built with the game's own commands and run with the real
 * tick loop. Terrain is plains with three tiles in ten hills (dearer track); terminals at the mine and the smelter (a
 * depot's 40 t pile would throttle a mine of this size), an ordinary station at the customer. The best non-electric
 * locomotive of the year pulls up to 6 cars.
 */
import { buildStation, buildTrack, buyTrain, setOrders } from "../../src/sim/commands";
import { buyableLocomotivesIn } from "../../src/data/trains";
import { LONG_HAUL_CHAINS } from "../../src/data/industries";
import { advanceOneHour } from "../../src/sim/tick";
import { makeTestMap, makeTestState, tileAt } from "../../tests/sim/track/helpers";
import type { Industry } from "../../src/sim/economy/types";
import type { CargoType } from "../../src/data/cargo";

export interface LongHaulRun {
  startYear: number;
  legTiles: number;
  oreTrains: number;
  barTrains: number;
  years: number;
  chain: "silver" | "uranium";
  /** Printed once a month when set. */
  trace?: boolean;
}

export interface Result {
  oreTrains: number;
  barTrains: number;
  cars: number;
  locoName: string;
  kmh: number;
  invested: number;
  flows: number[];
  payback: string;
  lateReturn: number;
  revenue: number;
}

export function runLongHaul(cfg: LongHaulRun): Result {
  const { startYear, legTiles: L, oreTrains, barTrains, years, chain: chainId } = cfg;
  const chain = LONG_HAUL_CHAINS[chainId];
  const ore: CargoType = chainId === "silver" ? "silverOre" : "uraniumOre";
  const bars: CargoType = chainId === "silver" ? "silverBars" : "enrichedUranium";
  const W = L + 8;
  const rows = Array.from({ length: L + 8 }, (_, y) =>
    Array.from({ length: W }, (_, x) => ((x * 7 + y * 13) % 10 < 3 ? "h" : "p")).join(""),
  );
  const map = makeTestMap(rows);
  const state = makeTestState(map, { startYear, cash: 1e9 });
  const at = (x: number, y: number): number => tileAt(map, x, y);
  const add = (id: number, type: Industry["type"], x: number, y: number): void => {
    map.industryId[at(x, y)] = id;
    state.industries.push({ id, type, x, y });
  };
  add(0, chain.mine, 2, 3);
  add(1, chain.processor, 3 + L, 12);
  add(2, chain.sink, 3 + L, 4 + L);
  state.industryEconomy.set(0, { inputStock: {}, monthlyOutput: { [ore]: 80 } });
  state.industryEconomy.set(1, { inputStock: {}, monthlyOutput: {} });
  state.industryEconomy.set(2, { inputStock: {}, monthlyOutput: {} });

  const path: number[] = [];
  for (let x = 2; x <= L - 1; x++) path.push(at(x, 4)); // a right angle is a sharp turn: two 45-degree steps
  for (let k = 1; k <= 3; k++) path.push(at(L - 1 + k, 4 + k));
  for (let y = 8; y <= 4 + L; y++) path.push(at(2 + L, y));
  const built = buildTrack(state, path);
  if (!built.ok) throw new Error(`track: ${JSON.stringify(built)}`);
  // Terminals at the mine and the smelter (storage 150 vs a depot's 40: a depot would throttle a mine of this size),
  // an ordinary station at the customer.
  for (const [x, y, type] of [
    [2, 4, "terminal"],
    [2 + L, 12, "terminal"],
    [2 + L, 4 + L, "station"],
  ] as const)
    if (!buildStation(state, at(x, y), type).ok) throw new Error(`station ${x},${y}`);
  const [mineSt, plantSt, sinkSt] = state.stations as unknown as Array<{
    id: number;
    hasEngineShed: boolean;
  }>;
  mineSt!.hasEngineShed = true;
  plantSt!.hasEngineShed = true;

  const cands = buyableLocomotivesIn(startYear).filter(
    (l) => l.type !== "electric" && !l.passengerMailOnly,
  );
  const strong = cands.filter((l) => l.maxCars >= 6);
  const pool = (strong.length > 0 ? strong : cands).sort(
    (p, q) => q.maxSpeedKmh - p.maxSpeedKmh || p.cost - q.cost,
  );
  const loco = pool[0]!;
  const n = Math.min(loco.maxCars, 6);
  const orders = (a: number, b: number) => [
    { stationId: a, rule: "auto" as const },
    { stationId: b, rule: "auto" as const },
  ];
  for (let i = 0; i < oreTrains; i++) {
    if (!buyTrain(state, mineSt!.id, loco.id, Array(n).fill(ore)).ok) throw new Error("ore train");
    setOrders(state, state.trains[state.trains.length - 1]!.id, orders(mineSt!.id, plantSt!.id));
  }
  for (let i = 0; i < barTrains; i++) {
    if (!buyTrain(state, plantSt!.id, loco.id, Array(n).fill(bars)).ok)
      throw new Error("bar train");
    setOrders(state, state.trains[state.trains.length - 1]!.id, orders(plantSt!.id, sinkSt!.id));
  }
  const invested = 1e9 - state.cash;
  const base = state.cash;
  let payback = "never";
  let prev = base;
  const flows: number[] = [];
  for (let y = 1; y <= years; y++) {
    for (let h = 0; h < 360 * 24; h++) {
      advanceOneHour(state);
      if (cfg.trace && h % (30 * 24) === 0) {
        const e1 = state.industryEconomy.get(1)!;
        console.log(
          `y${y} m${Math.floor(h / 720)} mine out ${JSON.stringify(state.industryEconomy.get(0)!.monthlyOutput)} smelter stock ${JSON.stringify(e1.inputStock)} out ${JSON.stringify(e1.monthlyOutput)} pile@smelter ${Math.round(state.stationCargo.get(plantSt!.id)?.[bars]?.amount ?? 0)} pile@mine ${Math.round(state.stationCargo.get(mineSt!.id)?.[ore]?.amount ?? 0)}`,
        );
      }
    }
    flows.push(state.cash - prev);
    prev = state.cash;
    if (payback === "never" && state.cash - base >= invested) payback = String(y);
  }
  const late = flows.slice(Math.floor(years / 2));
  return {
    oreTrains,
    barTrains,
    cars: n,
    locoName: loco.name,
    kmh: loco.maxSpeedKmh,
    invested,
    flows,
    payback,
    lateReturn: late.reduce((a, b) => a + b, 0) / late.length / invested,
    revenue: state.trains.reduce((sum, t) => sum + t.profit.lifetime.revenue, 0),
  };
}

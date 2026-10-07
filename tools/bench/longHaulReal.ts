/**
 * The long-haul chain on a real generated map (Phase 41; `longHaul.ts` is the flat-plains scenario). Builds mine ->
 * processor -> customer with the game's own commands (two stations at the processor, one per leg, terminals at the mine
 * and the processor, double track optional), buys the best non-electric engine and runs the real tick loop.
 *
 * `npx tsx tools/bench/longHaulReal.ts [startYear=1950] [region=central-eu] [seed=1] [ore=2] [bars=2] [years=10] [double=0]`
 *
 * Prints what the build cost and the net cash of each year after it. Used to compare the chain's return across eras.
 */
import {
  buildEngineShed,
  buildStation,
  buildTrack,
  buyTrain,
  computeBuildPlan,
  setOrders,
  upgradeTrack,
} from "../../src/sim/commands";
import {
  LONG_HAUL_CHAINS,
  LONG_HAUL_OUTPUT_ANCHORS,
  longHaulChainFor,
} from "../../src/data/industries";
import { buyableLocomotivesIn } from "../../src/data/trains";
import { landPrices } from "../../src/sim/economy/land";
import { createGameState } from "../../src/sim/state";
import { advanceOneHour } from "../../src/sim/tick";
import { findBuildPath } from "../../src/sim/track/pathfind";
import { fixWeightBridges } from "./fixBridges";
import type { CargoType } from "../../src/data/cargo";
import type { Industry } from "../../src/sim/economy/types";

// URANIUM_MULT=<x> overrides the uranium mine's output multiple for tuning runs.
if (process.env["URANIUM_MULT"])
  for (const anchor of LONG_HAUL_OUTPUT_ANCHORS.uranium as unknown as Array<[number, number]>)
    anchor[1] = Number(process.env["URANIUM_MULT"]);
const startYear = Number(process.argv[2] ?? 1950);
const region = (process.argv[3] ?? "central-eu") as "central-eu";
const seed = Number(process.argv[4] ?? 1);
const oreTrains = Number(process.argv[5] ?? 2);
const barTrains = Number(process.argv[6] ?? 2);
const years = Number(process.argv[7] ?? 10);
const double = Number(process.argv[8] ?? 0) === 1;

const state = createGameState({ seed, region, startYear, difficulty: "normal" });
state.cash = 1e9;
const chainDef = longHaulChainFor(startYear);
const chain = LONG_HAUL_CHAINS[chainDef.id];
const find = (type: string): Industry => {
  const i = state.industries.find((x) => x.type === type);
  if (!i) throw new Error(`no ${type} on the map`);
  return i;
};
const mine = find(chain.mine);
const plant = find(chain.processor);
const sink = find(chain.sink);
const ore: CargoType = chainDef.id === "silver" ? "silverOre" : "uraniumOre";
const bars: CargoType = chainDef.id === "silver" ? "silverBars" : "enrichedUranium";
const W = state.map.width;
const dist = (a: { x: number; y: number }, b: { x: number; y: number }): number =>
  Math.hypot(a.x - b.x, a.y - b.y);

/** Land tiles around an industry, nearest to `toward` first. */
function around(ind: Industry, toward: { x: number; y: number }, radius = 2): number[] {
  const out: Array<{ t: number; d: number }> = [];
  for (let dy = -radius; dy <= radius; dy++)
    for (let dx = -radius; dx <= radius; dx++) {
      const x = ind.x + dx;
      const y = ind.y + dy;
      if (x < 1 || y < 1 || x >= W - 1 || y >= state.map.height - 1) continue;
      const t = y * W + x;
      if (state.map.industryId[t] !== -1 && state.map.industryId[t] !== undefined) continue;
      out.push({ t, d: dist({ x, y }, toward) });
    }
  return out.sort((a, b) => a.d - b.d).map((o) => o.t);
}

function leg(
  from: Industry,
  to: Industry,
  fromType: "terminal" | "station",
  toType: "terminal" | "station",
  skip: Set<number>,
): [number, number] {
  const taken = new Set(state.trackGraph.allNodes());
  const stationTiles = new Set(state.stations.map((s) => s.tile));
  for (const ta of around(from, to)
    .filter((t) => !taken.has(t) && !skip.has(t))
    .slice(0, 12))
    for (const tb of around(to, from)
      .filter((t) => !taken.has(t) && !skip.has(t))
      .slice(0, 12)) {
      const path = findBuildPath(state.map, ta, tb, startYear, {
        respectTurns: { graph: state.trackGraph, stationTiles },
        land: landPrices(state),
      });
      if (!path || path.length < 4) continue;
      if (!computeBuildPlan(state, path).valid) continue;
      const before = state.cash;
      if (!buildTrack(state, path).ok) continue;
      const a = buildStation(state, ta, fromType);
      const b = buildStation(state, tb, toType);
      if (!a.ok || !b.ok) {
        state.cash = before; // an abandoned attempt: its track stays, its price does not count against the chain
        continue;
      }
      if (double) upgradeTrack(state, path);
      const ids = state.stations.filter((s) => s.tile === ta || s.tile === tb);
      return [ids.find((s) => s.tile === ta)!.id, ids.find((s) => s.tile === tb)!.id];
    }
  throw new Error(`no route from ${from.type} to ${to.type}`);
}

const [mineSt, oreSt] = leg(mine, plant, "terminal", "terminal", new Set());
const [barSt, sinkSt] = leg(
  plant,
  sink,
  "terminal",
  "station",
  new Set([...state.stations.map((s) => s.tile)]),
);
for (const id of [mineSt, barSt]) buildEngineShed(state, id);

const cands = buyableLocomotivesIn(startYear).filter(
  (l) => l.type !== "electric" && !l.passengerMailOnly,
);
const strong = cands.filter((l) => l.maxCars >= 6);
const loco = (strong.length > 0 ? strong : cands).sort(
  (p, q) => q.maxSpeedKmh - p.maxSpeedKmh || p.cost - q.cost,
)[0]!;
const n = Math.min(loco.maxCars, 6);
const orders = (a: number, b: number) => [
  { stationId: a, rule: "auto" as const },
  { stationId: b, rule: "auto" as const },
];
for (let i = 0; i < oreTrains; i++) {
  if (!buyTrain(state, mineSt, loco.id, Array(n).fill(ore)).ok) throw new Error("ore train");
  setOrders(state, state.trains[state.trains.length - 1]!.id, orders(mineSt, oreSt));
}
for (let i = 0; i < barTrains; i++) {
  if (!buyTrain(state, barSt, loco.id, Array(n).fill(bars)).ok) throw new Error("bar train");
  setOrders(state, state.trains[state.trains.length - 1]!.id, orders(barSt, sinkSt));
}
const invested = 1e9 - state.cash;
const flows: number[] = [];
let prev = state.cash;
for (let y = 1; y <= years; y++) {
  for (let h = 0; h < 360 * 24; h++) {
    advanceOneHour(state);
    if (h % (30 * 24) === 0) fixWeightBridges(state);
  }
  flows.push(state.cash - prev);
  prev = state.cash;
}
const late = flows.slice(2);
const avg = late.reduce((a, b) => a + b, 0) / late.length;
console.log(
  `${chainDef.id} ${startYear} ${region} seed ${seed}: legs ${Math.round(dist(mine, plant))} + ${Math.round(dist(plant, sink))} tiles, ${oreTrains}+${barTrains} trains of ${n} (${loco.name} ${loco.maxSpeedKmh} km/h)${double ? ", double track" : ""}\n` +
    `  invested $${(invested / 1e6).toFixed(2)}M; net cash by year ($M): ${flows.map((f) => (f / 1e6).toFixed(2)).join(" ")}\n` +
    `  years 3+ average $${(avg / 1e6).toFixed(2)}M a year = ${((avg / invested) * 100).toFixed(0)} %/yr`,
);

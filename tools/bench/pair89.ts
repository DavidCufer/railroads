/**
 * Phase 89: how many trains fill ONE busy pair of towns, per passenger model. `npx tsx tools/bench/pair89.ts <startYear> <model> [maxTrains=8] [years=3] [cars=4]`.
 * The two biggest central-eu towns 25-45 tiles apart, a station in each, N trains of the era's fastest engine. Prints one `PAIR` JSON
 * line per N: last-year passenger revenue, people carried, the pair's demand a month, platform (pile in trains, share of days a full
 * train waited), load factor, revenue per train and the marginal revenue of the last train.
 */
import "./p79Env";
import * as commands from "../../src/sim/commands";
import { createGameState } from "../../src/sim/state";
import { advanceOneHour } from "../../src/sim/tick";
import { findBuildPath } from "../../src/sim/track/pathfind";
import { buyableLocomotivesIn } from "../../src/data/trains";
import { getStationFlow } from "../../src/sim/stations/flow";
import { carCapacity } from "../../src/sim/trains/capacity";
import { estimateRoundTripDays } from "../../src/sim/trains/headway";
import { octileTileDistance } from "../../src/sim/trains/geometry";

const startYear = Number(process.argv[2] ?? 1870);
const model = process.argv[3] ?? "route"; // a label only since Phase 90
const maxN = Number(process.argv[4] ?? 8);
const years = Number(process.argv[5] ?? 3);
const nCarsArg = Number(process.argv[6] ?? 4);

function setup(n: number) {
  const state = createGameState({ seed: 1, region: "central-eu", startYear, difficulty: "normal" });
  state.cash = 50_000_000;
  const ctr = (c: (typeof state.cities)[number]): number => c.anchorY * state.map.width + c.anchorX;
  let best: [number, number] | undefined;
  let bestScore = 0;
  for (const a of state.cities)
    for (const b of state.cities) {
      if (a.id >= b.id) continue;
      const d = octileTileDistance(ctr(a), ctr(b), state.map.width);
      if (d < 25 || d > 45) continue;
      const score = Math.min(a.population, b.population);
      if (score > bestScore) {
        bestScore = score;
        best = [a.id, b.id];
      }
    }
  const A = state.cities[best![0]]!;
  const B = state.cities[best![1]]!;
  const ok = (r: unknown): boolean => (r as { ok: boolean }).ok;
  const path = findBuildPath(state.map, ctr(A), ctr(B), startYear, {})!;
  if (!ok(commands.buildTrack(state, path))) throw new Error("track");
  commands.upgradeTrack(state, path);
  if (
    !ok(commands.buildStation(state, ctr(A), "station")) ||
    !ok(commands.buildStation(state, ctr(B), "station"))
  )
    throw new Error("station");
  const sa = state.stations[0]!;
  const sb = state.stations[1]!;
  const loco = buyableLocomotivesIn(startYear)
    .filter((l) => l.type !== "electric" && !l.mailOnly)
    .sort((x, y) => y.maxSpeedKmh - x.maxSpeedKmh)[0]!;
  const nCars = Math.min(nCarsArg, loco.maxCars);
  const cars = Array.from({ length: nCars }, () => "passengers" as const);
  // Trains start so that the departures from each end are evenly spread over a round trip RT (a convoy would hide the model:
  // the first train of a convoy takes everyone, the rest run empty). Even trains start at A, odd ones at B; with ne = trains
  // per direction, the even ones are RT/ne apart and the odd ones meet them half-way (one-way trip = RT/2).
  const ne = Math.ceil(n / 2);
  const buy = (i: number): number => {
    if (!ok(commands.buyTrain(state, sa.id, loco.id, cars))) throw new Error("train");
    const t = state.trains[state.trains.length - 1]!;
    const o = i % 2 === 0 ? [sa, sb] : [sb, sa];
    commands.setOrders(
      state,
      t.id,
      o.map((s) => ({ stationId: s.id, rule: "auto" as const })),
    );
    return Math.max(2, estimateRoundTripDays(state, t));
  };
  const rt = buy(0) * 24; // hours
  const starts: Array<{ i: number; at: number }> = [];
  for (let i = 1; i < n; i++) {
    const j = Math.floor(i / 2);
    const gap = rt / ne;
    // an odd train starts at B and reaches A (one-way = rt / 2 later) half a gap after the even trains' departures
    const at = i % 2 === 0 ? j * gap : (((j * gap + gap / 2 - rt / 2) % rt) + rt) % rt;
    starts.push({ i, at });
  }
  starts.sort((x, y) => x.at - y.at);
  let now = 0;
  for (const s of starts) {
    const wait = Math.round(s.at - now);
    for (let h = 0; h < wait; h++) advanceOneHour(state);
    now = s.at;
    buy(s.i);
  }
  return {
    state,
    A,
    B,
    sa,
    sb,
    loco,
    nCars,
    dist: octileTileDistance(sa.tile, sb.tile, state.map.width),
  };
}

let prev = 0;
for (let n = 1; n <= maxN; n++) {
  const { state, A, B, sa, sb, loco, nCars, dist } = setup(n);
  const seats = state.trains[0]!.cars.reduce((s, c) => s + carCapacity(c), 0);
  let sampleDays = 0;
  let pileSum = 0;
  let fullDays = 0;
  let nearCeil = 0;
  for (let y = 0; y < years; y++) {
    for (let h = 0; h < 360 * 24; h++) {
      advanceOneHour(state);
      if (y === years - 1 && h % 24 === 12) {
        for (const s of [sa, sb]) {
          const pile = state.stationCargo.get(s.id)?.passengers?.amount ?? 0;
          const pool = state.stationEconomy.get(s.id)?.passengerPool ?? 0;
          sampleDays++;
          pileSum += pile / seats;
          if (pile >= seats) fullDays++;
          if (pool > 0 && pile >= 0.75 * pool) nearCeil++;
        }
      }
    }
  }
  const ly = state.finance.lastYear;
  const carried = [sa, sb].reduce(
    (s, st) => s + (getStationFlow(state, st.id).lastYear.passengers?.sent ?? 0),
    0,
  );
  const demand = [sa, sb].reduce(
    (s, st) => s + (state.stationEconomy.get(st.id)?.passengerPool ?? 0),
    0,
  );
  const lost = [sa, sb].reduce(
    (s, st) => s + (getStationFlow(state, st.id).lastYear.passengers?.lostUnits ?? 0),
    0,
  );
  const rev = ly.passengers;
  console.log(
    "PAIR " +
      JSON.stringify({
        model,
        year: startYear,
        pair: `${A.name}(${A.population})-${B.name}(${B.population})`,
        dist,
        loco: loco.id,
        cars: nCars,
        seats,
        n,
        revK: Math.round(rev / 1000),
        carried: Math.round(carried),
        demandPerMonthBoth: Math.round(demand),
        demandPerYear: Math.round(demand * 12),
        carriedShare: demand > 0 ? Math.round((100 * carried) / (demand * 12)) / 100 : 0,
        lostShare: carried + lost > 0 ? Math.round((100 * lost) / (carried + lost)) / 100 : 0,
        revPerTrainK: Math.round(rev / n / 1000),
        marginalK: Math.round((rev - prev) / 1000),
        pileTrains: Math.round((100 * pileSum) / Math.max(1, sampleDays)) / 100,
        fullTrainDays: Math.round((100 * fullDays) / Math.max(1, sampleDays)) / 100,
        nearCeiling: Math.round((100 * nearCeil) / Math.max(1, sampleDays)) / 100,
      }),
  );
  prev = rev;
}

/**
 * Phase 76: the scenario solver. For one scenario it plays a small set of real strategies (route, via-towns, station
 * type, engine rule, cars, trains, full-load waits, growth from profit, debt repayment) on the scenario's fixed map and
 * keeps the best by stars, then finish date, then yearly profit.
 *
 *   npx tsx tools/bench/scenarioSolver.ts <scenarioId|all> [--jobs 4] [--phase routes|ops|all] [--top 5]
 *   npx tsx tools/bench/scenarioSolver.ts --one <scenarioId> '<strategy json>'      (one run, prints a JSON line)
 *
 * Survival scenarios (`panic1873`) are solved by `goodPlayer.ts` with a grid of MAXPAIRS / KEEP (it plays pairs of
 * cities and repays debt); see `solveSurvive`.
 */
import { spawn, spawnSync } from "node:child_process";
import {
  buildEngineShed,
  buildStation,
  buildTrack,
  buyTrain,
  computeBuildPlan,
  repayLoan,
  setOrders,
  takeLoan,
} from "../../src/sim/commands";
import { scenarioById, scenarioNewGameOptions, SCENARIOS } from "../../src/data/scenarios";
import { buyableLocomotivesIn } from "../../src/data/trains";
import { landPrices } from "../../src/sim/economy/land";
import { createGameState, type GameState } from "../../src/sim/state";
import { advanceOneHour } from "../../src/sim/tick";
import { findBuildPath } from "../../src/sim/track/pathfind";
import { calendarFromTicks } from "../../src/sim/time";
import { netWorth } from "../../src/sim/finance/ledger";
import { ledgerOperatingCosts, ledgerOperatingProfit, ledgerRevenue } from "../../src/data/finance";
import { fixWeightBridges } from "./fixBridges";
import type { CargoType } from "../../src/data/cargo";

export type EngineRule = "fast" | "strong" | "cheap" | "value";

export interface Strategy {
  label?: string;
  /** Cities the track runs through (each gets a Station); one list per leg for chains (silver). */
  via?: string[][];
  /** deliver coal: which mine (0 = nearest to the port). */
  mine?: number;
  /** deliver coal: a second mine feeding the same port. */
  mine2?: number;
  /** Industry/city end stations: terminals or plain stations. */
  endType?: "station" | "terminal";
  engine: EngineRule;
  cars: number;
  /** Trains per leg at the start. */
  trains: number[];
  fullLoad?: boolean;
  /** Add trains (up to this many per leg) whenever cash allows. */
  grow?: number;
  /** Cash kept when buying trains / paying for a leg. */
  reserve?: number;
  /** Repay debt above this cash level (survive and others). */
  repayAbove?: number;
  /** connect: build the second half of the line only in this month (needs one via city). */
  stageMonth?: number;
  /** connect: first run a pair line from the first city to this (rich) town, link the goal cities at `stageMonth`. */
  pre?: string;
  /** connect: trains also stop in the via town. */
  stopVia?: boolean;
  /** connect: lay extra pair lines (A to a nearby town) before the link. */
  maxMonths?: number;
}

export interface SolveResult {
  id: string;
  label: string;
  status: string;
  stars: number;
  reason?: string;
  /** Months since the scenario's start year began (0 = January of the start year). */
  finishMonth: number;
  finish: string;
  profit: number;
  spent: number;
  netWorth: number;
  note: string;
  strategy: Strategy;
}

interface Spot {
  x: number;
  y: number;
}

export function runStrategy(id: string, st: Strategy): SolveResult {
  const def = scenarioById(id)!;
  const state = createGameState(scenarioNewGameOptions(def));
  const W = state.map.width;
  const year = (): number => calendarFromTicks(state.startYear, state.ticks).year;
  const dist = (a: Spot, b: Spot): number => Math.hypot(a.x - b.x, a.y - b.y);
  const xy = (t: number): Spot => ({ x: t % W, y: Math.floor(t / W) });
  const reserve = st.reserve ?? 150_000;
  let note = "";
  let spent = 0;
  const startCash = state.cash;

  const around = (at: Spot, toward: Spot, radius: number, tiles?: number[]): number[] => {
    const taken = new Set(state.trackGraph.allNodes());
    const cand: number[] = tiles ? [...tiles] : [];
    if (!tiles)
      for (let dy = -radius; dy <= radius; dy++)
        for (let dx = -radius; dx <= radius; dx++) {
          const x = at.x + dx;
          const y = at.y + dy;
          if (x < 1 || y < 1 || x >= W - 1 || y >= state.map.height - 1) continue;
          cand.push(y * W + x);
        }
    return cand
      .filter((t) => {
        if (taken.has(t)) return false;
        const iid = state.map.industryId[t];
        return iid === -1 || iid === undefined;
      })
      .sort((a, b) => dist(xy(a), toward) - dist(xy(b), toward));
  };

  const cityTiles = (name: string, toward: Spot): number[] => {
    const c = state.cities.find((x) => x.name === name)!;
    const centre = { x: c.anchorX, y: c.anchorY };
    const near = [...c.tiles]
      .sort((p, q) => dist(xy(p), centre) - dist(xy(q), centre))
      .slice(0, 12);
    return around(centre, toward, 0, near);
  };

  /** Every `k`-th of up to `n` candidates, so the sample spreads around the place instead of hugging one side. */
  const sample = (tiles: number[], n: number): number[] => {
    const cap = tiles.slice(0, 24);
    const step = Math.max(1, Math.floor(cap.length / n));
    return cap.filter((_, i) => i % step === 0).slice(0, n);
  };

  /** The cheapest valid stretch between any sampled start and end tile. */
  function cheapest(
    from: number[],
    to: number[],
  ): { path: number[]; cost: number; a: number; b: number } | null {
    let best: { path: number[]; cost: number; a: number; b: number } | null = null;
    const stationTiles = new Set(state.stations.map((x) => x.tile));
    for (const ta of from)
      for (const tb of to) {
        const path = findBuildPath(state.map, ta, tb, year(), {
          respectTurns: { graph: state.trackGraph, stationTiles },
          land: landPrices(state),
        });
        if (!path || path.length < 4) continue;
        const plan = computeBuildPlan(state, path);
        if (!plan.valid) continue;
        if (!best || plan.cost < best.cost) best = { path: [...path], cost: plan.cost, a: ta, b: tb };
      }
    return best;
  }

  /** Builds track along the stops (one candidate tile list per stop) and a station at each. Returns the station ids. */
  function buildChain(
    stops: Array<{ tiles: number[]; type: "station" | "terminal" }>,
    upTo = stops.length,
  ): number[] | null {
    const ids: number[] = [];
    const idAt = (t: number): number | undefined => state.stations.find((x) => x.tile === t)?.id;
    let prev: number | undefined;
    for (let i = 1; i < upTo; i++) {
      const from = prev === undefined ? sample(stops[0]!.tiles, 4) : [prev];
      const pick =
        cheapest(from, sample(stops[i]!.tiles, 4)) ??
        cheapest(prev === undefined ? stops[0]!.tiles.slice(0, 8) : from, stops[i]!.tiles.slice(0, 8));
      if (!pick) {
        note += ` [no path stop ${i}]`;
        return null;
      }
      if (state.cash < pick.cost + reserve) {
        note += ` [too dear ${Math.round(pick.cost / 1000)}k]`;
        return null;
      }
      const before = state.cash;
      const bt = buildTrack(state, pick.path);
      if (!bt.ok) {
        note += ` [build ${(bt as { reason?: string }).reason}]`;
        return null;
      }
      const okA = idAt(pick.a) !== undefined || buildStation(state, pick.a, stops[i - 1]!.type).ok;
      const okB = idAt(pick.b) !== undefined || buildStation(state, pick.b, stops[i]!.type).ok;
      if (!okA || !okB) {
        note += ` [station ${okA} ${okB}]`;
        state.cash = before;
        return null;
      }
      if (i === 1) ids.push(idAt(pick.a)!);
      ids.push(idAt(pick.b)!);
      prev = pick.b;
    }
    return ids;
  }

  function pickLoco(cars: number, cargo: CargoType): { id: string; cars: number; cost: number } | null {
    const all = buyableLocomotivesIn(year()).filter(
      (l) => l.type !== "electric" && (cargo === "passengers" || !l.passengerMailOnly),
    );
    const afford = all.filter((l) => l.cost + 60_000 <= state.cash - reserve);
    const pool = afford.length > 0 ? afford : all.sort((a, b) => a.cost - b.cost).slice(0, 1);
    const fits = pool.filter((l) => l.maxCars >= cars);
    const use = fits.length > 0 ? fits : pool;
    const score = (l: (typeof use)[number]): number =>
      st.engine === "fast"
        ? l.maxSpeedKmh * 1000 - l.cost / 1000
        : st.engine === "strong"
          ? l.power * 1000 - l.cost / 1000
          : st.engine === "cheap"
            ? -l.cost
            : (l.maxSpeedKmh * Math.min(l.maxCars, cars)) / l.cost;
    use.sort((a, b) => score(b) - score(a));
    const l = use[0]!;
    return { id: l.id, cars: Math.min(l.maxCars, cars), cost: l.cost };
  }

  interface Leg {
    ids: number[];
    cargo: CargoType;
    trains: number;
    cap: number;
    stops: number[];
  }
  const legs: Leg[] = [];

  function addTrain(leg: Leg): boolean {
    const loco = pickLoco(st.cars, leg.cargo);
    if (!loco) return false;
    const at = leg.stops[0]!;
    const station = state.stations.find((s) => s.id === at)!;
    if (!station.hasEngineShed && !buildEngineShed(state, at).ok) return false;
    const before = state.cash;
    if (!buyTrain(state, at, loco.id, Array(loco.cars).fill(leg.cargo)).ok) return false;
    spent += before - state.cash;
    const t = state.trains[state.trains.length - 1]!;
    const rule = st.fullLoad ? "fullLoad" : "auto";
    const orders = leg.stops.map((stationId, i) => ({
      stationId,
      rule: i === 0 || i === leg.stops.length - 1 ? (rule as "auto" | "fullLoad") : ("auto" as const),
      ...(rule === "fullLoad" && (i === 0 || i === leg.stops.length - 1) ? { maxWaitDays: 12 } : {}),
    }));
    // freight: wait to load at the producer only, never at the sink
    if (leg.cargo !== "passengers" && st.fullLoad) orders[orders.length - 1]!.rule = "auto";
    setOrders(state, t.id, orders);
    leg.trains++;
    return true;
  }

  function startLeg(
    stops: Array<{ tiles: number[]; type: "station" | "terminal" }>,
    cargo: CargoType,
    n: number,
    route: (ids: number[]) => number[],
  ): Leg | null {
    const cash0 = state.cash;
    const ids = buildChain(stops);
    spent += cash0 - state.cash;
    if (!ids) return null;
    const leg: Leg = { ids, cargo, trains: 0, cap: st.grow ?? n, stops: route(ids) };
    legs.push(leg);
    for (let i = 0; i < n; i++) if (!addTrain(leg)) break;
    return leg;
  }

  const g = def.goal;
  const et = st.endType ?? "station";
  const viaTiles = (names: string[] | undefined, toward: Spot): Array<{ tiles: number[]; type: "station" }> =>
    (names ?? []).map((n) => ({ tiles: cityTiles(n, toward), type: "station" as const }));
  let preLink: { stops: Array<{ tiles: number[]; type: "station" | "terminal" }> } | null = null;
  let staged: { stops: Array<{ tiles: number[]; type: "station" | "terminal" }>; leg: Leg; from: number } | null =
    null;

  if (g.type === "connect") {
    const a = state.cities.find((c) => c.name === g.cities[0])!;
    const b = state.cities.find((c) => c.name === g.cities[1])!;
    const A = { x: a.anchorX, y: a.anchorY };
    const B = { x: b.anchorX, y: b.anchorY };
    const via = st.via?.[0] ?? [];
    const all = [
      { tiles: cityTiles(a.name, via.length ? (state.cities.find((c) => c.name === via[0])! as never as Spot) : B), type: et },
      ...viaTiles(via, B),
      { tiles: cityTiles(b.name, A), type: et },
    ] as Array<{ tiles: number[]; type: "station" | "terminal" }>;
    if (st.pre && st.stageMonth) {
      const P = state.cities.find((c) => c.name === st.pre)!;
      const first = [
        { tiles: cityTiles(a.name, { x: P.anchorX, y: P.anchorY }), type: et },
        { tiles: cityTiles(P.name, A), type: et },
      ] as Array<{ tiles: number[]; type: "station" | "terminal" }>;
      const leg = startLeg(first, "passengers", st.trains[0] ?? 2, (ids) => ids);
      if (leg) {
        const aTile = state.stations.find((x) => x.id === leg.ids[0])!.tile;
        preLink = {
          stops: [
            { tiles: [aTile], type: et },
            { tiles: cityTiles(b.name, A), type: et },
          ] as Array<{ tiles: number[]; type: "station" | "terminal" }>,
        };
      } else note += " [pre failed]";
    } else if (st.stageMonth && via.length > 0) {
      const first = all.slice(0, 2);
      const leg = startLeg(first, "passengers", st.trains[0] ?? 2, (ids) => ids);
      if (leg) staged = { stops: all, leg, from: 1 };
      else note += " [stage 1 failed]";
    } else {
      startLeg(all, "passengers", st.trains[0] ?? 2, (ids) =>
        st.stopVia ? ids : [ids[0]!, ids[ids.length - 1]!],
      );
    }
  } else if (g.type === "deliver" && g.cargo === "coal") {
    const town = state.cities.find((c) => c.name === g.nearCity!.name)!;
    const T = { x: town.anchorX, y: town.anchorY };
    const port = state.industries
      .filter((i) => i.type === "port")
      .sort((p, q) => dist(p, T) - dist(q, T))[0]!;
    const mines = state.industries
      .filter((i) => i.type === "coalMine")
      .sort((p, q) => dist(p, port) - dist(q, port));
    const mine = mines[st.mine ?? 0]!;
    note += ` mine ${Math.round(dist(mine, port))} tiles;`;
    const stops = [
      { tiles: around(mine, port, 2), type: et },
      ...viaTiles(st.via?.[0], port),
      { tiles: around(port, mine, 2), type: et },
    ] as Array<{ tiles: number[]; type: "station" | "terminal" }>;
    startLeg(stops, "coal", st.trains[0] ?? 2, (ids) => [ids[0]!, ids[ids.length - 1]!]);
    if (st.mine2 !== undefined && mines[st.mine2]) {
      const m2 = mines[st.mine2]!;
      note += ` mine2 ${Math.round(dist(m2, port))} tiles;`;
      startLeg(
        [
          { tiles: around(m2, port, 2), type: et },
          { tiles: around(port, m2, 2), type: et },
        ] as Array<{ tiles: number[]; type: "station" | "terminal" }>,
        "coal",
        st.trains[0] ?? 2,
        (ids) => [ids[0]!, ids[ids.length - 1]!],
      );
    }
  } else if (g.type === "deliver") {
    const find = (type: string) => state.industries.find((i) => i.type === type)!;
    const mine = find("silverMine");
    const plant = find("smelter");
    const sink = find("mint");
    const l1 = startLeg(
      [
        { tiles: around(mine, plant, 2), type: et },
        ...viaTiles(st.via?.[0], plant),
        { tiles: around(plant, mine, 2), type: et },
      ] as Array<{ tiles: number[]; type: "station" | "terminal" }>,
      "silverOre",
      st.trains[0] ?? 1,
      (ids) => [ids[0]!, ids[ids.length - 1]!],
    );
    if (l1) {
      const smelterStn = l1.ids[l1.ids.length - 1]!;
      const smelterTile = state.stations.find((s) => s.id === smelterStn)!.tile;
      const startTile = [smelterTile];
      // second leg starts at the smelter's own output station (a second station, or the same one)
      const taken = new Set(state.stations.map((s) => s.tile));
      const outTiles = around(plant, sink, 2).filter((t) => !taken.has(t));
      const l2 = startLeg(
        [
          { tiles: outTiles.length ? outTiles : startTile, type: et },
          ...viaTiles(st.via?.[1], sink),
          { tiles: around(sink, plant, 2), type: "station" as const },
        ] as Array<{ tiles: number[]; type: "station" | "terminal" }>,
        "silverBars",
        st.trains[1] ?? 1,
        (ids) => [ids[0]!, ids[ids.length - 1]!],
      );
      if (!l2) note += " [leg 2 failed]";
    } else note += " [leg 1 failed]";
  }

  const t0 = state.ticks;
  void t0;
  const monthsMax = st.maxMonths ?? 14 * 12;
  let month = 0;
  const hoursPerMonth = 30 * 24;
  for (let h = 0; h < monthsMax * hoursPerMonth && state.scenario!.status === "active"; h++) {
    advanceOneHour(state);
    if (h % hoursPerMonth !== 0) continue;
    month++;
    fixWeightBridges(state);
    if (process.env["YEARLY"] && month % 12 === 1) {
      const ly = state.finance.lastYear;
      console.error(
        year() - 1,
        `rev ${Math.round(ledgerRevenue(ly) / 1000)}k costs ${Math.round(ledgerOperatingCosts(ly) / 1000)}k profit ${Math.round(ledgerOperatingProfit(ly) / 1000)}k cash ${Math.round(state.cash / 1000)}k loans ${Math.round(state.finance.loans / 1000)}k trains ${state.trains.length} waiting ${[...state.stationCargo.entries()].map(([i, p]) => `${i}:` + Object.entries(p).filter(([, v]) => v!.amount >= 1).map(([k, v]) => `${k}=${Math.round(v!.amount)}`).join('/')).join(' ')} status ${state.trains.map((t) => t.status[0]).join('')} progress ${Math.round(state.scenario!.progress)}`,
      );
    }
    // loans keep the company alive while it still has a plan
    if (state.cash < reserve) takeLoan(state, 100_000);
    if (staged && month >= st.stageMonth!) {
      const viaTile = state.stations.find((x) => x.id === staged!.leg.ids[1])!.tile;
      const rest = [{ tiles: [viaTile], type: "station" as const }, ...staged.stops.slice(2)];
      for (let k = 0; k < 8 && state.cash < 600_000; k++) takeLoan(state, 100_000);
      const cash0 = state.cash;
      const ids = buildChain(rest);
      spent += cash0 - state.cash;
      if (ids) {
        const l = staged.leg;
        const ends = [l.ids[0]!, ids[ids.length - 1]!];
        for (const t of state.trains)
          setOrders(
            state,
            t.id,
            ends.map((stationId) => ({ stationId, rule: "auto" as const })),
          );
        l.stops = ends;
        staged = null;
      }
    }
    if (preLink && month >= st.stageMonth!) {
      for (let k = 0; k < 8 && state.cash < 700_000; k++) takeLoan(state, 100_000);
      const cash0 = state.cash;
      const ids = buildChain(preLink.stops);
      spent += cash0 - state.cash;
      if (ids) {
        const leg: Leg = { ids, cargo: "passengers", trains: 0, cap: 2, stops: ids };
        legs.push(leg);
        for (let i = 0; i < 2; i++) if (!addTrain(leg)) break;
        preLink = null;
      }
    }
    for (const leg of legs) {
      while (
        leg.trains < leg.cap &&
        state.cash > reserve + 500_000 &&
        month % 1 === 0 &&
        addTrain(leg)
      );
    }
    if (st.repayAbove !== undefined)
      while (
        state.finance.loans >= 100_000 &&
        state.cash > st.repayAbove &&
        repayLoan(state, 100_000).ok
      );
  }
  const run = state.scenario!;
  const endTicks = run.endTick ?? state.ticks;
  const cal = calendarFromTicks(state.startYear, endTicks);
  const finishMonth = Math.round(endTicks / hoursPerMonth);
  void startCash;
  return {
    id,
    label: st.label ?? "",
    status: run.status,
    stars: run.stars,
    ...(run.reason ? { reason: run.reason } : {}),
    finishMonth,
    finish: `${cal.year}-${String(Math.min(12, Math.floor(((endTicks / 24) % 360) / 30) + 1)).padStart(2, "0")}`,
    profit: Math.round(ledgerOperatingProfit(state.finance.lastYear)),
    spent: Math.round(spent),
    netWorth: Math.round(netWorth(state)),
    note: `${note} progress ${Math.round(run.progress)}`,
    strategy: st,
  };
}

/* ------------------------------------------------------------------------------------------------------------ */
/* candidate generation                                                                                          */
/* ------------------------------------------------------------------------------------------------------------ */

function near(state: GameState, a: Spot, b: Spot, maxOff: number, skip: string[]): string[] {
  // towns close to the straight line a-b (and between them)
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  return state.cities
    .map((c) => {
      const t = ((c.anchorX - a.x) * (b.x - a.x) + (c.anchorY - a.y) * (b.y - a.y)) / (len * len);
      const px = a.x + t * (b.x - a.x);
      const py = a.y + t * (b.y - a.y);
      return { name: c.name, t, off: Math.hypot(c.anchorX - px, c.anchorY - py) };
    })
    .filter((c) => c.t > 0.15 && c.t < 0.85 && c.off <= maxOff && !skip.includes(c.name))
    .sort((p, q) => p.off - q.off)
    .map((c) => c.name);
}

export function routeCandidates(id: string): Strategy[] {
  const def = scenarioById(id)!;
  const state = createGameState(scenarioNewGameOptions(def));
  const g = def.goal;
  const out: Strategy[] = [];
  const base = { engine: "fast" as EngineRule, cars: 4, trains: [2, 2], fullLoad: true };
  if (g.type === "connect") {
    const a = state.cities.find((c) => c.name === g.cities[0])!;
    const b = state.cities.find((c) => c.name === g.cities[1])!;
    out.push({ ...base, label: "direct" });
    for (const v of near(state, { x: a.anchorX, y: a.anchorY }, { x: b.anchorX, y: b.anchorY }, 25, g.cities).slice(0, 3))
      out.push({ ...base, label: `via ${v}`, via: [[v]], stopVia: true });
    out.push({ ...base, label: "direct terminals", endType: "terminal" });
    const bigNear = state.cities
      .filter(
        (c) =>
          !g.cities.includes(c.name) &&
          c.population >= 8000 &&
          Math.hypot(c.anchorX - a.anchorX, c.anchorY - a.anchorY) < 70,
      )
      .sort((p, q) => q.population - p.population)
      .slice(0, 2);
    for (const c of bigNear)
      for (const stageMonth of [12, 24, 36])
        out.push({ ...base, label: `pre ${c.name} link ${stageMonth}`, pre: c.name, stageMonth, trains: [2] });
    for (const v of near(state, { x: a.anchorX, y: a.anchorY }, { x: b.anchorX, y: b.anchorY }, 40, g.cities).slice(0, 4))
      for (const stageMonth of [10, 22, 34])
        out.push({ ...base, label: `stage ${stageMonth} via ${v}`, via: [[v]], stageMonth, grow: 4, trains: [2] });
  } else if (g.type === "deliver" && g.cargo === "coal") {
    for (let m = 0; m < 2; m++) out.push({ ...base, label: `mine #${m}`, mine: m, trains: [2] });
    for (let m = 1; m < 4; m++)
      out.push({ ...base, label: `mines #0+#${m}`, mine: 0, mine2: m, trains: [2] });
  } else if (g.type === "deliver") {
    const mine = state.industries.find((i) => i.type === "silverMine")!;
    const plant = state.industries.find((i) => i.type === "smelter")!;
    const sink = state.industries.find((i) => i.type === "mint")!;
    out.push({ ...base, label: "direct", trains: [1, 1] });
    const v1 = near(state, mine, plant, 30, []).slice(0, 2);
    const v2 = near(state, plant, sink, 30, []).slice(0, 3);
    for (const v of v1) out.push({ ...base, label: `ore via ${v}`, trains: [1, 1], via: [[v], []] });
    for (const v of v2) out.push({ ...base, label: `bars via ${v}`, trains: [1, 1], via: [[], [v]] });
  }
  return out;
}

export function opsCandidates(base: Strategy, id: string): Strategy[] {
  const def = scenarioById(id)!;
  const legsN = base.trains.length;
  const out: Strategy[] = [];
  const mk = (over: Partial<Strategy>, tag: string): void => {
    out.push({ ...base, ...over, label: `${base.label} | ${tag}` });
  };
  for (const engine of ["fast", "value"] as EngineRule[])
    for (const cars of [4, 8])
      for (const n of [1, 2, 3])
        mk(
          { engine, cars, fullLoad: true, trains: Array(legsN).fill(n) as number[] },
          `${engine} ${cars}c x${n} FL`,
        );
  for (const grow of [4, 6])
    mk({ grow, trains: Array(legsN).fill(2) as number[] }, `grow to ${grow}`);
  if (def.goal.type === "connect" && base.via)
    for (const stageMonth of [12, 24, 36])
      mk({ stageMonth, grow: 4, trains: [2] }, `stage ${stageMonth} grow 4`);
  const fixed = def.goal.type === "connect" ? 1 : 0;
  void fixed;
  return out;
}

/* ------------------------------------------------------------------------------------------------------------ */
/* running                                                                                                       */
/* ------------------------------------------------------------------------------------------------------------ */

function better(a: SolveResult, b: SolveResult): number {
  // stars desc (a lost run counts as -1), then finish date asc, then profit desc
  const sa = a.status === "won" ? a.stars : -1;
  const sb = b.status === "won" ? b.stars : -1;
  if (sa !== sb) return sb - sa;
  if (a.status === "won" && a.finishMonth !== b.finishMonth) return a.finishMonth - b.finishMonth;
  if (a.status !== "won" && a.netWorth !== b.netWorth) return b.netWorth - a.netWorth;
  return b.profit - a.profit;
}

function runOne(id: string, st: Strategy): Promise<SolveResult> {
  return new Promise((resolve) => {
    const child = spawn(
      "npx",
      ["tsx", "tools/bench/scenarioSolver.ts", "--one", id, JSON.stringify(st)],
      { stdio: ["ignore", "pipe", "inherit"] },
    );
    let out = "";
    child.stdout.on("data", (d: Buffer) => (out += d.toString()));
    child.on("close", () => {
      const line = out.split("\n").find((l) => l.startsWith("{"));
      if (!line) {
        resolve({
          id,
          label: st.label ?? "",
          status: "error",
          stars: 0,
          finishMonth: 9999,
          finish: "-",
          profit: 0,
          spent: 0,
          netWorth: 0,
          note: out.slice(0, 200),
          strategy: st,
        });
        return;
      }
      resolve(JSON.parse(line) as SolveResult);
    });
  });
}

async function pool(id: string, list: Strategy[], jobs: number): Promise<SolveResult[]> {
  const results: SolveResult[] = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: jobs }, async () => {
      while (next < list.length) {
        const st = list[next++]!;
        const r = await runOne(id, st);
        results.push(r);
        console.log(
          `  ${r.label.padEnd(44)} ${r.status} ${r.stars}* ${r.finish} profit ${(r.profit / 1000).toFixed(0)}k spent ${(r.spent / 1000).toFixed(0)}k${r.reason ? " " + r.reason : ""}${r.note}`,
        );
      }
    }),
  );
  return results.sort(better);
}

/** Survival scenarios: goodPlayer.ts plays city pairs; the grid is how many pairs and how much cash it keeps. */
function solveSurvive(id: string): void {
  const rows: string[] = [];
  for (const maxpairs of [1, 2, 3, 4])
    for (const keep of [300_000, 800_000, 1_500_000, 3_000_000]) {
      const r = spawnSync("npx", ["tsx", "tools/bench/goodPlayer.ts"], {
        env: { ...process.env, SCENARIO: id, MAXPAIRS: String(maxpairs), KEEP: String(keep) },
        encoding: "utf8",
        timeout: 900_000,
      });
      const line = (r.stdout ?? "").split("\n").find((l) => l.startsWith("SCENARIO"));
      const row = `maxpairs ${maxpairs} keep ${keep / 1000}k: ${line ?? "no result " + (r.stderr ?? "").slice(0, 100)}`;
      console.log(row);
      rows.push(row);
    }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args[0] === "--one") {
    const r = runStrategy(args[1]!, JSON.parse(args[2]!) as Strategy);
    console.log(JSON.stringify(r));
    return;
  }
  const jobs = Number(args[args.indexOf("--jobs") + 1] || 4);
  const phase = args.includes("--phase") ? args[args.indexOf("--phase") + 1]! : "all";
  const which = args[0] && !args[0].startsWith("--") ? args[0] : "all";
  for (const def of SCENARIOS) {
    if (which !== "all" && which !== def.id) continue;
    console.log(`== ${def.id}`);
    if (def.goal.type === "survive") {
      solveSurvive(def.id);
      continue;
    }
    let best: SolveResult | undefined;
    if (phase === "routes" || phase === "all") {
      const routes = await pool(def.id, routeCandidates(def.id), jobs);
      best = routes[0];
    }
    if (phase === "ops" && args.includes("--base"))
      best = { strategy: JSON.parse(args[args.indexOf("--base") + 1]!) as Strategy } as SolveResult;
    if ((phase === "ops" || phase === "all") && best) {
      const ops = await pool(def.id, opsCandidates(best.strategy, def.id), jobs);
      if (!best.id || better(ops[0]!, best) < 0) best = ops[0];
    }
    if (best) console.log(`BEST ${def.id}: ${JSON.stringify(best)}`);
  }
}

if (process.argv[1]?.endsWith("scenarioSolver.ts")) await main();

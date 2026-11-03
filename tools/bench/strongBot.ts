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
import * as commands from "../../src/sim/commands";
import type { GameState } from "../../src/sim/state";
import { advanceOneHour } from "../../src/sim/tick";
import { findBuildPath } from "../../src/sim/track/pathfind";
import { buyableLocomotivesIn, locomotiveById } from "../../src/data/trains";
import { CARGO, type CargoType } from "../../src/data/cargo";
import {
  INDUSTRIES,
  INDUSTRY_TYPES,
  LONG_HAUL_CHAINS,
  longHaulChainFor,
} from "../../src/data/industries";
import { KMH_PER_TILE_PER_DAY } from "../../src/data/trains";
import { computeRevenue } from "../../src/sim/trains/loading";
import { AVERAGE_SPEED_SHARE } from "../../src/sim/trains/headway";
import { PARTY_SIZE } from "../../src/data/economy";
import {
  ledgerOperatingCosts,
  ledgerOperatingProfit,
  ledgerRevenue,
  type LedgerPeriod,
} from "../../src/data/finance";
import { activePanic } from "../../src/sim/finance/panics";
import { netWorth } from "../../src/sim/finance/ledger";
import { landPrices } from "../../src/sim/economy/land";
import { cityTileAcceptance } from "../../src/sim/economy/cityStats";
import { calendarFromTicks } from "../../src/sim/time";
import { stationMonthlyCost, trackEdgeMonthlyCost } from "../../src/sim/finance/costs";
import * as economy from "../../src/data/economy";
import type { TrackEdge } from "../../src/sim/track/types";
import { createLayUpPolicy } from "./layUp";
import { booksProfit } from "../../src/sim/trains/profit";
import { fixWeightBridges } from "./fixBridges";
import { estimateFreightPayback, estimatePayback } from "./paybackEstimate";
import type { City, Industry } from "../../src/sim/economy/types";
import type { Station } from "../../src/sim/stations/types";
import type { StationType } from "../../src/data/stations";

// the head office's share of running costs exists from Phase 59's cost proposal on (branch phase-59-costs); 0 before
const GENERAL_ADMIN_MARKUP =
  (economy as unknown as Record<string, number | undefined>)["GENERAL_ADMIN_MARKUP"] ?? 0;
const { PROPERTY_TAX_RATE } = economy;

export interface BotMemory {
  lines: unknown[];
  connected: number[];
  servedIndustries: number[];
  failed: string[];
  sheds: number[];
  chainBuilt: boolean;
  lastEdit: Array<[number, number]>;
  layUp: ReturnType<ReturnType<typeof createLayUpPolicy>["exportState"]>;
}

/** The V2 strong player as an object: `createStrongBot(state)` plays `state` (any state, a fork too). */
export function createStrongBot(state: GameState, memory?: BotMemory) {
  const W = state.map.width;
  const DAY = 24;
  const year = (): number => calendarFromTicks(state.startYear, state.ticks).year;
  const xy = (t: number): [number, number] => [t % W, Math.floor(t / W)];
  const dist = (a: number, b: number): number => {
    const [ax, ay] = xy(a);
    const [bx, by] = xy(b);
    return Math.hypot(ax - bx, ay - by);
  };
  const cityCentre = (c: City): number => c.anchorY * W + c.anchorX;
  const indTile = (i: Industry): number => i.y * W + i.x;
  const ok = (r: unknown): boolean => !!r && (r as { ok: boolean }).ok;
  const sum = (a: LedgerPeriod, b: LedgerPeriod): number => ledgerRevenue(a) + ledgerRevenue(b);
  void sum;

  /** Longest line the bot will build (tiles), and the payback (years) it accepts for a whole project. */
  const MAX_LINE_TILES = 70;
  const MAX_PAYBACK_YEARS = Number(process.env["PAYBACK"] ?? 9);
  /** Share of net worth the bot will borrow up to. */
  const MAX_DEBT_SHARE = 0.33;
  const BORROW_LIMIT_SHARE = 0.5;

  /** A line the bot runs: stops in order, the cargo, and its trains. */
  interface Line {
    kind: "pax" | "freight";
    stops: Station[];
    cities: City[];
    cargo: CargoType;
    trains: number[];
    path: number[];
    doubled: boolean;
    /** Freight: carloads a month the source puts out when the line was built. */
    carloadsPerMonth: number;
    /** Phase 77: cars per train now (right-sized from the load history); absent = the opening size. */
    cars?: number;
    /** Phase 77: a leg of the long-haul chain (ore pays nothing itself, so it is not judged by its own payback). */
    chain?: boolean;
    /** Phase 77: ten-day samples, and those in which a train of the line stood waiting for a block. */
    samples: number;
    blocked: number;
    /** Phase 77: feeder lines share the hub's station and have no stops of their own to extend. */
    feeder?: boolean;
  }
  const layUp = createLayUpPolicy({ returnOnTraffic: true });
  const lines: Line[] = [];
  const connected = new Set<number>();
  const servedIndustries = new Set<number>();
  const failed = new Set<string>();

  let simMs = 0;
  function day(n: number): void {
    const t0 = Date.now();
    for (let i = 0; i < n * DAY; i++) advanceOneHour(state);
    simMs += Date.now() - t0;
  }

  /** One month of operating costs: what a cash reserve has to cover. */
  function reserve(): number {
    const last = state.finance.monthHistory[state.finance.monthHistory.length - 1];
    const month = last ? ledgerOperatingCosts(last) : ledgerOperatingCosts(state.finance.thisMonth);
    return Math.max(25_000, month);
  }

  /** What the bot will still borrow: a third of net worth at most, and at most half the lenders' limit, so a panic (which cuts
   * the limit to 60 %) or a lean year does not leave debt over the limit, the lenders call it, and the call empties the cash. */
  function borrowRoom(): number {
    // the very first line is financed from the start-up credit, as any player does: nothing yet to lose to a panic
    if (lines.length === 0)
      return Math.max(0, 0.9 * commands.creditLimit(state) - state.finance.loans);
    const room = Math.min(
      BORROW_LIMIT_SHARE * commands.creditLimit(state),
      MAX_DEBT_SHARE * netWorth(state),
    );
    return Math.max(0, room - state.finance.loans);
  }

  function ensureCash(needed: number): boolean {
    if (state.cash >= needed) return true;
    if (state.cash + borrowRoom() < needed) return false;
    let guard = 0;
    while (state.cash < needed && guard++ < 80) if (!ok(commands.takeLoan(state, 100_000))) break;
    return state.cash >= needed;
  }

  function repayIfIdle(): void {
    while (state.finance.loans >= 100_000 && state.cash > state.finance.loans + 6 * reserve())
      if (!ok(commands.repayLoan(state, 100_000))) break;
  }

  // --- engines and consists ---------------------------------------------------------------------------------------

  const paxLocos = () => buyableLocomotivesIn(year()).filter((l) => l.type !== "electric");
  const freightLocos = () =>
    buyableLocomotivesIn(year()).filter((l) => l.type !== "electric" && !l.passengerMailOnly);

  function paxCars(cities: readonly City[]): number {
    const pops = cities.map((c) => c.population).sort((p, q) => q - p);
    const pop = Math.min(pops[0] ?? 0, pops[1] ?? 0);
    return pop < 8_000 ? 4 : pop < 16_000 ? 5 : 6;
  }
  function paxConsist(locoId: string, cars: number): CargoType[] {
    const n = Math.min(locomotiveById(locoId)!.maxCars, 8, cars);
    const mail = n >= 4 ? 1 : 0;
    return Array.from({ length: n }, (_, i) => (i < n - mail ? "passengers" : "mail"));
  }

  function bestPaxLoco(
    cities: readonly City[],
    d: number,
    cars: number = paxCars(cities),
  ): { id: string; payback: number; profit: number; revenue: number; costs: number } {
    let best:
      { id: string; payback: number; profit: number; revenue: number; costs: number } | undefined;
    for (const l of paxLocos()) {
      const n = paxConsist(l.id, cars).length;
      const e = estimatePayback(state, l, n, d);
      if (!best || e.payback < best.payback)
        best = {
          id: l.id,
          payback: e.payback,
          profit: e.profit,
          revenue: e.revenue,
          costs: e.costs,
        };
    }
    return best ?? { id: paxLocos()[0]!.id, payback: Infinity, profit: 0, revenue: 0, costs: 0 };
  }

  interface FreightPick {
    id: string;
    cars: number;
    payback: number;
    profit: number;
    revenue: number;
    costs: number;
  }
  function bestFreightLoco(
    cargo: CargoType,
    d: number,
    carloadsPerYear: number,
    cars?: number,
  ): FreightPick | undefined {
    let best: FreightPick | undefined;
    for (const l of freightLocos()) {
      // one train should carry about what the source puts out, no more than the engine hauls
      const want = cars ?? Math.max(3, Math.ceil(carloadsPerYear / 12 / 2));
      const n = Math.min(l.maxCars, want);
      const e = estimateFreightPayback(state, l, n, d, cargo, carloadsPerYear);
      if (!best || e.payback < best.payback)
        best = {
          id: l.id,
          cars: n,
          payback: e.payback,
          profit: e.profit,
          revenue: e.revenue,
          costs: e.costs,
        };
    }
    return best;
  }

  // --- track and stations ------------------------------------------------------------------------------------------

  function freeAround(at: number, toward: number, radius: number): number[] {
    const taken = new Set(state.trackGraph.allNodes());
    const [ax, ay] = xy(at);
    const out: Array<{ t: number; d: number }> = [];
    for (let dy = -radius; dy <= radius; dy++)
      for (let dx = -radius; dx <= radius; dx++) {
        const x = ax + dx;
        const y = ay + dy;
        if (x < 1 || y < 1 || x >= W - 1 || y >= state.map.height - 1) continue;
        const t = y * W + x;
        if (taken.has(t)) continue;
        const iid = state.map.industryId[t];
        if (iid !== -1 && iid !== undefined) continue;
        out.push({ t, d: dist(t, toward) });
      }
    return out.sort((p, q) => p.d - q.d).map((o) => o.t);
  }

  function cityTilesToward(city: City, toward: number): number[] {
    const centre = cityCentre(city);
    const taken = new Set(state.trackGraph.allNodes());
    return [...city.tiles]
      .filter((t) => !taken.has(t))
      .sort((p, q) => dist(p, centre) - dist(q, centre))
      .slice(0, 12)
      .sort((p, q) => dist(p, toward) - dist(q, toward));
  }

  interface Leg {
    ta: number;
    tb: number;
    path: number[];
    trackCost: number;
    edges: number;
  }

  /** The first legal track between a tile of `from` and a tile of `to` (pathfinder, build rules). */
  function planLeg(from: number[], to: number[]): Leg | null {
    const stationTiles = new Set(state.stations.map((s) => s.tile));
    const land = landPrices(state);
    for (const ta of from.slice(0, 2))
      for (const tb of to.slice(0, 2)) {
        const path = findBuildPath(state.map, ta, tb, year(), {
          respectTurns: { graph: state.trackGraph, stationTiles },
          land,
        });
        if (!path || path.length < 4) continue;
        const plan = commands.computeBuildPlan(state, path);
        if (plan.valid) return { ta, tb, path, trackCost: plan.cost, edges: plan.toBuild.length };
      }
    return null;
  }

  function stationCost(tile: number, type: StationType): number {
    return commands.computeStationBuildPlan(state, tile, type).cost;
  }

  const sheds = new Set<number>();
  function shed(st: Station): void {
    if (sheds.has(st.id)) return;
    commands.buildEngineShed(state, st.id);
    sheds.add(st.id);
  }

  function setLineOrders(line: Line, trainId: number, index: number): void {
    const k = line.stops.length;
    const cycle = [
      ...line.stops.map((_, i) => i),
      ...Array.from({ length: Math.max(0, k - 2) }, (_, i) => k - 2 - i),
    ];
    const rot = index % 2 === 0 ? 0 : Math.floor(cycle.length / 2);
    const orders = [...cycle.slice(rot), ...cycle.slice(0, rot)].map((i) => ({
      stationId: line.stops[i]!.id,
      // freight: wait for a full load at the source of a long train; everything else loads what is there
      rule:
        line.kind === "freight" &&
        i === 0 &&
        (line.stops[0]!.type === "terminal" || line.carloadsPerMonth >= 4)
          ? ("fullLoad" as const)
          : ("auto" as const),
    }));
    commands.setOrders(state, trainId, orders);
  }

  function lineCarCount(line: Line): number {
    if (line.cars !== undefined) return line.cars;
    return line.kind === "pax"
      ? paxCars(line.cities)
      : Math.max(3, Math.ceil(line.carloadsPerMonth / 2));
  }

  function lineConsist(line: Line, locoId: string): CargoType[] {
    if (line.kind === "pax") return paxConsist(locoId, lineCarCount(line));
    const l = locomotiveById(locoId)!;
    return Array(Math.min(l.maxCars, lineCarCount(line))).fill(line.cargo) as CargoType[];
  }

  function lineDistance(line: Line): number {
    return dist(line.stops[0]!.tile, line.stops[line.stops.length - 1]!.tile);
  }

  function addTrain(line: Line): boolean {
    const d = lineDistance(line);
    const locoId =
      line.kind === "pax"
        ? bestPaxLoco(line.cities, d).id
        : (bestFreightLoco(line.cargo, d, line.carloadsPerMonth * 12, line.cars)?.id ??
          freightLocos()[0]!.id);
    const cars = lineConsist(line, locoId);
    const cost = commands.computeBuyTrainPlan(state, locoId, cars).cost;
    if (!ensureCash(cost + reserve())) return false;
    if (!ok(commands.buyTrain(state, line.stops[0]!.id, locoId, cars))) return false;
    const train = state.trains[state.trains.length - 1]!;
    line.trains.push(train.id);
    setLineOrders(line, train.id, line.trains.length - 1);
    return true;
  }

  // --- candidate projects ----------------------------------------------------------------------------------------

  /** What a new line costs to keep a year before any train runs: section gangs on its track, its stations' staff and
   * buildings, the head office's share and the property tax on what it cost. The bot counts it against the line's profit. */
  function lineUpkeepPerYear(newEdges: number, stations: StationType[], capital: number): number {
    const edge = { double: false } as TrackEdge;
    const running =
      12 * newEdges * trackEdgeMonthlyCost(edge, year()) +
      12 * stations.reduce((sum, t) => sum + stationMonthlyCost(t, year()).total, 0);
    return running * (1 + GENERAL_ADMIN_MARKUP) + capital * PROPERTY_TAX_RATE;
  }

  interface Project {
    label: string;
    /** Phase 77: a passenger line shares its towns with the lines already built, so each new one is worth less than the
     * estimate (which sizes every line as if alone): its rank is its payback times 1 + 0.08 per passenger line built. */
    crowds?: boolean;
    payback: number;
    total: number;
    build: () => boolean;
  }

  function paxProject(city: City, hub: City): Project | null {
    const key = `pax${city.id}-${hub.id}`;
    if (failed.has(key)) return null;
    const leg = planLeg(
      cityTilesToward(city, cityCentre(hub)),
      cityTilesToward(hub, cityCentre(city)),
    );
    if (!leg) {
      failed.add(key);
      return null;
    }
    const typeFor = (c: City): StationType =>
      year() >= 1870 && c.population >= 40_000 && state.cash > 2_500_000 ? "terminal" : "station";
    const ta = typeFor(city);
    const tb = typeFor(hub);
    const d = dist(leg.ta, leg.tb);
    const loco = bestPaxLoco([city, hub], d);
    const cars = paxConsist(loco.id, paxCars([city, hub]));
    const trainCost = commands.computeBuyTrainPlan(state, loco.id, cars).cost;
    const fixed = leg.trackCost + stationCost(leg.ta, ta) + stationCost(leg.tb, tb);
    // two trains to start; a poor start (Hard) that cannot pay for two buys one and the second when cash allows
    const nTrains =
      lines.length === 0 && state.cash + borrowRoom() < fixed + 2 * trainCost + reserve() ? 1 : 2;
    const total = fixed + nTrains * trainCost;
    const profit =
      nTrains * loco.profit -
      lineUpkeepPerYear(
        leg.edges,
        [ta, tb],
        leg.trackCost + stationCost(leg.ta, ta) + stationCost(leg.tb, tb),
      );
    const payback = profit > 0 ? total / profit : Infinity;
    return {
      label: `pax ${city.name}-${hub.name}`,
      crowds: true,
      payback,
      total,
      build: () => {
        if (!ensureCash(total + reserve())) return false;
        if (!ok(commands.buildTrack(state, leg.path))) return false;
        if (
          !ok(commands.buildStation(state, leg.ta, ta)) ||
          !ok(commands.buildStation(state, leg.tb, tb))
        )
          return false;
        const a = state.stations.find((s) => s.tile === leg.ta)!;
        const b = state.stations.find((s) => s.tile === leg.tb)!;
        shed(a);
        const line: Line = {
          kind: "pax",
          stops: [a, b],
          cities: [city, hub],
          cargo: "passengers",
          trains: [],
          path: leg.path,
          doubled: false,
          samples: 0,
          blocked: 0,
          carloadsPerMonth: 0,
        };
        lines.push(line);
        connected.add(city.id);
        connected.add(hub.id);
        for (let i = 0; i < nTrains; i++) addTrain(line);
        return true;
      },
    };
  }

  /** A new town on the way: extend the line whose far end is nearest (the owner's multi-stop lines). */
  function extendProject(city: City): Project | null {
    let best: { line: Line; d: number } | undefined;
    for (const line of lines) {
      if (line.kind !== "pax" || line.feeder) continue;
      const end = line.cities[line.cities.length - 1]!;
      const d = dist(cityCentre(end), cityCentre(city));
      if (d <= 45 && line.stops.length < 5 && (!best || d < best.d)) best = { line, d };
    }
    if (!best) return null;
    const key = `ext${city.id}-${best.line.stops[0]!.id}`;
    if (failed.has(key)) return null;
    const line = best.line;
    const endStation = line.stops[line.stops.length - 1]!;
    const leg = planLeg([endStation.tile], cityTilesToward(city, endStation.tile));
    if (!leg) {
      failed.add(key);
      return null;
    }
    const type: StationType = "station";
    const total = leg.trackCost + stationCost(leg.tb, type);
    // the extension adds the new town's traffic to every train of the line: judge it as a line of its own length
    const loco = bestPaxLoco([city, line.cities[line.cities.length - 1]!], dist(leg.ta, leg.tb));
    const profit =
      loco.profit * Math.max(1, line.trains.length) - lineUpkeepPerYear(leg.edges, [type], total);
    const payback = profit > 0 ? total / profit : Infinity;
    return {
      label: `extend ${city.name}`,
      crowds: true,
      payback,
      total,
      build: () => {
        if (!ensureCash(total + reserve())) return false;
        if (!ok(commands.buildTrack(state, leg.path))) return false;
        if (!ok(commands.buildStation(state, leg.tb, type))) return false;
        line.stops.push(state.stations.find((s) => s.tile === leg.tb)!);
        line.cities.push(city);
        connected.add(city.id);
        line.trains.forEach((id, i) => setLineOrders(line, id, i));
        return true;
      },
    };
  }

  /** Phase 77: a small town into the nearest big station: one new station at the town, track to the hub's station, a short
   * line of its own that fills the trunk (the owner's feeders). Judged by the town's own supply (pop / 8000 of a full train). */
  function feederProject(city: City): Project | null {
    let best: { line: Line; st: Station; hubCity: City; d: number } | undefined;
    for (const line of lines) {
      if (line.kind !== "pax") continue;
      line.stops.forEach((st, i) => {
        const hubCity = line.cities[i];
        if (!hubCity || hubCity.population < 12_000) return;
        const d = dist(cityCentre(city), st.tile);
        if (d >= 6 && d <= 35 && (!best || d < best.d)) best = { line, st, hubCity, d };
      });
    }
    if (!best) return null;
    const key = `feed${city.id}-${best.st.id}`;
    if (failed.has(key)) return null;
    const { st: hubSt, hubCity } = best;
    const leg = planLeg([hubSt.tile], cityTilesToward(city, hubSt.tile));
    if (!leg) {
      failed.add(key);
      return null;
    }
    const type: StationType = "station";
    const d = dist(leg.ta, leg.tb);
    const cars = Math.min(4, paxCars([city, hubCity]));
    const loco = bestPaxLoco([city, hubCity], d, cars);
    const fixed = leg.trackCost + stationCost(leg.tb, type);
    const consist = paxConsist(loco.id, cars);
    const trainCost = commands.computeBuyTrainPlan(state, loco.id, consist).cost;
    const total = fixed + trainCost;
    const supply = Math.min(1, city.population / 8_000);
    const profit = loco.revenue * supply - loco.costs - lineUpkeepPerYear(leg.edges, [type], fixed);
    const payback = profit > 0 ? total / profit : Infinity;
    return {
      label: `feeder ${city.name}-${hubCity.name}`,
      crowds: true,
      payback,
      total,
      build: () => {
        if (!ensureCash(total + reserve())) return false;
        if (!ok(commands.buildTrack(state, leg.path))) return false;
        if (!ok(commands.buildStation(state, leg.tb, type))) return false;
        const b = state.stations.find((x) => x.tile === leg.tb)!;
        const line: Line = {
          kind: "pax",
          stops: [hubSt, b],
          cities: [hubCity, city],
          cargo: "passengers",
          trains: [],
          path: leg.path,
          doubled: false,
          samples: 0,
          blocked: 0,
          carloadsPerMonth: 0,
          cars,
          feeder: true,
        };
        lines.push(line);
        connected.add(city.id);
        addTrain(line);
        return true;
      },
    };
  }

  /** Phase 77: the long-haul chain (silver ore -> smelter -> mint; uranium from 1940) as one project: two long legs, a
   * terminal at each end of each, full-load waits, and trains sized to the mine's output. The ore pays nothing itself; the
   * bars pay on arrival for the distance from the mine (cargo.ts `chainLeg`). */
  let chainBuilt = false;
  function chainProject(): Project | null {
    if (chainBuilt || failed.has("chain")) return null;
    const def = longHaulChainFor(state.startYear);
    const chain = LONG_HAUL_CHAINS[def.id];
    const mine = state.industries.find((i) => i.type === chain.mine);
    const plant = state.industries.find((i) => i.type === chain.processor);
    const sink = state.industries.find((i) => i.type === chain.sink);
    if (!mine || !plant || !sink) return null;
    const ore: CargoType = def.id === "silver" ? "silverOre" : "uraniumOre";
    const bars: CargoType = def.id === "silver" ? "silverBars" : "enrichedUranium";
    if (CARGO[ore].era > year()) return null;
    const out = state.industryEconomy.get(mine.id)?.monthlyOutput[ore] ?? 0;
    if (out <= 0) return null;
    const legA = planLeg(
      freeAround(indTile(mine), indTile(plant), 2),
      freeAround(indTile(plant), indTile(mine), 2),
    );
    if (!legA) {
      failed.add("chain");
      return null;
    }
    const legB = planLeg(
      freeAround(indTile(plant), indTile(sink), 3).filter((t) => dist(t, legA.tb) > 1.5),
      freeAround(indTile(sink), indTile(plant), 2),
    );
    if (!legB) {
      failed.add("chain");
      return null;
    }
    const dA = dist(legA.ta, legA.tb);
    const dB = dist(legB.ta, legB.tb);
    const oreLoads = out / CARGO[ore].capacity;
    const barLoads =
      (out * (INDUSTRIES[plant.type].produces[bars] ?? 0)) /
      Math.max(1, INDUSTRIES[plant.type].consumes[ore] ?? 1) /
      CARGO[bars].capacity;
    const pickA = bestFreightLoco(ore, dA, oreLoads * 12);
    const pickB = bestFreightLoco(bars, dB, barLoads * 12);
    if (!pickA || !pickB) return null;
    const tpd = (loco: string): number =>
      (locomotiveById(loco)!.maxSpeedKmh * 0.8 * AVERAGE_SPEED_SHARE) / KMH_PER_TILE_PER_DAY;
    const trainsFor = (loads: number, cars: number, d: number, loco: string): number =>
      Math.max(1, Math.min(4, Math.ceil(loads / (cars * (30 / (2 * (d / tpd(loco)) + 6))))));
    const nA = trainsFor(oreLoads, pickA.cars, dA, pickA.id);
    const nB = trainsFor(barLoads, pickB.cars, dB, pickB.id);
    const big: StationType = year() >= 1870 ? "terminal" : "station";
    const costA = commands.computeBuyTrainPlan(state, pickA.id, Array(pickA.cars).fill(ore)).cost;
    const costB = commands.computeBuyTrainPlan(state, pickB.id, Array(pickB.cars).fill(bars)).cost;
    const stations =
      stationCost(legA.ta, big) +
      stationCost(legA.tb, big) +
      stationCost(legB.ta, big) +
      stationCost(legB.tb, "station");
    const track = legA.trackCost + legB.trackCost;
    const total = track + stations + nA * costA + nB * costB;
    const dTotal = dist(indTile(mine), indTile(sink));
    const kmh = Math.min(
      locomotiveById(pickB.id)!.maxSpeedKmh,
      locomotiveById(pickA.id)!.maxSpeedKmh,
    );
    const days = ((dA + dB) / tpd(pickB.id)) * 1.25 + 8;
    const fare = computeRevenue(state, bars, dTotal, days, kmh);
    const delivered = Math.min(
      barLoads * 12,
      nB * pickB.cars * 12 * (30 / (2 * (dB / tpd(pickB.id)) + 6)),
    );
    const revenue = delivered * fare;
    const profit =
      revenue -
      nA * pickA.costs -
      nB * pickB.costs -
      lineUpkeepPerYear(legA.edges + legB.edges, [big, big, big, "station"], track + stations);
    const payback = profit > 0 ? total / profit : Infinity;
    return {
      label: `chain ${def.id} (${Math.round(dA)}+${Math.round(dB)} tiles, ${nA}+${nB} trains)`,
      payback,
      total,
      build: () => {
        if (!ensureCash(total + reserve())) return false;
        if (!ok(commands.buildTrack(state, legA.path))) return false;
        if (
          !ok(commands.buildStation(state, legA.ta, big)) ||
          !ok(commands.buildStation(state, legA.tb, big))
        )
          return false;
        const a = state.stations.find((x) => x.tile === legA.ta)!;
        const b = state.stations.find((x) => x.tile === legA.tb)!;
        shed(a);
        chainBuilt = true;
        const oreLine: Line = {
          kind: "freight",
          stops: [a, b],
          cities: [],
          cargo: ore,
          trains: [],
          path: legA.path,
          doubled: false,
          samples: 0,
          blocked: 0,
          carloadsPerMonth: oreLoads,
          cars: pickA.cars,
          chain: true,
        };
        lines.push(oreLine);
        servedIndustries.add(mine.id);
        for (let i = 0; i < nA; i++) addTrain(oreLine);
        // the second leg is planned again: the first leg's track and stations are on the map now
        const again = planLeg(
          freeAround(indTile(plant), indTile(sink), 3).filter((t) => dist(t, legA.tb) > 1.5),
          freeAround(indTile(sink), indTile(plant), 2),
        );
        if (!again) return true;
        if (!ok(commands.buildTrack(state, again.path))) return true;
        if (
          !ok(commands.buildStation(state, again.ta, big)) ||
          !ok(commands.buildStation(state, again.tb, "station"))
        )
          return true;
        const c = state.stations.find((x) => x.tile === again.ta)!;
        const e = state.stations.find((x) => x.tile === again.tb)!;
        shed(c);
        const barLine: Line = {
          kind: "freight",
          stops: [c, e],
          cities: [],
          cargo: bars,
          trains: [],
          path: again.path,
          doubled: false,
          samples: 0,
          blocked: 0,
          carloadsPerMonth: barLoads,
          cars: pickB.cars,
          chain: true,
        };
        lines.push(barLine);
        for (let i = 0; i < nB; i++) addTrain(barLine);
        return true;
      },
    };
  }

  /** Sinks that take `cargo`: processors that consume it, and towns whose tiles accept it. */
  function sinksFor(
    cargo: CargoType,
    from: Industry,
  ): Array<{ tile: number; d: number; city?: City; ind?: Industry }> {
    const out: Array<{ tile: number; d: number; city?: City; ind?: Industry }> = [];
    for (const i of state.industries) {
      if (i.id === from.id || (INDUSTRIES[i.type].consumes[cargo] ?? 0) <= 0) continue;
      out.push({ tile: indTile(i), d: dist(indTile(i), indTile(from)), ind: i });
    }
    for (const c of state.cities) {
      if (c.tiles.length === 0 || c.population < 4_000) continue;
      if (cityTileAcceptance(c.tier, year())[cargo] === undefined) continue;
      out.push({ tile: cityCentre(c), d: dist(cityCentre(c), indTile(from)), city: c });
    }
    return out.filter((s) => s.d >= 12 && s.d <= MAX_LINE_TILES).sort((p, q) => p.d - q.d);
  }

  function freightProject(prod: Industry, cargo: CargoType, output: number): Project | null {
    const key = `fr${prod.id}-${cargo}`;
    if (failed.has(key)) return null;
    const sink = sinksFor(cargo, prod)[0];
    if (!sink) return null;
    const carloadsPerMonth = output / CARGO[cargo].capacity;
    if (carloadsPerMonth < 1.5) return null;
    const from = freeAround(indTile(prod), sink.tile, 2);
    const to = sink.ind
      ? freeAround(sink.tile, indTile(prod), 2)
      : cityTilesToward(sink.city!, indTile(prod));
    const leg = planLeg(from, to);
    if (!leg) {
      failed.add(key);
      return null;
    }
    const d = dist(leg.ta, leg.tb);
    const big = carloadsPerMonth >= 8;
    const srcType: StationType = big && year() >= 1870 ? "terminal" : "station";
    const dstType: StationType = big && year() >= 1870 ? "terminal" : "station";
    const loco = bestFreightLoco(cargo, d, carloadsPerMonth * 12);
    if (!loco || !Number.isFinite(loco.payback)) return null;
    const consist = Array(loco.cars).fill(cargo) as CargoType[];
    const trainCost = commands.computeBuyTrainPlan(state, loco.id, consist).cost;
    const total =
      leg.trackCost + stationCost(leg.ta, srcType) + stationCost(leg.tb, dstType) + trainCost;
    const profit =
      loco.profit - lineUpkeepPerYear(leg.edges, [srcType, dstType], total - trainCost);
    const payback = profit > 0 ? total / profit : Infinity;
    return {
      label: `freight ${cargo} ${INDUSTRIES[prod.type].name}`,
      payback,
      total,
      build: () => {
        if (!ensureCash(total + reserve())) return false;
        if (!ok(commands.buildTrack(state, leg.path))) return false;
        if (
          !ok(commands.buildStation(state, leg.ta, srcType)) ||
          !ok(commands.buildStation(state, leg.tb, dstType))
        )
          return false;
        const a = state.stations.find((s) => s.tile === leg.ta)!;
        const b = state.stations.find((s) => s.tile === leg.tb)!;
        shed(a);
        const line: Line = {
          kind: "freight",
          stops: [a, b],
          cities: [],
          cargo,
          trains: [],
          path: leg.path,
          doubled: false,
          samples: 0,
          blocked: 0,
          carloadsPerMonth,
        };
        lines.push(line);
        servedIndustries.add(prod.id);
        addTrain(line);
        return true;
      },
    };
  }

  function bootstrapProjects(): Project[] {
    const cities = state.cities
      .filter((c) => c.tiles.length > 0)
      .sort((p, q) => q.population - p.population)
      .slice(0, 10);
    const out: Project[] = [];
    for (const a of cities)
      for (const b of cities) {
        const d = dist(cityCentre(a), cityCentre(b));
        if (a.id >= b.id || d > MAX_LINE_TILES || d < 8) continue;
        const p = paxProject(a, b);
        if (p) out.push(p);
      }
    return out;
  }

  let candidateCache: { tick: number; projects: Project[] } | null = null;
  function candidates(): Project[] {
    // ranked once a month: the pathfinding for a dozen candidates is the bot's main cost
    if (candidateCache && state.ticks - candidateCache.tick < 30 * DAY)
      return candidateCache.projects;
    // Phase 82: a rollout may plan only so many times (planning is the bot's main cost); after that it only operates
    if (candidateBudget <= 0) {
      candidateCache = { tick: state.ticks, projects: [] };
      return [];
    }
    candidateBudget--;
    const projects: Project[] = [];
    const hubs = state.cities.filter((c) => connected.has(c.id) && c.tiles.length > 0);
    if (hubs.length === 0) {
      projects.push(...bootstrapProjects());
    } else {
      const towns = state.cities
        .filter((c) => c.tiles.length > 0 && c.population >= 6_000 && !connected.has(c.id))
        .map((c) => {
          const hub = hubs.reduce((b, h) =>
            dist(cityCentre(h), cityCentre(c)) < dist(cityCentre(b), cityCentre(c)) ? h : b,
          );
          const d = dist(cityCentre(hub), cityCentre(c));
          return { c, hub, d, score: (c.population + 0.5 * hub.population) / (d + 6) };
        })
        .filter((x) => x.d <= MAX_LINE_TILES)
        .sort((p, q) => q.score - p.score)
        .slice(0, 3);
      for (const t of towns) {
        const e = extendProject(t.c);
        if (e) projects.push(e);
        const p = paxProject(t.c, t.hub);
        if (p) projects.push(p);
      }
      // Phase 77: feeders from the towns not yet on a line (small ones too) into the nearest big station
      const feederTowns = state.cities
        .filter((c) => c.tiles.length > 0 && c.population >= 1_500 && !connected.has(c.id))
        .map((c) => ({ c, near: Math.min(...hubs.map((h) => dist(cityCentre(h), cityCentre(c)))) }))
        .filter((x) => x.near <= 40)
        .sort((p, q) => q.c.population / (q.near + 8) - p.c.population / (p.near + 8))
        .slice(0, 3);
      for (const t of feederTowns) {
        const f = feederProject(t.c);
        if (f) projects.push(f);
      }
      const ch = chainProject();
      if (ch) projects.push(ch);
      const producers = state.industries
        .filter((i) => !servedIndustries.has(i.id) && INDUSTRY_TYPES.includes(i.type))
        .flatMap((i) => {
          const econ = state.industryEconomy.get(i.id);
          return (Object.keys(INDUSTRIES[i.type].produces) as CargoType[]).map((c) => ({
            i,
            c,
            out: econ?.monthlyOutput[c] ?? INDUSTRIES[i.type].produces[c] ?? 0,
          }));
        })
        .filter((p) => p.c !== "goods" || p.i.type !== "port")
        .filter((p) => CARGO[p.c].era <= year() && !CARGO[p.c].chainLeg)
        .sort((p, q) => q.out / CARGO[q.c].capacity - p.out / CARGO[p.c].capacity)
        .slice(0, 4);
      for (const p of producers) {
        const f = freightProject(p.i, p.c, p.out);
        if (f) projects.push(f);
      }
    }
    const crowd = 1 + 0.08 * lines.filter((l) => l.kind === "pax").length;
    const rank = (p: Project): number => p.payback * (p.crowds ? crowd : 1);
    projects.sort((p, q) => rank(p) - rank(q));
    if (process.env["V"] === "2")
      console.log(
        year(),
        "candidates",
        projects
          .slice(0, 6)
          .map((p) => `${p.label} pb ${p.payback.toFixed(1)} total ${Math.round(p.total / 1000)}k`)
          .join(" | "),
        `cash ${Math.round(state.cash / 1000)}k room ${Math.round(borrowRoom() / 1000)}k`,
      );
    candidateCache = { tick: state.ticks, projects };
    return projects;
  }

  /** Phase 82: picks which affordable project to build (by label), or null to wait; absent = the best by payback (V2). */
  let candidateBudget = Infinity;
  const setCandidateBudget = (n: number): void => {
    candidateBudget = n;
  };
  let chooser:
    ((options: Array<{ label: string; payback: number; total: number }>) => string | null) | null =
    null;
  const setChooser = (c: typeof chooser): void => {
    chooser = c;
  };

  /** Builds the best project the company can pay for; returns true if it built one. */
  function buildBest(): boolean {
    // a project costs at least a station pair and a train: do not plan (the bot's main cost) before that is in reach
    if (state.cash + borrowRoom() < 150_000) return false;
    const list = candidates().filter((p) => p.payback <= MAX_PAYBACK_YEARS);
    // the first line: any the company can pay for (a poor start, Hard, may afford only the cheaper ones)
    const affordable = (lines.length === 0 ? list : list.slice(0, 3)).filter(
      (p) => state.cash + borrowRoom() >= p.total + reserve(),
    );
    if (affordable.length === 0) return false;
    // Phase 82: a chooser (the Strategist's lookahead) picks among the affordable projects, or none (wait)
    let p: Project | undefined = affordable[0];
    if (chooser) {
      const label = chooser(
        affordable.map(({ label, payback, total }) => ({ label, payback, total })),
      );
      p = label === null ? undefined : (affordable.find((q) => q.label === label) ?? affordable[0]);
    }
    if (!p) return false;
    if (candidateCache) candidateCache.projects = candidateCache.projects.filter((q) => q !== p);
    if (process.env["V"])
      console.log(
        year(),
        "build",
        p.label,
        `payback ${p.payback.toFixed(1)}`,
        `total ${Math.round(p.total / 1000)}k`,
        `cash ${Math.round(state.cash / 1000)}k`,
      );
    return p.build();
  }

  // --- running lines -------------------------------------------------------------------------------------------------

  function waiting(line: Line): number {
    if (line.kind === "freight")
      return state.stationCargo.get(line.stops[0]!.id)?.[line.cargo]?.amount ?? 0;
    return line.stops.reduce(
      (s, st) => s + (state.stationCargo.get(st.id)?.passengers?.amount ?? 0),
      0,
    );
  }

  /** Phase 77: the best project the company is saving for (its payback beats a plain extra train's, and it is within reach of
   * cash, credit and half a year's profit). Small spends that pay back slower than it wait, instead of eating the cash. */
  function savingFor(): Project | null {
    if (lines.length === 0) return null;
    const list = candidates().filter((p) => p.payback <= MAX_PAYBACK_YEARS);
    const best = list[0];
    if (!best) return null;
    const last = state.finance.lastYear;
    const reach = state.cash + borrowRoom() + 2.5 * Math.max(0, ledgerOperatingProfit(last));
    return best.total + reserve() <= reach ? best : null;
  }

  function addTrainsWhereWaiting(): boolean {
    let did = false;
    const saving = savingFor();
    for (const line of lines) {
      const cars = lineCarCount(line);
      const load =
        line.kind === "pax" ? (40 / PARTY_SIZE) * cars : CARGO[line.cargo].capacity * cars;
      const cap = line.kind === "pax" ? (line.feeder ? 3 : 8) : line.chain ? 8 : 6;
      if (line.trains.length >= cap || waiting(line) <= load) continue;
      if (layUp.lineHasLaidUp(state, line.trains)) continue; // bring a laid-up train back first
      // a train is worth adding only if it pays for itself within the payback the bot accepts
      const d = lineDistance(line);
      const e =
        line.kind === "pax"
          ? bestPaxLoco(line.cities, d, cars)
          : bestFreightLoco(line.cargo, d, line.carloadsPerMonth * 12, line.cars);
      // the chain's ore pays nothing itself: its worth is the bars it feeds, so it is judged with its line's bars
      if (!line.chain && (!e || !(e.payback <= MAX_PAYBACK_YEARS))) continue;
      if (saving && !line.chain && e && e.payback > saving.payback * 1.2) continue;
      if (state.cash < reserve() * 2) continue;
      if (addTrain(line)) did = true;
    }
    return did;
  }

  /** Ten-day sample: which lines had a train standing for a block (the signal for double track). */
  function sampleBlocks(): void {
    for (const line of lines) {
      line.samples++;
      if (
        line.trains.some(
          (id) => state.trains.find((t) => t.id === id)?.status === "waitingForBlock",
        )
      )
        line.blocked++;
    }
  }

  function doubleBusyTrack(): boolean {
    for (const line of lines) {
      if (line.doubled || line.trains.length < 3 || line.samples < 24) continue;
      if (line.blocked / line.samples < 0.12) continue;
      const plan = commands.computeUpgradePlan(state, line.path);
      if (!plan.valid || plan.cost > state.cash - reserve()) continue;
      if (ok(commands.upgradeTrack(state, line.path))) {
        line.doubled = true;
        return true;
      }
    }
    return false;
  }

  // --- Phase 77: right-sizing, engine replacement, losers ---------------------------------------------------------------

  const lastEdit = new Map<number, number>();
  const MONTH = 30 * DAY;

  /** Cars off trains under ~40 % full, cars on trains that run full while cargo waits. Freight runs loaded one way, so its
   * load history (averaged over all tiles run) is judged doubled. */
  function rightSize(): void {
    const saving = savingFor();
    for (const line of lines) {
      for (const id of line.trains) {
        const t = state.trains.find((x) => x.id === id);
        if (!t || t.laidUp || t.cars.length === 0) continue;
        if (state.ticks - (lastEdit.get(id) ?? t.purchaseTick) < 5 * MONTH) continue;
        const hist = t.loadHistory?.[line.cargo];
        if (!hist || hist.length < 3) continue;
        const avg = hist.slice(-3).reduce((a, b) => a + b, 0) / 3;
        const fill = line.kind === "freight" ? Math.min(1, avg * 2) : avg;
        const loco = locomotiveById(t.locoModelId)!;
        const n = t.cars.length;
        let target = n;
        if (fill < 0.4 && n > 2) target = Math.max(2, Math.ceil((n * fill) / 0.65));
        else if (
          fill > 0.88 &&
          waiting(line) >
            0.8 * (line.kind === "pax" ? (40 / PARTY_SIZE) * n : CARGO[line.cargo].capacity * n)
        )
          target = Math.min(loco.maxCars, 8, n + 2);
        if (target === n || (target > n && saving)) continue;
        const cars =
          line.kind === "pax"
            ? paxConsist(loco.id, target)
            : (Array(target).fill(line.cargo) as CargoType[]);
        const plan = commands.computeEditConsistPlan(state, id, cars);
        if (!plan.valid || plan.netCost > state.cash - reserve()) continue;
        if (ok(commands.editConsist(state, id, cars))) {
          lastEdit.set(id, state.ticks);
          line.cars = target;
        }
      }
    }
  }

  /** A much better engine than the one a train has: replace it when the net price is back within ENGINE_PAYBACK years. */
  const ENGINE_PAYBACK = 4;
  function replaceEngines(): void {
    let done = 0;
    const saving = savingFor();
    for (const line of lines) {
      const d = lineDistance(line);
      for (const id of line.trains) {
        if (done >= 3) return;
        const t = state.trains.find((x) => x.id === id);
        if (!t || t.laidUp) continue;
        const old = locomotiveById(t.locoModelId)!;
        const n = t.cars.length;
        const profitOf = (l: typeof old): number =>
          line.kind === "pax"
            ? estimatePayback(state, l, n, d).profit
            : estimateFreightPayback(state, l, n, d, line.cargo, line.carloadsPerMonth * 12).profit;
        const pool = line.kind === "pax" ? paxLocos() : freightLocos();
        let best: { id: string; gain: number; net: number } | undefined;
        const base = profitOf(old);
        for (const l of pool) {
          if (l.id === old.id || l.maxCars < n) continue;
          const plan = commands.computeReplaceLocoPlan(state, id, l.id);
          if (!plan.valid) continue;
          const gain = profitOf(l) - base;
          if (gain > 0 && plan.netCost / gain <= ENGINE_PAYBACK && (!best || gain > best.gain))
            best = { id: l.id, gain, net: plan.netCost };
        }
        if (!best || best.net > state.cash - 2 * reserve()) continue;
        if (saving && best.net / best.gain > saving.payback) continue;
        if (ok(commands.replaceLocomotive(state, id, best.id))) done++;
      }
    }
  }

  /** January: a train that lost money all last year on a line with other trains is sold (a lay-up that never ends). */
  function sellLosers(): void {
    for (const line of lines) {
      if (line.trains.length < 2 || line.chain) continue;
      for (const id of [...line.trains]) {
        if (line.trains.length < 2) break;
        const t = state.trains.find((x) => x.id === id);
        if (!t || t.laidUp || activePanic(state)) continue;
        if (state.ticks - t.purchaseTick < 15 * MONTH) continue;
        if (booksProfit(t.profit.lastYear) >= 0) continue;
        if (ok(commands.sellTrain(state, id))) line.trains.splice(line.trains.indexOf(id), 1);
      }
    }
  }

  function improvements(): void {
    for (const line of lines)
      line.stops.forEach((st, i) => {
        const city = line.cities[i];
        if (!city || city.population < 40_000 || state.cash < 1_000_000) return;
        commands.buildImprovement(state, st.id, "postOffice");
        commands.buildImprovement(state, st.id, "hotel");
      });
  }

  function housekeeping(): void {
    commands.relayTrack(state);
    const washouts = (state as unknown as { washouts?: Array<{ id: number }> }).washouts ?? [];
    for (const w of [...washouts])
      commands.rebuildBridge(state, w.id, year() >= 1840 ? "stone" : undefined);
  }

  function spend(): void {
    for (let guard = 0; guard < 6; guard++) {
      let did = addTrainsWhereWaiting();
      if (state.cash > 2 * reserve()) did = buildBest() || did;
      if (!did && state.cash > 1_000_000 + state.finance.loans) did = doubleBusyTrack();
      if (!did) break;
    }
  }

  // --- Phase 82: fork support. The bot's memory is plain data; stations and cities are saved by id and looked up again in
  // the state the new bot plays (a fork of the game state has new objects with the same ids). ---
  interface SavedLine extends Omit<Line, "stops" | "cities"> {
    stops: number[];
    cities: number[];
  }
  function exportMemory(): BotMemory {
    return {
      lines: lines.map((l): SavedLine => ({
        ...l,
        stops: l.stops.map((s) => s.id),
        cities: l.cities.map((c) => c.id),
        trains: [...l.trains],
        path: [...l.path],
      })),
      connected: [...connected],
      servedIndustries: [...servedIndustries],
      failed: [...failed],
      sheds: [...sheds],
      chainBuilt,
      lastEdit: [...lastEdit],
      layUp: layUp.exportState(),
    };
  }
  if (memory) {
    for (const l of memory.lines as SavedLine[])
      lines.push({
        ...l,
        stops: l.stops.map((id) => state.stations.find((s) => s.id === id)!),
        cities: l.cities.map((id) => state.cities.find((c) => c.id === id)!),
        trains: [...l.trains],
        path: [...l.path],
      });
    for (const x of memory.connected) connected.add(x);
    for (const x of memory.servedIndustries) servedIndustries.add(x);
    for (const x of memory.failed) failed.add(x);
    for (const x of memory.sheds) sheds.add(x);
    chainBuilt = memory.chainBuilt;
    for (const [k, v] of memory.lastEdit) lastEdit.set(k, v);
    layUp.importState(memory.layUp);
  }

  /** The first part of a month: three ten-day steps (sample blocks, lay-up policy, spend). */
  function monthA(): void {
    for (let k = 0; k < 3; k++) {
      day(10);
      sampleBlocks();
      layUp.manage(state);
      spend();
    }
  }
  /** The rest of a month; `m` is the month of the year, 0-11. */
  function monthB(m: number): void {
    fixWeightBridges(state);
    layUp.sample(state);
    if (m % 3 === 0) housekeeping();
    if (m % 2 === 1) rightSize();
    if (m === 2 || m === 8) replaceEngines();
    if (m === 0) sellLosers();
    if (m === 5) improvements();
    repayIfIdle();
  }

  return {
    state,
    lines,
    layUp,
    year,
    monthA,
    monthB,
    exportMemory,
    setChooser,
    setCandidateBudget,
    simMs: (): number => simMs,
  };
}

export type StrongBot = ReturnType<typeof createStrongBot>;

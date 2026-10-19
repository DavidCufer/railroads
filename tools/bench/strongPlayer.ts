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
 */
import * as commands from "../../src/sim/commands";
import { createGameState } from "../../src/sim/state";
import { advanceOneHour } from "../../src/sim/tick";
import { findBuildPath } from "../../src/sim/track/pathfind";
import { buyableLocomotivesIn, locomotiveById } from "../../src/data/trains";
import { CARGO, type CargoType } from "../../src/data/cargo";
import { INDUSTRIES, INDUSTRY_TYPES } from "../../src/data/industries";
import { PARTY_SIZE } from "../../src/data/economy";
import { STATION_TYPE_DEFS } from "../../src/data/stations";
import {
  ledgerOperatingCosts,
  ledgerOperatingProfit,
  ledgerRevenue,
  type LedgerPeriod,
} from "../../src/data/finance";
import { netWorth } from "../../src/sim/finance/ledger";
import { landPrices } from "../../src/sim/economy/land";
import { cityTileAcceptance } from "../../src/sim/economy/cityStats";
import { calendarFromTicks } from "../../src/sim/time";
import { stationMonthlyCost, trackEdgeMonthlyCost } from "../../src/sim/finance/costs";
import * as economy from "../../src/data/economy";
import type { TrackEdge } from "../../src/sim/track/types";
import { fixWeightBridges } from "./fixBridges";
import { estimateFreightPayback, estimatePayback } from "./paybackEstimate";
import type { City, Industry } from "../../src/sim/economy/types";
import type { Station } from "../../src/sim/stations/types";
import type { StationType } from "../../src/data/stations";

// the head office's share of running costs exists from Phase 59's cost proposal on (branch phase-59-costs); 0 before
const GENERAL_ADMIN_MARKUP =
  (economy as unknown as Record<string, number | undefined>)["GENERAL_ADMIN_MARKUP"] ?? 0;
const { PROPERTY_TAX_RATE } = economy;

const region = (process.argv[2] ?? "central-eu") as "central-eu";
const startYear = Number(process.argv[3] ?? 1900);
const difficulty = (process.argv[4] ?? "normal") as "easy" | "normal" | "hard";
const endYear = Number(process.argv[5] ?? startYear + 16);
const seed = Number(process.argv[6] ?? 1);

const T0 = Date.now();
const state = createGameState({ seed, region, startYear, difficulty });
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
}
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
  const n = Math.min(locomotiveById(locoId)!.maxCars, 6, cars);
  const mail = n >= 4 ? 1 : 0;
  return Array.from({ length: n }, (_, i) => (i < n - mail ? "passengers" : "mail"));
}

function bestPaxLoco(
  cities: readonly City[],
  d: number,
): { id: string; payback: number; profit: number } {
  let best: { id: string; payback: number; profit: number } | undefined;
  for (const l of paxLocos()) {
    const n = paxConsist(l.id, paxCars(cities)).length;
    const e = estimatePayback(state, l, n, d);
    if (!best || e.payback < best.payback)
      best = { id: l.id, payback: e.payback, profit: e.profit };
  }
  return best ?? { id: paxLocos()[0]!.id, payback: Infinity, profit: 0 };
}

function bestFreightLoco(
  cargo: CargoType,
  d: number,
  carloadsPerYear: number,
): { id: string; cars: number; payback: number; profit: number } | undefined {
  let best: { id: string; cars: number; payback: number; profit: number } | undefined;
  for (const l of freightLocos()) {
    // one train should carry about what the source puts out, no more than the engine hauls
    const want = Math.max(3, Math.ceil(carloadsPerYear / 12 / 2));
    const n = Math.min(l.maxCars, want);
    const e = estimateFreightPayback(state, l, n, d, cargo, carloadsPerYear);
    if (!best || e.payback < best.payback)
      best = { id: l.id, cars: n, payback: e.payback, profit: e.profit };
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
      line.kind === "freight" && i === 0 && line.stops[0]!.type === "terminal"
        ? ("fullLoad" as const)
        : ("auto" as const),
  }));
  commands.setOrders(state, trainId, orders);
}

function lineConsist(line: Line, locoId: string): CargoType[] {
  if (line.kind === "pax") return paxConsist(locoId, paxCars(line.cities));
  const l = locomotiveById(locoId)!;
  const want = Math.max(3, Math.ceil(line.carloadsPerMonth / 2));
  return Array(Math.min(l.maxCars, want)).fill(line.cargo) as CargoType[];
}

function lineDistance(line: Line): number {
  return dist(line.stops[0]!.tile, line.stops[line.stops.length - 1]!.tile);
}

function addTrain(line: Line): boolean {
  const d = lineDistance(line);
  const locoId =
    line.kind === "pax"
      ? bestPaxLoco(line.cities, d).id
      : (bestFreightLoco(line.cargo, d, line.carloadsPerMonth * 12)?.id ?? freightLocos()[0]!.id);
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
  const total = leg.trackCost + stationCost(leg.ta, ta) + stationCost(leg.tb, tb) + 2 * trainCost;
  const profit =
    2 * loco.profit -
    lineUpkeepPerYear(
      leg.edges,
      [ta, tb],
      leg.trackCost + stationCost(leg.ta, ta) + stationCost(leg.tb, tb),
    );
  const payback = profit > 0 ? total / profit : Infinity;
  return {
    label: `pax ${city.name}-${hub.name}`,
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
        carloadsPerMonth: 0,
      };
      lines.push(line);
      connected.add(city.id);
      connected.add(hub.id);
      addTrain(line);
      addTrain(line);
      return true;
    },
  };
}

/** A new town on the way: extend the line whose far end is nearest (the owner's multi-stop lines). */
function extendProject(city: City): Project | null {
  let best: { line: Line; d: number } | undefined;
  for (const line of lines) {
    if (line.kind !== "pax") continue;
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
  const profit = loco.profit - lineUpkeepPerYear(leg.edges, [srcType, dstType], total - trainCost);
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
        carloadsPerMonth,
      };
      lines.push(line);
      servedIndustries.add(prod.id);
      addTrain(line);
      return true;
    },
  };
}

function bootstrapProject(): Project | null {
  const cities = state.cities
    .filter((c) => c.tiles.length > 0)
    .sort((p, q) => q.population - p.population)
    .slice(0, 10);
  let best: Project | null = null;
  for (const a of cities)
    for (const b of cities) {
      const d = dist(cityCentre(a), cityCentre(b));
      if (a.id >= b.id || d > MAX_LINE_TILES || d < 8) continue;
      const p = paxProject(a, b);
      if (p && (!best || p.payback < best.payback)) best = p;
    }
  return best;
}

let candidateCache: { tick: number; projects: Project[] } | null = null;
function candidates(): Project[] {
  // ranked once a month: the pathfinding for a dozen candidates is the bot's main cost
  if (candidateCache && state.ticks - candidateCache.tick < 30 * DAY)
    return candidateCache.projects;
  const projects: Project[] = [];
  const hubs = state.cities.filter((c) => connected.has(c.id) && c.tiles.length > 0);
  if (hubs.length === 0) {
    const p = bootstrapProject();
    if (p) projects.push(p);
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
  projects.sort((p, q) => p.payback - q.payback);
  candidateCache = { tick: state.ticks, projects };
  return projects;
}

/** Builds the best project the company can pay for; returns true if it built one. */
function buildBest(): boolean {
  // a project costs at least a station pair and a train: do not plan (the bot's main cost) before that is in reach
  if (state.cash + borrowRoom() < 150_000) return false;
  const list = candidates().filter((p) => p.payback <= MAX_PAYBACK_YEARS);
  for (const p of list.slice(0, 3)) {
    if (state.cash + borrowRoom() < p.total + reserve()) continue;
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
  return false;
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

function addTrainsWhereWaiting(): boolean {
  let did = false;
  for (const line of lines) {
    const cars =
      line.kind === "pax"
        ? paxCars(line.cities)
        : Math.max(3, Math.ceil(line.carloadsPerMonth / 2));
    const load = line.kind === "pax" ? (40 / PARTY_SIZE) * cars : CARGO[line.cargo].capacity * cars;
    const cap = line.kind === "pax" ? 8 : 6;
    if (line.trains.length >= cap || waiting(line) <= load) continue;
    // a train is worth adding only if it pays for itself within the payback the bot accepts
    const d = lineDistance(line);
    const e =
      line.kind === "pax"
        ? bestPaxLoco(line.cities, d)
        : bestFreightLoco(line.cargo, d, line.carloadsPerMonth * 12);
    if (!e || !(e.payback <= MAX_PAYBACK_YEARS)) continue;
    if (state.cash < reserve() * 2) continue;
    if (addTrain(line)) did = true;
  }
  return did;
}

function doubleBusyTrack(): boolean {
  for (const line of lines) {
    if (line.doubled || line.trains.length < 4) continue;
    const plan = commands.computeUpgradePlan(state, line.path);
    if (!plan.valid || plan.cost > state.cash - reserve()) continue;
    if (ok(commands.upgradeTrack(state, line.path))) {
      line.doubled = true;
      return true;
    }
  }
  return false;
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

// --- the run ----------------------------------------------------------------------------------------------------------

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
    for (let k = 0; k < 3; k++) {
      day(10);
      spend();
    }
    fixWeightBridges(state);
    if (m % 3 === 0) housekeeping();
    if (m === 5) improvements();
    repayIfIdle();
    if (process.env["TRACE"])
      console.log(
        year(),
        `m${m}`,
        `cash ${Math.round(state.cash / 1e3)}k loans ${Math.round(state.finance.loans / 1e3)}k NW ${Math.round(netWorth(state) / 1e3)}k neg ${state.finance.negativeCashMonths} trains ${state.trains.length} limit ${Math.round(commands.creditLimit(state) / 1e3)}k`,
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
console.log(`TIME total ${Math.round((Date.now() - T0) / 1000)}s sim ${Math.round(simMs / 1000)}s`);
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

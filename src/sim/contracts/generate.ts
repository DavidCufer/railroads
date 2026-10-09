/**
 * Contract generation (Phase 45): offers are drawn from the current game state — towns and producers near the network,
 * real unmet demand, era cargo — and priced from what they would cost to fulfil. Uses only `state.contracts.rng`.
 */
import { CARGO, type CargoType } from "../../data/cargo";
import { CITY_TIERS } from "../../data/cities";
import {
  CONNECTION,
  DEADLINE_MONTHS,
  DIFFICULTY_DEADLINE_MULT,
  DIFFICULTY_REWARD_MULT,
  KIND_WEIGHT,
  MARGIN_RANGE,
  MIN_HAUL_TILES,
  MIN_REWARD_1830,
  OFFER_LIFE_MONTHS,
  OP_SHARE,
  PAIR_PASSENGER_SHARE,
  REWARD_CAP_NET_WORTH,
  RESCUE,
  ROUND_TO_CARS,
  SETUP_DAYS,
  STOCK_SHARE,
  TRACK_SHARE,
  SUPPLY_SHARE,
  TRIP_LOAD_DAYS,
  TRIP_SLACK,
  EFFECTIVE_SPEED_SHARE,
  CONTRACT_KINDS,
  type ContractKind,
} from "../../data/contracts";
import { eraInflation, DIFFICULTY } from "../../data/finance";
import { INDUSTRIES } from "../../data/industries";
import { KMH_PER_TILE_PER_DAY, buyableLocomotivesIn, type LocomotiveDef } from "../../data/trains";
import { priceIndex } from "../../data/economy";
import { cityTileAcceptance, citySupply } from "../economy/cityStats";
import { landPrices } from "../economy/land";
import type { City, Industry } from "../economy/types";
import { locoRunningCostPerYear } from "../finance/costs";
import { netWorth } from "../finance/ledger";
import { nextFloat } from "../rng";
import type { GameState } from "../state";
import { DAYS_PER_MONTH, DAYS_PER_YEAR, HOURS_PER_DAY, calendarFromTicks } from "../time";
import { findBuildPath } from "../track/pathfind";
import { evaluatePath, pathIsValid } from "../track/cost";
import {
  cityTile,
  industryTile,
  nearestStation,
  networkStations,
  reachTiles,
  stationCoversCity,
  stationCoversIndustry,
  tileDistance,
} from "./places";
import type { Contract } from "./types";

const MONTH_TICKS = DAYS_PER_MONTH * HOURS_PER_DAY;

interface Candidate {
  weight: number;
  build: () => Contract | null;
}

function year(state: GameState): number {
  return calendarFromTicks(state.startYear, state.ticks).year;
}

/** Cost of the track still to build from the network to `tile` (0 when a station already covers it), or null when no
 * track can reach it. */
export function linkCost(state: GameState, coveredBy: boolean, tile: number): number | null {
  if (coveredBy) return 0;
  const from = nearestStation(state, tile);
  if (!from) return null;
  const y = year(state);
  const land = landPrices(state);
  const ctx = { year: y, buildCostMult: DIFFICULTY[state.difficulty].buildCostMult, land };
  const path = findBuildPath(state.map, from.station.tile, tile, y, { land });
  if (!path || path.length < 2) return null;
  const steps = evaluatePath(state.map, path, ctx);
  if (!pathIsValid(steps)) return null;
  let cost = 0;
  for (const s of steps) if (!state.trackGraph.hasEdge(s.a, s.b)) cost += s.cost + s.land;
  return cost;
}

/** The engine a contract is priced with: the fastest buyable one (a freight haul never needs the passenger-only set). */
function haulLoco(state: GameState, passengers: boolean): LocomotiveDef | undefined {
  let best: LocomotiveDef | undefined;
  for (const l of buyableLocomotivesIn(year(state))) {
    if (l.passengerMailOnly && !passengers) continue;
    if (
      !best ||
      l.maxSpeedKmh > best.maxSpeedKmh ||
      (l.maxSpeedKmh === best.maxSpeedKmh && l.cost < best.cost)
    )
      best = l;
  }
  return best;
}

interface HaulPlan {
  months: number;
  trains: number;
  /** Price of the rolling stock needed and its operating cost over the period. */
  stock: number;
  operating: number;
  tripsPerTrain: number;
}

/** What it takes to move `quantity` of `cargo` over `distTiles` within the deadline: how long the deadline is (set-up
 * plus a slack factor on the round trip, in the kind's month range), and the trains and cars needed. */
function planHaul(
  state: GameState,
  kind: ContractKind,
  cargo: CargoType,
  distTiles: number,
  quantityFor: (months: number) => number,
): HaulPlan | null {
  const loco = haulLoco(state, cargo === "passengers" || cargo === "mail");
  if (!loco) return null;
  const y = year(state);
  const tilesPerDay = (loco.maxSpeedKmh * EFFECTIVE_SPEED_SHARE) / KMH_PER_TILE_PER_DAY;
  const tripDays = (2 * distTiles) / tilesPerDay + TRIP_LOAD_DAYS;
  const [minM, maxM] = DEADLINE_MONTHS[kind];
  const dm = DIFFICULTY_DEADLINE_MULT[state.difficulty];
  const wanted = Math.ceil((SETUP_DAYS + TRIP_SLACK * tripDays) / DAYS_PER_MONTH);
  const months = Math.max(1, Math.round(Math.min(maxM, Math.max(minM, wanted)) * dm));
  const quantity = quantityFor(months);
  const cap = CARGO[cargo].capacity;
  const tripsPerTrain = Math.max(1, Math.floor((months * DAYS_PER_MONTH - SETUP_DAYS) / tripDays));
  const perCarAll = tripsPerTrain * cap;
  const carsTotal = Math.max(1, Math.ceil(quantity / perCarAll));
  const trains = Math.ceil(carsTotal / loco.maxCars);
  const carsPerTrain = Math.ceil(carsTotal / trains);
  const mult = eraInflation(y) * DIFFICULTY[state.difficulty].buildCostMult;
  const stock = trains * (loco.cost + carsPerTrain * CARGO[cargo].carCost) * mult;
  const operating =
    trains * locoRunningCostPerYear(loco, 0, y) * ((months * DAYS_PER_MONTH) / DAYS_PER_YEAR);
  return { months, trains, stock, operating, tripsPerTrain };
}

function roundMoney(v: number): number {
  const step = v >= 100_000 ? 5_000 : v >= 20_000 ? 1_000 : 500;
  return Math.round(v / step) * step;
}

/** Reward = effort × (1 + margin) × difficulty, capped at a share of net worth. Null when below the smallest offer. */
export function rewardFor(state: GameState, effort: number, margin: number): number | null {
  const raw = effort * (1 + margin) * DIFFICULTY_REWARD_MULT[state.difficulty];
  const cap = REWARD_CAP_NET_WORTH * Math.max(0, netWorth(state));
  const reward = roundMoney(Math.min(raw, cap));
  return reward >= MIN_REWARD_1830 * priceIndex(year(state)) ? reward : null;
}

function margin(state: GameState): number {
  const [lo, hi] = MARGIN_RANGE;
  return lo + (hi - lo) * nextFloat(state.contracts.rng);
}

function roundUnits(quantity: number, cargo: CargoType): number {
  const step = ROUND_TO_CARS * CARGO[cargo].capacity;
  return Math.floor(quantity / step) * step;
}

function base(state: GameState, kind: ContractKind): Contract {
  return {
    id: state.contracts.nextId,
    kind,
    target: 0,
    progress: 0,
    reward: 0,
    durationTicks: 0,
    offeredTick: state.ticks,
    expiresTick: state.ticks + OFFER_LIFE_MONTHS * MONTH_TICKS,
  };
}

function taken(state: GameState, pred: (c: Contract) => boolean): boolean {
  return state.contracts.offers.some(pred) || state.contracts.active.some(pred);
}

function coveredCity(state: GameState, city: City): boolean {
  return networkStations(state).some((s) => stationCoversCity(state, s, city));
}

function candidates(state: GameState): Record<ContractKind, Candidate[]> {
  const out: Record<ContractKind, Candidate[]> = {
    delivery: [],
    connection: [],
    service: [],
    rescue: [],
  };
  const stations = networkStations(state);
  if (stations.length === 0) return out;
  const y = year(state);
  const width = state.map.width;
  const reach = reachTiles(state);
  const near = (tile: number): boolean =>
    (nearestStation(state, tile)?.distance ?? Infinity) <= reach;
  const cities = state.cities.filter((c) => c.tiles.length > 0 && c.population > 0);

  // --- Delivery: a town that demands a cargo some producer near the network makes -----------------------------------
  for (const city of cities) {
    if (!near(cityTile(state, city))) continue;
    const accepts = cityTileAcceptance(city.tier, y);
    for (const cargo of Object.keys(accepts) as CargoType[]) {
      if (cargo === "passengers" || cargo === "mail") continue;
      if (taken(state, (c) => c.kind === "delivery" && c.cityId === city.id && c.cargo === cargo))
        continue;
      let best: { industry: Industry; output: number; dist: number } | undefined;
      for (const industry of state.industries) {
        const output = state.industryEconomy.get(industry.id)?.monthlyOutput[cargo] ?? 0;
        if (output <= 0 || !near(industryTile(state, industry))) continue;
        const dist = tileDistance(width, industryTile(state, industry), cityTile(state, city));
        if (dist < MIN_HAUL_TILES || dist > 2 * reach) continue;
        if (!best || output > best.output) best = { industry, output, dist };
      }
      if (!best) continue;
      const source = best;
      out.delivery.push({
        weight: coveredCity(state, city) ? 1 : 2,
        build: () => {
          const months = (m: number): number => {
            const full = SUPPLY_SHARE * source.output * m;
            return roundUnits(full * (0.4 + 0.6 * nextFloat(state.contracts.rng)), cargo);
          };
          let quantity = 0;
          const plan = planHaul(
            state,
            "delivery",
            cargo,
            source.dist,
            (m) => (quantity = months(m)),
          );
          if (!plan || quantity <= 0) return null;
          const a = linkCost(state, coveredCity(state, city), cityTile(state, city));
          const b = linkCost(
            state,
            stations.some((s) => stationCoversIndustry(state, s, source.industry)),
            industryTile(state, source.industry),
          );
          if (a === null || b === null) return null;
          const effort =
            TRACK_SHARE * (a + b) + STOCK_SHARE * plan.stock + OP_SHARE * plan.operating;
          const reward = rewardFor(state, effort, margin(state));
          if (reward === null) return null;
          return {
            ...base(state, "delivery"),
            cityId: city.id,
            cargo,
            target: quantity,
            reward,
            durationTicks: plan.months * MONTH_TICKS,
          };
        },
      });
    }
  }

  // --- Service: carry passengers between two towns near the network -------------------------------------------------
  const nearCities = cities.filter((c) => near(cityTile(state, c)));
  for (let i = 0; i < nearCities.length; i++) {
    for (let j = i + 1; j < nearCities.length; j++) {
      const a = nearCities[i] as City;
      const b = nearCities[j] as City;
      const dist = tileDistance(width, cityTile(state, a), cityTile(state, b));
      if (dist < MIN_HAUL_TILES || dist > 2 * reach) continue;
      if (
        taken(
          state,
          (c) =>
            c.kind === "service" &&
            ((c.cityId === a.id && c.city2Id === b.id) ||
              (c.cityId === b.id && c.city2Id === a.id)),
        )
      )
        continue;
      const supply = Math.min(citySupply(a, y).passengers, citySupply(b, y).passengers);
      out.service.push({
        weight: 1,
        build: () => {
          let quantity = 0;
          const plan = planHaul(state, "service", "passengers", dist, (m) => {
            quantity = roundUnits(SUPPLY_SHARE * PAIR_PASSENGER_SHARE * supply * m, "passengers");
            return quantity;
          });
          if (!plan || quantity <= 0) return null;
          const la = linkCost(state, coveredCity(state, a), cityTile(state, a));
          const lb = linkCost(state, coveredCity(state, b), cityTile(state, b));
          if (la === null || lb === null) return null;
          const effort =
            TRACK_SHARE * (la + lb) + STOCK_SHARE * plan.stock + OP_SHARE * plan.operating;
          const reward = rewardFor(state, effort, margin(state));
          if (reward === null) return null;
          return {
            ...base(state, "service"),
            cityId: a.id,
            city2Id: b.id,
            cargo: "passengers",
            target: quantity,
            reward,
            durationTicks: plan.months * MONTH_TICKS,
          };
        },
      });
    }
  }

  // --- Connection: a town with no station, within reach, that pays half the track -----------------------------------
  for (const city of cities) {
    if (coveredCity(state, city)) continue;
    const from = nearestStation(state, cityTile(state, city));
    if (!from || from.distance < CONNECTION.minTiles || from.distance > reach) continue;
    if (taken(state, (c) => c.kind === "connection" && c.cityId === city.id)) continue;
    out.connection.push({
      weight: 1 + CITY_TIERS.indexOf(city.tier) * 0.5,
      build: () => {
        const cost = linkCost(state, false, cityTile(state, city));
        if (cost === null) return null;
        const cap = rewardFor(state, CONNECTION.subsidyShare * cost * CONNECTION.capSlack, 0);
        if (cap === null) return null;
        const [minM, maxM] = DEADLINE_MONTHS.connection;
        const months = Math.round(
          (minM + (maxM - minM) * nextFloat(state.contracts.rng)) *
            DIFFICULTY_DEADLINE_MULT[state.difficulty],
        );
        return {
          ...base(state, "connection"),
          cityId: city.id,
          reward: cap,
          paid: 0,
          fromTile: from.station.tile,
          toTile: cityTile(state, city),
          durationTicks: months * MONTH_TICKS,
        };
      },
    });
  }

  // --- Rescue: a raw producer nobody serves, which winds down unless somebody hauls from it -------------------------
  for (const industry of state.industries) {
    const def = INDUSTRIES[industry.type];
    if (def.placement.kind !== "terrain") continue;
    const econ = state.industryEconomy.get(industry.id);
    const cargo = (Object.keys(def.produces) as CargoType[])[0];
    const output = cargo ? (econ?.monthlyOutput[cargo] ?? 0) : 0;
    if (!cargo || output <= 0) continue;
    if ((econ?.carriedShare ?? 0) >= RESCUE.maxCarriedShare) continue;
    if (!near(industryTile(state, industry))) continue;
    if (taken(state, (c) => c.kind === "rescue" && c.industryId === industry.id)) continue;
    out.rescue.push({
      weight: 1,
      build: () => {
        // hauled to the nearest town, at least a paying distance away
        let nearestTown = MIN_HAUL_TILES;
        const dists = cities.map((c) =>
          tileDistance(width, industryTile(state, industry), cityTile(state, c)),
        );
        if (dists.length > 0) nearestTown = Math.max(MIN_HAUL_TILES, Math.min(...dists));
        const dist = nearestTown;
        let quantity = 0;
        const plan = planHaul(state, "rescue", cargo, dist, (m) => {
          quantity = roundUnits(RESCUE.haulShare * output * m, cargo);
          return quantity;
        });
        if (!plan || quantity <= 0) return null;
        const link = linkCost(
          state,
          stations.some((s) => stationCoversIndustry(state, s, industry)),
          industryTile(state, industry),
        );
        if (link === null) return null;
        const effort = TRACK_SHARE * link + STOCK_SHARE * plan.stock + OP_SHARE * plan.operating;
        const reward = rewardFor(state, effort, margin(state));
        if (reward === null) return null;
        return {
          ...base(state, "rescue"),
          industryId: industry.id,
          cargo,
          target: quantity,
          reward,
          durationTicks: plan.months * MONTH_TICKS,
        };
      },
    });
  }
  return out;
}

/** Draws one new offer, or null when nothing sensible exists. Weighted random choice of kind, then of candidate;
 * a candidate that turns out unreachable or too small is dropped and another tried. */
export function generateOffer(state: GameState): Contract | null {
  const pool = candidates(state);
  const rng = state.contracts.rng;
  for (let attempt = 0; attempt < 8; attempt++) {
    const kinds = CONTRACT_KINDS.filter((k) => pool[k].length > 0);
    if (kinds.length === 0) return null;
    let total = 0;
    for (const k of kinds) total += KIND_WEIGHT[k];
    let roll = nextFloat(rng) * total;
    let kind = kinds[kinds.length - 1] as ContractKind;
    for (const k of kinds) {
      roll -= KIND_WEIGHT[k];
      if (roll < 0) {
        kind = k;
        break;
      }
    }
    const list = pool[kind];
    let weights = 0;
    for (const c of list) weights += c.weight;
    let r = nextFloat(rng) * weights;
    let idx = list.length - 1;
    for (let i = 0; i < list.length; i++) {
      r -= (list[i] as Candidate).weight;
      if (r < 0) {
        idx = i;
        break;
      }
    }
    const [chosen] = list.splice(idx, 1);
    const contract = (chosen as Candidate).build();
    if (contract) return contract;
  }
  return null;
}

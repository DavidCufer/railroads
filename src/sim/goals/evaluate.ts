/**
 * Pure goal-progress evaluation (SPEC §11) — reads `GameState`, never mutates it. Called by the
 * Goals panel (on demand) and by `src/sim/economy/goalTracking.ts`'s daily step (to detect a
 * newly-completed goal for the celebration dialog/news toast).
 */
import { ledgerRevenue } from "../../data/finance";
import { CITY_TIERS } from "../../data/cities";
import { STATION_TYPE_DEFS } from "../../data/stations";
import { netWorth } from "../finance/ledger";
import { stationCatchmentTiles } from "../stations/placement";
import { calendarFromTicks } from "../time";
import type { GameState } from "../state";
import type { City } from "../economy/types";
import type { Goal, GoalStatus } from "./types";

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Track tiles (station tiles) that connect at least one of `city`'s footprint tiles to the rail
 * network — same "covered by some station's catchment" concept SPEC §6.3/§8.3 already use. */
function connectorTiles(state: GameState, city: City): number[] {
  if (city.tiles.length === 0) return [];
  const cityTiles = new Set(city.tiles);
  const tiles: number[] = [];
  for (const station of state.stations) {
    const radius = STATION_TYPE_DEFS[station.type].catchmentRadius;
    for (const t of stationCatchmentTiles(state.map, station.tile, radius)) {
      if (cityTiles.has(t)) {
        tiles.push(station.tile);
        break;
      }
    }
  }
  return tiles;
}

/** Whether every city in `cityIds` is on one mutually-reachable rail network — a BFS from any one
 * connector tile of the first city, checking every other city has a connector tile in the visited
 * set. A city not yet founded (future `foundingYear`, empty `tiles`) can never satisfy this. */
function citiesConnectedByTrack(state: GameState, cityIds: number[]): boolean {
  const cities = cityIds.map((id) => state.cities[id]).filter((c): c is City => c !== undefined);
  if (cities.length !== cityIds.length) return false;
  const connectorSets = cities.map((c) => connectorTiles(state, c));
  if (connectorSets.some((set) => set.length === 0)) return false;

  const start = (connectorSets[0] as number[])[0] as number;
  const visited = new Set<number>([start]);
  const queue: number[] = [start];
  while (queue.length > 0) {
    const cur = queue.shift() as number;
    for (const next of state.trackGraph.neighborsOf(cur)) {
      if (visited.has(next)) continue;
      visited.add(next);
      queue.push(next);
    }
  }
  return connectorSets.every((set) => set.some((t) => visited.has(t)));
}

function countElectrifiedTiles(state: GameState): number {
  const tiles = new Set<number>();
  for (const edge of state.trackGraph.allEdges()) {
    if (!edge.electrified) continue;
    tiles.add(edge.a);
    tiles.add(edge.b);
  }
  return tiles.size;
}

export function evaluateGoal(state: GameState, goal: Goal): GoalStatus {
  const year = calendarFromTicks(state.startYear, state.ticks).year;
  const def = goal.def;

  let complete: boolean;
  let current: number;
  let target: number;
  let byYear: number;

  switch (def.type) {
    case "connect": {
      complete = citiesConnectedByTrack(state, def.cityIds);
      current = complete ? 1 : 0;
      target = 1;
      byYear = def.byYear;
      break;
    }
    case "annualRevenue": {
      current = Math.max(
        ledgerRevenue(state.finance.lastYear),
        ledgerRevenue(state.finance.thisYear),
      );
      target = def.amount;
      complete = current >= target;
      byYear = def.byYear;
      break;
    }
    case "netWorth": {
      current = netWorth(state);
      target = def.amount;
      complete = current >= target;
      byYear = def.byYear;
      break;
    }
    case "cityTier": {
      const city = state.cities[def.cityId];
      const cityRank = city ? CITY_TIERS.indexOf(city.tier) : -1;
      const targetRank = CITY_TIERS.indexOf(def.tier);
      current = Math.max(0, cityRank);
      target = targetRank;
      complete = cityRank >= targetRank;
      byYear = def.byYear;
      break;
    }
    case "delivered": {
      const thisYear = state.cargoDeliveredThisYear[def.cargo] ?? 0;
      const bestYear = state.cargoDeliveredBestYear[def.cargo] ?? 0;
      current = Math.max(thisYear, bestYear);
      target = def.amount;
      complete = current >= target;
      byYear = def.withinYear;
      break;
    }
    case "electrifiedTiles": {
      current = countElectrifiedTiles(state);
      target = def.amount;
      complete = current >= target;
      byYear = def.byYear;
      break;
    }
  }

  return {
    goal,
    complete,
    progress: target > 0 ? clamp01(current / target) : complete ? 1 : 0,
    current,
    target,
    overdue: !complete && year > byYear,
  };
}

export function evaluateGoals(state: GameState): GoalStatus[] {
  return state.goals.map((goal) => evaluateGoal(state, goal));
}

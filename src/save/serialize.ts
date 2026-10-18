/** Converts between `GameState` and the plain-JSON `SerializedGameStateV1` (SPEC §13). Pure,
 * DOM-free (only `btoa`/`atob`, available in Node/vitest and every browser) — testable without
 * IndexedDB or a browser, per CLAUDE.md's "simulation code must be testable without a DOM". */
import { createContractsState } from "../sim/contracts/types";
import { createHistory } from "../sim/history";
import { clampInputStocks } from "../sim/economy/processing";
import { materializeAllJunctions } from "../sim/track/routes";
import { emptyTrainProfit } from "../sim/trains/profit";
import type { TrainProfit } from "../sim/trains/types";
import type { GameState, StationCargoPile } from "../sim/state";
import { CARGO } from "../data/cargo";
import type { GameMap } from "../sim/map/types";
import { TrackGraph } from "../sim/track/graph";
import { PARTY_SIZE } from "../data/economy";
import { computeStationEconomies } from "../sim/stations/economy";
import { destinationSets, passengerNetwork } from "../sim/stations/destinations";
import { emptyLedgerPeriod, type LedgerPeriod } from "../data/finance";
import type {
  SerializedFinanceStateV1,
  SerializedGameMapV1,
  SerializedGameStateV3,
  SerializedTrainV3,
} from "./format";
import {
  decodeFloat32Array,
  decodeInt16Array,
  decodeInt32Array,
  decodeUint16Array,
  decodeUint8Array,
  encodeTypedArray,
} from "./typedArray";
import { calendarFromTicks } from "../sim/time";

function serializeMap(map: GameMap): SerializedGameMapV1 {
  return {
    width: map.width,
    height: map.height,
    terrainB64: encodeTypedArray(map.terrain),
    elevationB64: encodeTypedArray(map.elevation),
    elevationRawB64: encodeTypedArray(map.elevationRaw),
    riverFlowB64: encodeTypedArray(map.riverFlow),
    riverNextB64: encodeTypedArray(map.riverNext),
    cityIdB64: encodeTypedArray(map.cityId),
    industryIdB64: encodeTypedArray(map.industryId),
  };
}

function deserializeMap(data: SerializedGameMapV1): GameMap {
  return {
    width: data.width,
    height: data.height,
    terrain: decodeUint8Array(data.terrainB64),
    elevation: decodeUint8Array(data.elevationB64),
    elevationRaw: decodeFloat32Array(data.elevationRawB64),
    riverFlow: decodeUint16Array(data.riverFlowB64),
    riverNext: decodeInt32Array(data.riverNextB64),
    cityId: decodeInt16Array(data.cityIdB64),
    industryId: decodeInt16Array(data.industryIdB64),
  };
}

function mapEntries<K, V>(map: ReadonlyMap<K, V>): Array<[K, V]> {
  return Array.from(map.entries());
}

function entriesMap<K, V>(entries: ReadonlyArray<[K, V]>): Map<K, V> {
  return new Map(entries);
}

export function serializeGameState(state: GameState): SerializedGameStateV3 {
  return {
    seed: state.seed,
    rng: { ...state.rng },
    map: serializeMap(state.map),
    cities: state.cities,
    industries: state.industries,
    startYear: state.startYear,
    ticks: state.ticks,
    difficulty: state.difficulty,
    cash: state.cash,
    trackEdges: state.trackGraph.allEdges(),
    nodeRoutes: state.trackGraph.allExplicitRoutes(),
    stations: state.stations,
    nextStationId: state.nextStationId,
    trains: state.trains.map((t): SerializedTrainV3 => ({
      ...t,
      blockPenalties: mapEntries(t.blockPenalties),
    })),
    nextTrainId: state.nextTrainId,
    trackVersion: state.trackVersion,
    stationCargo: mapEntries(state.stationCargo),
    stationTransfer: mapEntries(state.stationTransfer),
    stationFlow: mapEntries(state.stationFlow),
    departures: mapEntries(state.departures),
    passengerParty: PARTY_SIZE,
    washouts: state.washouts,
    nextWashoutId: state.nextWashoutId,
    industryEconomy: mapEntries(state.industryEconomy),
    finance: state.finance,
    pendingDeliveries: state.pendingDeliveries,
    news: state.news,
    nextNewsId: state.nextNewsId,
    pendingNews: state.pendingNews,
    newsReadUpTo: state.newsReadUpTo,
    cityGrowth: mapEntries(state.cityGrowth),
    mapContentVersion: state.mapContentVersion,
    ...(state.regionId !== undefined ? { regionId: state.regionId } : {}),
    pendingCityFoundings: state.pendingCityFoundings,
    goals: state.goals,
    goalsCompleted: Array.from(state.goalsCompleted),
    pendingGoalCelebrations: state.pendingGoalCelebrations,
    cargoDeliveredThisYear: state.cargoDeliveredThisYear,
    cargoDeliveredBestYear: state.cargoDeliveredBestYear,
    contracts: state.contracts,
    ...(state.scenario ? { scenario: state.scenario } : {}),
    history: state.history,
  };
}

/** Ledger periods saved before Economic model v2 lack the wage, wear and tax lines — read them as zero
 * (no version bump, like the other optional fields added since v4). */
function normalizeFinance(f: SerializedFinanceStateV1): GameState["finance"] {
  const period = (p: LedgerPeriod): LedgerPeriod => ({ ...emptyLedgerPeriod(), ...p });
  return {
    ...f,
    thisMonth: period(f.thisMonth),
    thisYear: period(f.thisYear),
    lastYear: period(f.lastYear),
    monthHistory: (f.monthHistory ?? []).map(period),
  };
}

export function deserializeGameState(data: SerializedGameStateV3): GameState {
  const map = deserializeMap(data.map);
  const trackGraph = new TrackGraph();
  for (const edge of data.trackEdges) trackGraph.addEdge(edge);
  if (data.nodeRoutes)
    for (const [node, keys] of data.nodeRoutes) trackGraph.setExplicitRoutes(node, new Set(keys));
  materializeAllJunctions(trackGraph); // older saves: derive junction routes from the geometry rules, then keep them

  const trains = data.trains.map((t) => {
    const { blockPenalties, ...rest } = t;
    // `profit` is absent in saves written before Phase 24A.
    const profit =
      (rest as { profit?: TrainProfit }).profit ?? emptyTrainProfit(rest.lifetimeRevenue);
    return { ...rest, profit, blockPenalties: entriesMap(blockPenalties) };
  });

  const state: GameState = {
    seed: data.seed,
    rng: { ...data.rng },
    map,
    cities: data.cities,
    industries: data.industries,
    startYear: data.startYear,
    ticks: data.ticks,
    difficulty: data.difficulty,
    cash: data.cash,
    trackGraph,
    stations: data.stations,
    nextStationId: data.nextStationId,
    stationEconomy: new Map(), // recomputed just below — see the doc comment on SerializedGameStateV1
    trains,
    nextTrainId: data.nextTrainId,
    trackVersion: data.trackVersion,
    stationCargo: entriesMap(data.stationCargo),
    stationTransfer: entriesMap(data.stationTransfer ?? []),
    stationFlow: entriesMap(data.stationFlow ?? []),
    departures: entriesMap(data.departures ?? []),
    washouts: data.washouts ?? [],
    nextWashoutId: data.nextWashoutId ?? (data.washouts ?? []).length,
    industryEconomy: entriesMap(data.industryEconomy),
    finance: normalizeFinance(data.finance),
    pendingDeliveries: data.pendingDeliveries,
    news: data.news,
    nextNewsId: data.nextNewsId,
    pendingNews: data.pendingNews,
    newsReadUpTo: data.newsReadUpTo,
    cityGrowth: entriesMap(data.cityGrowth),
    mapContentVersion: data.mapContentVersion,
    ...(data.regionId !== undefined ? { regionId: data.regionId } : {}),
    pendingCityFoundings: data.pendingCityFoundings,
    goals: data.goals,
    goalsCompleted: new Set(data.goalsCompleted),
    pendingGoalCelebrations: data.pendingGoalCelebrations,
    cargoDeliveredThisYear: data.cargoDeliveredThisYear,
    cargoDeliveredBestYear: data.cargoDeliveredBestYear,
    contracts: data.contracts ?? createContractsState(data.seed),
    ...(data.scenario ? { scenario: data.scenario } : {}),
    history: data.history ?? createHistory(),
  };

  const currentYear = calendarFromTicks(state.startYear, state.ticks).year;
  const links = passengerNetwork(state);
  state.stationEconomy = computeStationEconomies(
    state.map,
    state.cities,
    state.industries,
    state.stations,
    currentYear,
    state.industryEconomy,
    destinationSets(state.trains),
    links,
  );
  clampInputStocks(state); // Phase 38: stockpiles are capped now
  if ((data.passengerParty ?? 1) !== PARTY_SIZE) migratePassengers(state, data.passengerParty ?? 1);
  return state;
}

/** Phase 54: a save written with another number of people per game passenger (or with per-destination piles) becomes the
 * one-pile model. Every pile of any shape collapses into the station's one pile (its amount, rescaled; the older
 * `bound` / `lots` fields are dropped); a passenger car keeps its destination lots, rescaled, and its seats count in the
 * new unit; people aboard with no destination are put off (they had paid nothing yet). */
export function migratePassengers(state: GameState, oldParty: number): void {
  const k = oldParty / PARTY_SIZE;
  for (const pile of state.stationCargo.values()) {
    const entry = pile.passengers as
      (StationCargoPile & { bound?: unknown; lots?: unknown }) | undefined;
    if (!entry) continue;
    delete entry.bound;
    delete entry.lots;
    entry.amount *= k;
  }
  for (const train of state.trains)
    for (const car of train.cars) {
      if (car.cargoType !== "passengers") continue;
      car.seats = (car.seats ?? CARGO.passengers.capacity) / PARTY_SIZE;
      if (car.lots) {
        for (const lot of car.lots) lot.amount *= k;
        car.loadedUnits = car.lots.reduce((n, l) => n + l.amount, 0);
      } else {
        car.loadedUnits = 0;
        delete car.loadedTile;
        delete car.loadedTick;
      }
    }
}

/** Converts between `GameState` and the plain-JSON `SerializedGameStateV1` (SPEC §13). Pure,
 * DOM-free (only `btoa`/`atob`, available in Node/vitest and every browser) — testable without
 * IndexedDB or a browser, per CLAUDE.md's "simulation code must be testable without a DOM". */
import type { GameState } from "../sim/state";
import type { GameMap } from "../sim/map/types";
import { TrackGraph } from "../sim/track/graph";
import { computeStationEconomies } from "../sim/stations/economy";
import type { SerializedGameMapV1, SerializedGameStateV1, SerializedTrainV1 } from "./format";
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

function mapEntries<V>(map: ReadonlyMap<number, V>): Array<[number, V]> {
  return Array.from(map.entries());
}

function entriesMap<V>(entries: ReadonlyArray<[number, V]>): Map<number, V> {
  return new Map(entries);
}

export function serializeGameState(state: GameState): SerializedGameStateV1 {
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
    stations: state.stations,
    nextStationId: state.nextStationId,
    trains: state.trains.map((t): SerializedTrainV1 => ({
      ...t,
      blockPenalties: mapEntries(t.blockPenalties),
    })),
    nextTrainId: state.nextTrainId,
    trackVersion: state.trackVersion,
    stationCargo: mapEntries(state.stationCargo),
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
  };
}

export function deserializeGameState(data: SerializedGameStateV1): GameState {
  const map = deserializeMap(data.map);
  const trackGraph = new TrackGraph();
  for (const edge of data.trackEdges) trackGraph.addEdge(edge);

  const trains = data.trains.map((t) => {
    const { blockPenalties, ...rest } = t;
    return { ...rest, blockPenalties: entriesMap(blockPenalties) };
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
    industryEconomy: entriesMap(data.industryEconomy),
    finance: data.finance,
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
  };

  const currentYear = calendarFromTicks(state.startYear, state.ticks).year;
  state.stationEconomy = computeStationEconomies(
    state.map,
    state.cities,
    state.industries,
    state.stations,
    currentYear,
    state.industryEconomy,
  );
  return state;
}

/**
 * Build-tab explanations (PLAN Phase 26B): what the next station type adds and whether an
 * improvement would help this station right now. Read-only helpers over `GameState`.
 */
import { INDUSTRIES } from "../data/industries";
import { STATION_TYPE_DEFS, type StationImprovementType, type StationType } from "../data/stations";
import type { GameState } from "../sim/state";
import type { Station } from "../sim/stations/types";
import { stationCatchmentTiles } from "../sim/stations/placement";
import { strings } from "./strings";

/** "Catchment 5×5 · 3 platforms · loads 15% faster · up to 10 cars" for `type`. */
export function stationTypeBenefit(type: StationType): string {
  const def = STATION_TYPE_DEFS[type];
  return strings.station.upgradeBenefit(
    def.catchmentRadius * 2 + 1,
    def.trainCapacity,
    Math.round((1 - def.loadSpeedMult) * 100),
    def.maxTrainLength,
  );
}

function catchment(state: GameState, station: Station): number[] {
  return stationCatchmentTiles(
    state.map,
    station.tile,
    STATION_TYPE_DEFS[station.type].catchmentRadius,
  );
}

function producesInRange(state: GameState, tiles: number[], cargos: string[]): boolean {
  for (const t of tiles) {
    const id = state.map.industryId[t] as number;
    if (id < 0) continue;
    const industry = state.industries.find((i) => i.id === id);
    if (!industry) continue;
    const produces = Object.keys(INDUSTRIES[industry.type].produces);
    if (produces.some((c) => cargos.includes(c))) return true;
  }
  return false;
}

/** A short "why" line for an improvement when the answer depends on the surroundings, else
 * undefined. `helps` tells the tile whether to style it as a positive or a warning hint. */
export function improvementHint(
  state: GameState,
  station: Station,
  type: StationImprovementType,
): { text: string; helps: boolean } | undefined {
  const tiles = catchment(state, station);
  switch (type) {
    case "postOffice":
    case "hotel": {
      const hasCity = tiles.some((t) => (state.map.cityId[t] as number) >= 0);
      return hasCity ? undefined : { text: strings.station.why.needsCity, helps: false };
    }
    case "livestockPens":
      return producesInRange(state, tiles, ["livestock"])
        ? { text: strings.station.why.ranchInRange, helps: true }
        : { text: strings.station.why.noRanch, helps: false };
    case "coldStorage":
      return producesInRange(state, tiles, ["food", "livestock"])
        ? { text: strings.station.why.foodInRange, helps: true }
        : { text: strings.station.why.noFood, helps: false };
    default:
      return undefined;
  }
}

/** Trains with `station` on their orders. */
export function trainsUsingStation(state: GameState, station: Station): number {
  return state.trains.filter((t) => t.orders.some((o) => o.stationId === station.id)).length;
}

/** "Terminal recommended" when more trains call here than its platforms handle comfortably
 * (PLAYTEST-1: keep trains per station ≤ ~1.5 × platforms), or null. */
export function terminalHint(state: GameState, station: Station): string | null {
  if (station.type === "terminal") return null;
  const platforms = STATION_TYPE_DEFS[station.type].trainCapacity;
  const trains = trainsUsingStation(state, station);
  return trains > platforms * 1.5 ? strings.station.terminalRecommended(trains, platforms) : null;
}

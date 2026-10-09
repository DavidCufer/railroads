/** Where things are, for contracts (Phase 45): which stations cover a town or a producer, how far the network reaches. */
import { MIN_REACH_TILES, REACH_FACTOR, DEFAULT_LINE_TILES } from "../../data/contracts";
import { STATION_TYPE_DEFS } from "../../data/stations";
import type { City, Industry } from "../economy/types";
import type { GameState } from "../state";
import type { Station } from "../stations/types";

/** Stations that are real stops (a passing loop draws and accepts nothing). */
export function networkStations(state: GameState): Station[] {
  return state.stations.filter((s) => !s.passingLoop);
}

function chebyshev(width: number, a: number, b: number): number {
  return Math.max(
    Math.abs((a % width) - (b % width)),
    Math.abs(Math.floor(a / width) - Math.floor(b / width)),
  );
}

export function stationCoversTile(state: GameState, station: Station, tile: number): boolean {
  return (
    chebyshev(state.map.width, station.tile, tile) <=
    STATION_TYPE_DEFS[station.type].catchmentRadius
  );
}

export function stationCoversCity(state: GameState, station: Station, city: City): boolean {
  const r = STATION_TYPE_DEFS[station.type].catchmentRadius;
  const w = state.map.width;
  for (const t of city.tiles) if (chebyshev(w, station.tile, t) <= r) return true;
  return false;
}

export function stationCoversIndustry(
  state: GameState,
  station: Station,
  industry: Industry,
): boolean {
  return stationCoversTile(state, station, industry.y * state.map.width + industry.x);
}

export function stationsCoveringCity(state: GameState, city: City): Station[] {
  return networkStations(state).filter((s) => stationCoversCity(state, s, city));
}

export function cityTile(state: GameState, city: City): number {
  return city.anchorY * state.map.width + city.anchorX;
}

export function industryTile(state: GameState, industry: Industry): number {
  return industry.y * state.map.width + industry.x;
}

export function tileDistance(width: number, a: number, b: number): number {
  return Math.hypot((a % width) - (b % width), Math.floor(a / width) - Math.floor(b / width));
}

export function nearestStation(
  state: GameState,
  tile: number,
): { station: Station; distance: number } | undefined {
  let best: { station: Station; distance: number } | undefined;
  for (const s of networkStations(state)) {
    const d = tileDistance(state.map.width, s.tile, tile);
    if (!best || d < best.distance) best = { station: s, distance: d };
  }
  return best;
}

/** Mean distance between consecutive stops of the trains' orders (the player's typical line), in tiles. */
export function averageLineTiles(state: GameState): number {
  let sum = 0;
  let n = 0;
  for (const train of state.trains) {
    const stops = train.orders
      .map((o) => state.stations.find((s) => s.id === o.stationId))
      .filter((s): s is Station => s !== undefined);
    for (let i = 1; i < stops.length; i++) {
      sum += tileDistance(
        state.map.width,
        (stops[i - 1] as Station).tile,
        (stops[i] as Station).tile,
      );
      n++;
    }
  }
  return n > 0 ? sum / n : DEFAULT_LINE_TILES;
}

/** How far from the nearest station an offer may be: `REACH_FACTOR` × the average line, never under `MIN_REACH_TILES`. */
export function reachTiles(state: GameState): number {
  return Math.max(MIN_REACH_TILES, REACH_FACTOR * averageLineTiles(state));
}

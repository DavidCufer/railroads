/** Who accepts a cargo at a station (PLAN Phase 29 D): the cities and industries in its catchment whose tiles give
 * acceptance points for it — pure, mirrors the acceptance loop of `computeStationEconomies`. */
import type { CargoType } from "../../data/cargo";
import { INDUSTRIES, type IndustryType } from "../../data/industries";
import { STATION_ACCEPTANCE_THRESHOLD, STATION_TYPE_DEFS } from "../../data/stations";
import { cityTileAcceptance } from "../economy/cityStats";
import type { City, Industry } from "../economy/types";
import type { GameMap } from "../map/types";
import { stationCatchmentTiles } from "./placement";
import type { GameState } from "../state";
import type { Station } from "./types";

export type Acceptor =
  | { kind: "city"; id: number; points: number }
  | { kind: "industry"; id: number; type: IndustryType; points: number };

export function acceptorsOf(
  map: GameMap,
  cities: readonly City[],
  industries: readonly Industry[],
  station: Station,
  cargo: CargoType,
  year: number,
): Acceptor[] {
  const found = new Map<string, Acceptor>();
  const add = (key: string, make: () => Acceptor, points: number): void => {
    if (points <= 0) return;
    const entry = found.get(key) ?? make();
    entry.points += points;
    found.set(key, entry);
  };
  for (const tile of stationCatchmentTiles(
    map,
    station.tile,
    STATION_TYPE_DEFS[station.type].catchmentRadius,
  )) {
    const cityId = map.cityId[tile] as number;
    const industryId = map.industryId[tile] as number;
    const city = cityId >= 0 ? cities[cityId] : undefined;
    const industry = industryId >= 0 ? industries[industryId] : undefined;
    if (city) {
      add(
        `c${cityId}`,
        () => ({ kind: "city", id: cityId, points: 0 }),
        cityTileAcceptance(city.tier, year)[cargo] ?? 0,
      );
    } else if (industry) {
      add(
        `i${industryId}`,
        () => ({ kind: "industry", id: industryId, type: industry.type, points: 0 }),
        INDUSTRIES[industry.type].acceptancePoints[cargo] ?? 0,
      );
    }
  }
  return [...found.values()];
}

/** Somewhere that takes `cargo` (Phase 33: "Trieste doesn't accept steel — nearest stations that do: …"). */
export type AcceptingPlace =
  | { kind: "station"; stationId: number; distance: number }
  | { kind: "industry"; industryId: number; type: IndustryType; distance: number };

/** The `limit` nearest places to `fromTile` that accept `cargo`: built stations that do, or — when none does —
 * the industries (Port, Factory …) whose own acceptance would, so the player knows where to build one. */
export function placesAccepting(
  state: GameState,
  cargo: CargoType,
  fromTile: number,
  limit = 2,
): AcceptingPlace[] {
  const w = state.map.width;
  const dist = (tile: number): number =>
    Math.hypot((tile % w) - (fromTile % w), Math.floor(tile / w) - Math.floor(fromTile / w));
  const stations: AcceptingPlace[] = state.stations
    .filter((s) => state.stationEconomy.get(s.id)?.accepts.includes(cargo))
    .map((s) => ({ kind: "station" as const, stationId: s.id, distance: dist(s.tile) }));
  stations.sort((a, b) => a.distance - b.distance);
  if (stations.length > 0) return stations.slice(0, limit);
  const industries: AcceptingPlace[] = state.industries
    .filter(
      (i) => (INDUSTRIES[i.type].acceptancePoints[cargo] ?? 0) >= STATION_ACCEPTANCE_THRESHOLD,
    )
    .map((i) => ({
      kind: "industry" as const,
      industryId: i.id,
      type: i.type,
      distance: dist(i.y * w + i.x),
    }));
  industries.sort((a, b) => a.distance - b.distance);
  return industries.slice(0, limit);
}

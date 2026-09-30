/** Who accepts a cargo at a station (PLAN Phase 29 D): the cities and industries in its catchment whose tiles give
 * acceptance points for it — pure, mirrors the acceptance loop of `computeStationEconomies`. */
import type { CargoType } from "../../data/cargo";
import { INDUSTRIES, type IndustryType } from "../../data/industries";
import { STATION_TYPE_DEFS } from "../../data/stations";
import { cityTileAcceptance } from "../economy/cityStats";
import type { City, Industry } from "../economy/types";
import type { GameMap } from "../map/types";
import { stationCatchmentTiles } from "./placement";
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

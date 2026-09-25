/**
 * Per-station supply and acceptance (SPEC §6.3, §8.2, §8.3). No cargo flow yet (Phase 7) — this
 * is the "how much could this station draw on, and what does it accept" calculation the Station
 * mode preview and station panel both show.
 *
 * - Acceptance is purely per-station: the sum of acceptance points of every tile in its own
 *   catchment (city tiles and processor/port industry tiles), thresholded at
 *   STATION_ACCEPTANCE_THRESHOLD.
 * - Supply is shared: a producer (industry tile, or a city tile's passenger/mail share) inside
 *   more than one station's catchment splits its output evenly between them (SPEC §6.1:
 *   "overlapping supply is split evenly").
 */
import { CARGO_TYPES, type CargoType } from "../../data/cargo";
import { INDUSTRIES } from "../../data/industries";
import {
  POST_OFFICE_MAIL_SUPPLY_MULT,
  STATION_ACCEPTANCE_THRESHOLD,
  STATION_TYPE_DEFS,
} from "../../data/stations";
import { cityTileAcceptance, cityTileSupply } from "../economy/cityStats";
import type { City, Industry, IndustryEconomyState } from "../economy/types";
import type { GameMap } from "../map/types";
import { hasImprovement } from "./improvements";
import { stationCatchmentTiles } from "./placement";
import type { Station } from "./types";
import type { StationType } from "../../data/stations";

export interface StationEconomy {
  /** Monthly units this station can draw from producers/cities in its catchment. */
  supply: Partial<Record<CargoType, number>>;
  /** Summed acceptance points per cargo across the station's own catchment. */
  acceptPoints: Partial<Record<CargoType, number>>;
  /** Cargo types whose acceptPoints meet STATION_ACCEPTANCE_THRESHOLD. */
  accepts: CargoType[];
}

function addTo(target: Partial<Record<CargoType, number>>, cargo: CargoType, amount: number): void {
  target[cargo] = (target[cargo] ?? 0) + amount;
}

export function computeStationEconomies(
  map: GameMap,
  cities: readonly City[],
  industries: readonly Industry[],
  stations: readonly Station[],
  currentYear: number,
  industryEconomy?: ReadonlyMap<number, IndustryEconomyState>,
): Map<number, StationEconomy> {
  const catchments = new Map<number, number[]>();
  for (const station of stations) {
    catchments.set(
      station.id,
      stationCatchmentTiles(map, station.tile, STATION_TYPE_DEFS[station.type].catchmentRadius),
    );
  }

  const result = new Map<number, StationEconomy>();
  for (const station of stations) {
    result.set(station.id, { supply: {}, acceptPoints: {}, accepts: [] });
  }

  // Acceptance: purely local to each station's own catchment.
  for (const station of stations) {
    const economy = result.get(station.id) as StationEconomy;
    for (const tile of catchments.get(station.id) ?? []) {
      const cityId = map.cityId[tile] as number;
      const industryId = map.industryId[tile] as number;
      if (cityId >= 0 && cities[cityId]) {
        const points = cityTileAcceptance((cities[cityId] as City).tier, currentYear);
        for (const [cargo, v] of Object.entries(points) as Array<[CargoType, number]>) {
          addTo(economy.acceptPoints, cargo, v);
        }
      } else if (industryId >= 0 && industries[industryId]) {
        const def = INDUSTRIES[(industries[industryId] as Industry).type];
        for (const [cargo, v] of Object.entries(def.acceptancePoints) as Array<
          [CargoType, number]
        >) {
          addTo(economy.acceptPoints, cargo, v);
        }
      }
    }
    for (const cargo of CARGO_TYPES) {
      if ((economy.acceptPoints[cargo] ?? 0) >= STATION_ACCEPTANCE_THRESHOLD) {
        economy.accepts.push(cargo);
      }
    }
  }

  // Supply: each source tile (industry, or a city tile's passenger/mail share) splits evenly
  // between every station whose catchment covers it.
  const stationsAt = new Map<number, number[]>(); // tile -> station ids covering it
  for (const station of stations) {
    for (const tile of catchments.get(station.id) ?? []) {
      let list = stationsAt.get(tile);
      if (!list) {
        list = [];
        stationsAt.set(tile, list);
      }
      list.push(station.id);
    }
  }

  for (const industry of industries) {
    const tile = industry.y * map.width + industry.x;
    const covering = stationsAt.get(tile);
    if (!covering || covering.length === 0) continue;
    const def = INDUSTRIES[industry.type];
    // Processed cargo's actual output depends on whether the industry got its inputs delivered
    // (SPEC §8.2) — fall back to the static table only when no dynamic figure has been computed
    // yet (a freshly-placed processor, or a caller that doesn't track it, e.g. the station
    // placement preview).
    const produces = industryEconomy?.get(industry.id)?.monthlyOutput ?? def.produces;
    for (const [cargo, monthly] of Object.entries(produces) as Array<[CargoType, number]>) {
      const share = monthly / covering.length;
      for (const stationId of covering) {
        addTo((result.get(stationId) as StationEconomy).supply, cargo, share);
      }
    }
  }

  for (const city of cities) {
    const perTile = cityTileSupply(city);
    for (const tile of city.tiles) {
      const covering = stationsAt.get(tile);
      if (!covering || covering.length === 0) continue;
      for (const [cargo, monthly] of Object.entries(perTile) as Array<[CargoType, number]>) {
        const share = monthly / covering.length;
        for (const stationId of covering) {
          addTo((result.get(stationId) as StationEconomy).supply, cargo, share);
        }
      }
    }
  }

  // Post Office (SPEC §6.2): +50% mail supply at that station specifically.
  for (const station of stations) {
    if (!hasImprovement(station, "postOffice")) continue;
    const economy = result.get(station.id) as StationEconomy;
    if (economy.supply.mail) economy.supply.mail *= POST_OFFICE_MAIL_SUPPLY_MULT;
  }

  // Round supply once, after all splitting/summing, to avoid compounding rounding error.
  for (const economy of result.values()) {
    for (const cargo of Object.keys(economy.supply) as CargoType[]) {
      economy.supply[cargo] = Math.round((economy.supply[cargo] as number) * 10) / 10;
    }
  }

  return result;
}

/** Not-yet-built station's supply/acceptance, as if it were added alongside the existing ones
 * (accounting for overlap splitting with them) — the Station mode placement panel's live preview,
 * before the player confirms. */
export function previewStationEconomy(
  map: GameMap,
  cities: readonly City[],
  industries: readonly Industry[],
  existingStations: readonly Station[],
  tile: number,
  type: StationType,
  currentYear: number,
  industryEconomy?: ReadonlyMap<number, IndustryEconomyState>,
): StationEconomy {
  const PREVIEW_ID = -1;
  const preview: Station = {
    id: PREVIEW_ID,
    tile,
    type,
    name: "",
    hasEngineShed: false,
    hasWaterTower: false,
    improvements: [],
  };
  const computed = computeStationEconomies(
    map,
    cities,
    industries,
    [...existingStations, preview],
    currentYear,
    industryEconomy,
  );
  return computed.get(PREVIEW_ID) as StationEconomy;
}

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
import { cityTileAcceptance, cityTileSupply, cityTravelDemand } from "../economy/cityStats";
import type { City, Industry, IndustryEconomyState } from "../economy/types";
import type { GameMap } from "../map/types";
import { destinationSupplyMult } from "./destinations";
import { computePassengerFlows, type PassengerRoute } from "./passengerFlows";
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
  /** Where this station's passengers wait (Phase 35): shares of the supply per **first leg** (the next station on the
   * shortest route to their destination), summing to 1. Absent while no passenger train serves the station. */
  passengerBound?: Array<{ stationId: number; share: number }>;
  /** The town whose travel demand this station draws on most, and the station's part of that demand (people a month,
   * before only the reachable destinations are kept): `supply.passengers` is the connected part of it. */
  passengerTownId?: number;
  passengerDemand?: number;
  /** The reachable destinations behind those buckets, people a month each (the "Where passengers go" sheet). */
  passengerRoutes?: PassengerRoute[];
  /** Towns in travel range that no train connects to, with the people a month they would send. */
  passengerUnconnected?: Array<{ cityId: number; perMonth: number }>;
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
  destinations?: ReadonlyMap<number, ReadonlySet<number>>,
  links?: ReadonlyMap<number, ReadonlySet<number>>,
): Map<number, StationEconomy> {
  const all = stations;
  stations = stations.filter((s) => !s.passingLoop); // a passing loop draws and accepts nothing (Phase 30A)
  const catchments = new Map<number, number[]>();
  for (const station of stations) {
    catchments.set(
      station.id,
      stationCatchmentTiles(map, station.tile, STATION_TYPE_DEFS[station.type].catchmentRadius),
    );
  }

  const result = new Map<number, StationEconomy>();
  for (const station of all) {
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
    const perTile = cityTileSupply(city, currentYear);
    // Passengers: the town's total travel demand (population x trips per head, Phase 35C) spread over its tiles.
    perTile.passengers = cityTravelDemand(city, currentYear) / city.tiles.length;
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

  // Passengers (Phase 35): the supply is the town's total; it is split over destination towns by gravity and only
  // the reachable shares are generated, stored by first leg. Computed from every station's base supply first, so
  // the result does not depend on the order the stations are visited in.
  const stationCity = new Map<number, number>();
  for (const station of stations) {
    const counts = new Map<number, number>();
    for (const tile of catchments.get(station.id) ?? []) {
      const cityId = map.cityId[tile] as number;
      if (cityId >= 0) counts.set(cityId, (counts.get(cityId) ?? 0) + 1);
    }
    let best = -1;
    let bestCount = 0;
    for (const [id, n] of [...counts].sort((x, y) => x[0] - y[0]))
      if (n > bestCount) {
        best = id;
        bestCount = n;
      }
    stationCity.set(station.id, best);
  }
  const points = stations.map((s) => ({
    id: s.id,
    tile: s.tile,
    cityId: stationCity.get(s.id) ?? -1,
  }));
  const network = links ?? new Map<number, ReadonlySet<number>>();
  const baseSupply = new Map<number, number>();
  for (const station of stations)
    baseSupply.set(station.id, (result.get(station.id) as StationEconomy).supply.passengers ?? 0);
  for (const point of points) {
    const economy = result.get(point.id) as StationEconomy;
    // The station's part of its town's total travel demand; only the reachable shares are generated.
    const demand = baseSupply.get(point.id) ?? 0;
    if (point.cityId >= 0) {
      economy.passengerTownId = point.cityId;
      economy.passengerDemand = demand;
    }
    const flows = computePassengerFlows(map, cities, currentYear, point, demand, points, network);
    if (!flows) continue;
    if (flows.unconnected.length > 0) economy.passengerUnconnected = flows.unconnected;
    if (!network.has(point.id)) continue; // no passenger train calls here yet: one generic pile, nothing is bound
    economy.supply.passengers = demand * flows.fraction;
    const buckets = new Map<number, number>();
    for (const route of flows.routes)
      buckets.set(route.firstLeg, (buckets.get(route.firstLeg) ?? 0) + route.perMonth);
    const total = demand * flows.fraction;
    if (total > 0) {
      economy.passengerBound = [...buckets]
        .sort((x, y) => x[0] - y[0])
        .map(([stationId, amount]) => ({ stationId, share: amount / total }));
      economy.passengerRoutes = flows.routes;
    }
  }
  // Mail keeps the Phase 26A destination bonus: more distinct places reached => more post.
  if (destinations)
    for (const station of stations) {
      const economy = result.get(station.id) as StationEconomy;
      const mult = destinationSupplyMult(destinations.get(station.id)?.size ?? 0);
      if (mult !== 1 && economy.supply.mail) economy.supply.mail *= mult;
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

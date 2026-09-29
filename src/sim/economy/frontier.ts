/**
 * Frontier towns (Phase 26A "empty land becomes useful"): a station that has been on a train's orders
 * for a while with no city in its catchment attracts a new village beside it. The village then grows
 * like any other city as trains serve it. Deterministic: seeded RNG only.
 */
import {
  CITY_TIER_DEFS,
  FRONTIER_CHANCE_PER_MONTH,
  FRONTIER_MIN_CITY_DISTANCE,
  FRONTIER_SERVED_MONTHS,
  FRONTIER_START_POPULATION,
} from "../../data/cities";
import { STATION_TYPE_DEFS } from "../../data/stations";
import { pushNews } from "../news";
import { createRng, nextFloat, nextInt } from "../rng";
import type { GameState } from "../state";
import { stationCatchmentTiles } from "../stations/placement";
import { isBuildableLand, isCoastal } from "./cities";
import { generateCityNames } from "./names";
import type { City } from "./types";

export function monthlyFrontierStep(state: GameState): void {
  const rng = createRng((state.seed ^ (state.ticks * 2654435761) ^ 202) >>> 0);
  const map = state.map;
  const onOrders = new Set<number>();
  for (const train of state.trains) for (const o of train.orders) onOrders.add(o.stationId);

  for (const station of state.stations) {
    if (!onOrders.has(station.id)) continue;
    station.servedMonths = (station.servedMonths ?? 0) + 1;
    if (station.frontierFounded || station.servedMonths < FRONTIER_SERVED_MONTHS) continue;

    const catchment = stationCatchmentTiles(
      map,
      station.tile,
      STATION_TYPE_DEFS[station.type].catchmentRadius,
    );
    if (catchment.some((t) => (map.cityId[t] as number) >= 0)) continue;
    const sx = station.tile % map.width;
    const sy = Math.floor(station.tile / map.width);
    if (
      state.cities.some(
        (c) => Math.hypot(c.anchorX - sx, c.anchorY - sy) < FRONTIER_MIN_CITY_DISTANCE,
      )
    )
      continue;
    if (nextFloat(rng) >= FRONTIER_CHANCE_PER_MONTH) continue;

    const sites = catchment.filter((t) => {
      const x = t % map.width;
      const y = Math.floor(t / map.width);
      return (
        t !== station.tile &&
        !state.trackGraph.hasTrack(t) &&
        (map.industryId[t] as number) === -1 &&
        (map.cityId[t] as number) === -1 &&
        isBuildableLand(map, x, y)
      );
    });
    if (sites.length === 0) continue;
    const idx = sites[nextInt(rng, 0, sites.length - 1)] as number;

    const used = new Set(state.cities.map((c) => c.name));
    let name = generateCityNames(rng, 1)[0] as string;
    for (let tries = 0; used.has(name) && tries < 20; tries++) {
      name = generateCityNames(rng, 1)[0] as string;
    }
    if (used.has(name)) name = `${name} ${state.cities.length + 1}`;

    const city: City = {
      id: state.cities.length,
      name,
      tier: "village",
      population: Math.max(FRONTIER_START_POPULATION, CITY_TIER_DEFS.village.minPop),
      anchorX: idx % map.width,
      anchorY: Math.floor(idx / map.width),
      tiles: [idx],
      coastal: false,
    };
    city.coastal = isCoastal(map, city);
    state.cities.push(city);
    map.cityId[idx] = city.id;
    state.mapContentVersion++;
    station.frontierFounded = true;
    pushNews(state, { kind: "cityFounded", cityId: city.id });
  }
}

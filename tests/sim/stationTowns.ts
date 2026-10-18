/** Test helper (Phase 54): gives each station of `state` a town of its own (at the station's tile), so a passenger train
 * has towns to carry people between. Returns the new city ids in station order. */
import type { GameState } from "../../src/sim/state";

export function giveStationsTowns(state: GameState, population = 20_000): number[] {
  const width = state.map.width;
  return state.stations.map((station) => {
    const existing = state.stationEconomy.get(station.id)?.passengerTownId;
    if (existing !== undefined) return existing;
    const id = state.cities.length;
    state.map.cityId[station.tile] = id;
    state.cities.push({
      id,
      name: `Town${id}`,
      tier: "city",
      population,
      anchorX: station.tile % width,
      anchorY: Math.floor(station.tile / width),
      tiles: [station.tile],
      coastal: false,
    });
    const economy = state.stationEconomy.get(station.id);
    if (economy) economy.passengerTownId = id;
    return id;
  });
}

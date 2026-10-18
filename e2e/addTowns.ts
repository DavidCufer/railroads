/** Shared e2e helper (Phase 54): the bare test patch has no towns, and under the one-pile model people need towns at
 * the stops to travel between. Puts a town of its own on each station's tile and lets the station economy see it. */
import type { Page } from "@playwright/test";
import "./gameWindow";

export async function addTowns(
  page: Page,
  stationIds: number[],
  names: string[] = [],
  population = 20_000,
): Promise<number[]> {
  return page.evaluate(
    ({ stationIds, names, population }) => {
      const state = window.__game!.getState() as unknown as {
        cities: Array<{ name: string }>;
        stations: Array<{ id: number; tile: number }>;
      };
      return stationIds.map((stationId, i) => {
        const station = state.stations.find((s) => s.id === stationId)!;
        const id = window.__game!.debugPlaceCity([station.tile], population);
        if (names[i]) (state.cities[id] as { name: string }).name = names[i]!;
        return id;
      });
    },
    { stationIds, names, population },
  );
}

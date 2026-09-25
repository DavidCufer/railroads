/**
 * Real-world region cities founded after the scenario's start year (SPEC §4.3) — a yearly step
 * that applies each `GameState.pendingCityFoundings` entry once the in-game year reaches it:
 * gives the city its real population/footprint/coastal flag, stamps `map.cityId` for its tiles,
 * and announces it with a news toast.
 */
import { pushNews } from "../news";
import type { GameState } from "../state";
import { calendarFromTicks } from "../time";

export function yearlyCityFoundingStep(state: GameState): void {
  if (state.pendingCityFoundings.length === 0) return;
  const year = calendarFromTicks(state.startYear, state.ticks).year;

  const stillPending = state.pendingCityFoundings.filter((pending) => {
    if (pending.year > year) return true;
    const city = state.cities[pending.cityId];
    if (!city) return false;
    city.population = pending.population;
    city.tiles = pending.tiles;
    city.coastal = pending.coastal;
    for (const idx of pending.tiles) state.map.cityId[idx] = city.id;
    state.mapContentVersion++;
    pushNews(state, { kind: "cityFounded", cityId: city.id });
    return false;
  });
  state.pendingCityFoundings = stillPending;
}

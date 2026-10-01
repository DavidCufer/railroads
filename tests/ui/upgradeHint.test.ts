/** Phase 31: the "No town or city in range" hint and the "+$X/yr" estimate on an upgrade card never contradict. */
import { describe, expect, it } from "vitest";
import { buildStation, buildTrack } from "../../src/sim/commands";
import { cityInCatchment, improvementEstimate } from "../../src/sim/stations/estimates";
import { recordLoadedRevenue } from "../../src/sim/stations/flow";
import { improvementHint } from "../../src/ui/stationUpgrades";
import { makeTestMap, makeTestState, tileAt } from "../sim/track/helpers";
import type { City } from "../../src/sim/economy/types";

function world(withCity: "none" | "map" | "listOnly") {
  const map = makeTestMap(["pppppppppp", "pppppppppp", "pppppppppp", "pppppppppp"]);
  const state = makeTestState(map, { startYear: 1900 });
  state.cash = 1e9;
  const tiles = [tileAt(map, 3, 1), tileAt(map, 4, 1)];
  if (withCity !== "none") {
    const city: City = {
      id: 0,
      name: "C",
      tier: "city",
      population: 50_000,
      anchorX: 3,
      anchorY: 1,
      tiles,
      coastal: false,
    };
    state.cities.push(city);
    if (withCity === "map") for (const t of tiles) map.cityId[t] = 0;
  }
  expect(buildTrack(state, [tileAt(map, 1, 2), tileAt(map, 2, 2), tileAt(map, 3, 2)]).ok).toBe(
    true,
  );
  expect(buildStation(state, tileAt(map, 3, 2), "station").ok).toBe(true);
  const station = state.stations[0]!;
  recordLoadedRevenue(state, station.id, "mail", 20, 9_000);
  recordLoadedRevenue(state, station.id, "passengers", 20, 9_000);
  state.stationFlow.get(station.id)!.lastYear = structuredClone(
    state.stationFlow.get(station.id)!.year,
  );
  return { state, station };
}

describe("upgrade card: city range hint vs estimate", () => {
  it.each(["none", "map", "listOnly"] as const)("%s: both say the same thing", (kind) => {
    const { state, station } = world(kind);
    const inRange = cityInCatchment(state, station);
    expect(inRange).toBe(kind !== "none");
    for (const type of ["postOffice", "hotel"] as const) {
      const hint = improvementHint(state, station, type);
      const estimate = improvementEstimate(state, station, type);
      if (inRange) {
        expect(hint).toBeUndefined();
        expect(estimate).toBeGreaterThan(0);
      } else {
        expect(hint?.helps).toBe(false);
        expect(estimate).toBeUndefined();
      }
    }
  });
});

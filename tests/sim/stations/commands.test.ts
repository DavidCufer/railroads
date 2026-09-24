import { describe, expect, it } from "vitest";
import { STATION_TYPE_DEFS } from "../../../src/data/stations";
import {
  buildStation,
  buildTrack,
  computeStationBuildPlan,
  computeStationUpgradePlan,
  renameStation,
  upgradeStation,
} from "../../../src/sim/commands";
import { makeTestMap, makeTestState, tileAt } from "../track/helpers";

describe("buildStation", () => {
  it("round-trips: deducts cash, adds a station, and refreshes its economy", () => {
    const map = makeTestMap(["ppppp"]);
    const state = makeTestState(map);
    buildTrack(
      state,
      [0, 1, 2].map((x) => tileAt(map, x, 0)),
    );
    const tile = tileAt(map, 1, 0);
    const cashBefore = state.cash;

    const result = buildStation(state, tile, "depot");
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.cost).toBeCloseTo(STATION_TYPE_DEFS.depot.cost, 6);
    expect(state.cash).toBeCloseTo(cashBefore - result.cost, 6);
    expect(state.stations.length).toBe(1);
    expect(state.stations[0]?.tile).toBe(tile);
    expect(state.stationEconomy.has(state.stations[0]!.id)).toBe(true);
  });

  it("gives the first station built a free Engine Shed, but not the second", () => {
    const map = makeTestMap(["ppppppppp"]);
    const state = makeTestState(map);
    buildTrack(
      state,
      Array.from({ length: 9 }, (_, x) => tileAt(map, x, 0)),
    );

    buildStation(state, tileAt(map, 1, 0), "depot");
    buildStation(state, tileAt(map, 7, 0), "depot");

    expect(state.stations[0]?.hasEngineShed).toBe(true);
    expect(state.stations[1]?.hasEngineShed).toBe(false);
  });

  it("fails with station-no-track off any track", () => {
    const map = makeTestMap(["ppppp"]);
    const state = makeTestState(map);
    const result = buildStation(state, tileAt(map, 2, 0), "depot");
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.reason).toBe("station-no-track");
    expect(state.stations.length).toBe(0);
  });

  it("fails with station-occupied on a tile that already has a station", () => {
    const map = makeTestMap(["ppppp"]);
    const state = makeTestState(map);
    buildTrack(
      state,
      [0, 1, 2].map((x) => tileAt(map, x, 0)),
    );
    buildStation(state, tileAt(map, 1, 0), "depot");

    const result = buildStation(state, tileAt(map, 1, 0), "station");
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.reason).toBe("station-occupied");
    expect(state.stations.length).toBe(1);
  });

  it("fails with cant-afford when the station costs more than available cash", () => {
    const map = makeTestMap(["ppppp"]);
    const state = makeTestState(map);
    buildTrack(
      state,
      [0, 1, 2].map((x) => tileAt(map, x, 0)),
    );
    state.cash = 100;

    const result = buildStation(state, tileAt(map, 1, 0), "terminal");
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.reason).toBe("cant-afford");
    expect(state.cash).toBe(100);
  });

  it("computeStationBuildPlan reports invalid without mutating state", () => {
    const map = makeTestMap(["ppppp"]);
    const state = makeTestState(map);
    const plan = computeStationBuildPlan(state, tileAt(map, 2, 0), "depot");
    expect(plan.valid).toBe(false);
    expect(state.stations.length).toBe(0);
  });
});

describe("upgradeStation", () => {
  it("charges the difference between the two tiers and updates the type", () => {
    const map = makeTestMap(["ppppp"]);
    const state = makeTestState(map);
    buildTrack(
      state,
      [0, 1, 2].map((x) => tileAt(map, x, 0)),
    );
    buildStation(state, tileAt(map, 1, 0), "depot");
    const stationId = state.stations[0]!.id;
    const cashBefore = state.cash;

    const result = upgradeStation(state, stationId, "station");
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.cost).toBeCloseTo(
      STATION_TYPE_DEFS.station.cost - STATION_TYPE_DEFS.depot.cost,
      6,
    );
    expect(state.cash).toBeCloseTo(cashBefore - result.cost, 6);
    expect(state.stations[0]?.type).toBe("station");
  });

  it("rejects a same-or-lower type as an invalid upgrade", () => {
    const map = makeTestMap(["ppppp"]);
    const state = makeTestState(map);
    buildTrack(
      state,
      [0, 1, 2].map((x) => tileAt(map, x, 0)),
    );
    buildStation(state, tileAt(map, 1, 0), "station");
    const stationId = state.stations[0]!.id;

    const same = upgradeStation(state, stationId, "station");
    expect(same.ok).toBe(false);
    const down = upgradeStation(state, stationId, "depot");
    expect(down.ok).toBe(false);

    const plan = computeStationUpgradePlan(state, stationId, "depot");
    expect(plan.valid).toBe(false);
  });
});

describe("renameStation", () => {
  it("renames a station", () => {
    const map = makeTestMap(["ppppp"]);
    const state = makeTestState(map);
    buildTrack(
      state,
      [0, 1, 2].map((x) => tileAt(map, x, 0)),
    );
    buildStation(state, tileAt(map, 1, 0), "depot");
    const stationId = state.stations[0]!.id;

    const result = renameStation(state, stationId, "  My Station  ");
    expect(result.ok).toBe(true);
    expect(state.stations[0]?.name).toBe("My Station");
  });

  it("rejects an empty name", () => {
    const map = makeTestMap(["ppppp"]);
    const state = makeTestState(map);
    buildTrack(
      state,
      [0, 1, 2].map((x) => tileAt(map, x, 0)),
    );
    buildStation(state, tileAt(map, 1, 0), "depot");
    const stationId = state.stations[0]!.id;
    const before = state.stations[0]!.name;

    const result = renameStation(state, stationId, "   ");
    expect(result.ok).toBe(false);
    expect(state.stations[0]?.name).toBe(before);
  });
});

/**
 * Phase 32 item 2 (play-test 12): a new freight train bought at Trieste with orders
 * Iron Mine -> Coal Mine -> Steel Mill -> Trieste started with full iron-ore cars before it had visited the mine.
 */
import { describe, expect, it } from "vitest";
import { buildStation, buildTrack, buyTrain, setOrders } from "../../../src/sim/commands";
import { INDUSTRIES } from "../../../src/data/industries";
import { refreshStationEconomy } from "../../../src/sim/commands";
import { advanceOneHour } from "../../../src/sim/tick";
import type { Industry } from "../../../src/sim/economy/types";
import { makeTestMap, makeTestState, tileAt } from "../track/helpers";

describe("new train loads only where it stops (Phase 32)", () => {
  it("bought at Trieste with the player's orders: no cargo is picked up at Trieste or before the mine", () => {
    const width = 36;
    const row = Array.from({ length: width }, () => "p").join("");
    const map = makeTestMap([row, row, row, row]);
    const state = makeTestState(map, { startYear: 1840 });
    state.cash = 1e12;
    const industries: Industry[] = [
      { id: 0, type: "port", x: 0, y: 0 },
      { id: 1, type: "ironMine", x: 12, y: 0 },
      { id: 2, type: "coalMine", x: 24, y: 0 },
      { id: 3, type: "steelMill", x: 34, y: 0 },
    ];
    for (const i of industries) {
      state.industries.push(i);
      map.industryId[tileAt(map, i.x, i.y)] = i.id;
      state.industryEconomy.set(i.id, {
        inputStock: {},
        monthlyOutput: { ...(INDUSTRIES[i.type].produces as object) },
      });
    }
    const path = Array.from({ length: width }, (_, x) => tileAt(map, x, 1));
    expect(buildTrack(state, path).ok).toBe(true);
    for (const x of [0, 12, 24, 34])
      expect(buildStation(state, tileAt(map, x, 1), "depot").ok).toBe(true);
    refreshStationEconomy(state);
    const [trieste, iron, coal, mill] = state.stations.map((s) => s.id) as [
      number,
      number,
      number,
      number,
    ];
    // let the mines pile up cargo before the train is bought
    for (let i = 0; i < 20 * 24; i++) advanceOneHour(state);

    expect(buyTrain(state, trieste, "grasshopper-0-4-0", ["ironOre", "ironOre", "coal"]).ok).toBe(
      true,
    );
    const t = state.trains[0]!;
    expect(
      setOrders(state, t.id, [
        { stationId: iron, rule: "auto" },
        { stationId: coal, rule: "auto" },
        { stationId: mill, rule: "auto" },
        { stationId: trieste, rule: "auto" },
      ]).ok,
    ).toBe(true);

    const triesteTile = state.stations.find((s) => s.id === trieste)!.tile;
    const ironTile = state.stations.find((s) => s.id === iron)!.tile;
    let visitedIron = false;
    for (let i = 0; i < 40 * 24; i++) {
      advanceOneHour(state);
      if (t.route[t.routeIndex] === ironTile && t.status === "loading") visitedIron = true;
      for (const c of t.cars) {
        if (c.loadedUnits <= 0) continue;
        expect(c.loadedTile).not.toBe(triesteTile);
        if (!visitedIron) throw new Error(`cars loaded (${c.cargoType}) before visiting the mine`);
      }
    }
    expect(visitedIron).toBe(true);
  });
});

/**
 * PLAN Phase 28A (PLAYTEST-1 Bug 1): platforms limit simultaneous *loading*, not entry. The repro from the
 * report: an 18-tile line between two stations, N Atlantics alternating A→B / B→A, on single and double
 * track. Throughput (tiles run by the whole fleet) must never collapse as N grows — before the yard queue
 * every train ended up `waitingForStation` at N ≈ 2 × platforms.
 */
import { describe, expect, it } from "vitest";
import {
  buildStation,
  buildTrack,
  buyTrain,
  setOrders,
  upgradeTrack,
} from "../../../src/sim/commands";
import { advanceOneHour } from "../../../src/sim/tick";
import { STATION_TYPE_DEFS, type StationType } from "../../../src/data/stations";
import type { GameState } from "../../../src/sim/state";
import { makeTestMap, makeTestState, tileAt } from "../track/helpers";

const LENGTH = 19; // 18 tiles between the stations
const DAYS = 400;

function lineState(type: StationType, double: boolean): { state: GameState; a: number; b: number } {
  const map = makeTestMap(Array.from({ length: 5 }, () => "p".repeat(LENGTH + 2)));
  const state = makeTestState(map, { seed: 11, startYear: 1900, cash: 1e12 });
  const path = Array.from({ length: LENGTH }, (_, x) => tileAt(map, x + 1, 2));
  expect(buildTrack(state, path).ok).toBe(true);
  if (double) expect(upgradeTrack(state, path).ok).toBe(true);
  expect(buildStation(state, path[0] as number, type).ok).toBe(true);
  expect(buildStation(state, path[LENGTH - 1] as number, type).ok).toBe(true);
  return { state, a: state.stations[0]!.id, b: state.stations[1]!.id };
}

/** Tiles run by the whole fleet in `DAYS` days with `n` trains. */
function throughput(
  type: StationType,
  double: boolean,
  n: number,
): { tiles: number; state: GameState } {
  const { state, a, b } = lineState(type, double);
  for (let i = 0; i < n; i++) {
    expect(buyTrain(state, a, "atlantic-4-4-2", ["passengers"]).ok).toBe(true);
    const train = state.trains[state.trains.length - 1]!;
    const stops = i % 2 === 0 ? [a, b] : [b, a];
    setOrders(
      state,
      train.id,
      stops.map((stationId) => ({ stationId, rule: "auto" as const })),
    );
  }
  for (let t = 0; t < DAYS * 24; t++) advanceOneHour(state);
  return { tiles: state.trains.reduce((s, t) => s + t.distanceTraveled, 0), state };
}

describe("yard queue: platforms limit loading, not entry", () => {
  for (const double of [false, true]) {
    for (const type of ["depot", "station"] as StationType[]) {
      it(`${double ? "double" : "single"} track, ${type}: throughput never collapses for N = 1…12`, () => {
        const platforms = STATION_TYPE_DEFS[type].trainCapacity;
        const tiles: number[] = [];
        for (let n = 1; n <= 12; n++) tiles.push(throughput(type, double, n).tiles);
        for (let n = 1; n <= 12; n++) {
          expect(tiles[n - 1]).toBeGreaterThan(0);
          if (n >= 2)
            expect(tiles[n - 1] as number).toBeGreaterThanOrEqual(0.9 * (tiles[n - 2] as number));
        }
        // N = 2 × platforms keeps ≥ 90 % of the N − 1 throughput.
        const n2 = 2 * platforms;
        expect(tiles[n2 - 1] as number).toBeGreaterThanOrEqual(0.9 * (tiles[n2 - 2] as number));
        // No train is left waiting for the line or a platform in a dead state at the end.
        const { state } = throughput(type, double, 12);
        const stalled = state.trains.filter((t) => t.status === "stuck" || t.status === "noRoute");
        expect(stalled).toHaveLength(0);
      }, 120_000);
    }
  }

  it("a terminal with 12 trains on single track never reaches zero revenue-miles in the last 100 days", () => {
    const { state, a, b } = lineState("terminal", false);
    for (let i = 0; i < 12; i++) {
      expect(buyTrain(state, a, "atlantic-4-4-2", ["passengers"]).ok).toBe(true);
      const train = state.trains[state.trains.length - 1]!;
      setOrders(
        state,
        train.id,
        (i % 2 === 0 ? [a, b] : [b, a]).map((stationId) => ({ stationId, rule: "auto" as const })),
      );
    }
    for (let t = 0; t < 300 * 24; t++) advanceOneHour(state);
    const before = state.trains.reduce((s, t) => s + t.distanceTraveled, 0);
    for (let t = 0; t < 100 * 24; t++) advanceOneHour(state);
    const after = state.trains.reduce((s, t) => s + t.distanceTraveled, 0);
    expect(after - before).toBeGreaterThan(50);
  }, 120_000);
});

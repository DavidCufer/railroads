import { describe, expect, it } from "vitest";
import { networkCentre } from "../../../src/sim/stations/cluster";
import { makeTestMap, makeTestState, tileAt } from "../track/helpers";
import type { Station } from "../../../src/sim/stations/types";

describe("networkCentre (Phase 38)", () => {
  it("is null with no stations and the centre of the biggest cluster otherwise", () => {
    const map = makeTestMap(Array.from({ length: 5 }, () => "p".repeat(120)));
    const state = makeTestState(map, { seed: 1, startYear: 1900, cash: 1e9 });
    expect(networkCentre(state)).toBeNull();
    const at = (x: number) => ({ tile: tileAt(map, x, 2) }) as unknown as Station;
    state.stations.push(at(5), at(100), at(104), at(108));
    expect(networkCentre(state)).toEqual({ x: 104, y: 2 });
  });
});

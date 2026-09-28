import { describe, expect, it } from "vitest";
import {
  resolveInfoPick,
  resolveStationPick,
  stationTouchRadius,
  type PickCandidate,
} from "../../src/ui/picking";

const station: PickCandidate = { kind: "station", id: 1, name: "Trieste Central" };
const city: PickCandidate = { kind: "city", id: 2, name: "Trieste" };
const industry: PickCandidate = { kind: "industry", id: 3, name: "Coal Mine" };
const train: PickCandidate = { kind: "train", id: 4, name: "Train 4" };

describe("tap picking", () => {
  it("station beats city", () => {
    const out = resolveInfoPick({
      trains: [],
      stationsNear: [station],
      onStationTile: false,
      industry: null,
      city,
    });
    expect(out).toEqual({ type: "single", pick: station });
  });
  it("train beats station", () => {
    const out = resolveInfoPick({
      trains: [train],
      stationsNear: [station],
      onStationTile: true,
      industry: null,
      city,
    });
    expect(out).toEqual({ type: "single", pick: train });
  });
  it("station vs industry off the station tile asks; on the tile does not", () => {
    const ask = resolveInfoPick({
      trains: [],
      stationsNear: [station],
      onStationTile: false,
      industry,
      city: null,
    });
    expect(ask.type).toBe("choose");
    const sure = resolveInfoPick({
      trains: [],
      stationsNear: [station],
      onStationTile: true,
      industry,
      city: null,
    });
    expect(sure).toEqual({ type: "single", pick: station });
  });
  it("industry beats city; nothing gives none", () => {
    expect(
      resolveInfoPick({ trains: [], stationsNear: [], onStationTile: false, industry, city }).type,
    ).toBe("single");
    expect(
      resolveInfoPick({
        trains: [],
        stationsNear: [],
        onStationTile: false,
        industry: null,
        city: null,
      }).type,
    ).toBe("none");
  });
  it("station-only mode: one/many/no serving stations", () => {
    expect(resolveStationPick({ stationsNear: [], serving: [station] })).toEqual({
      type: "single",
      pick: station,
    });
    expect(
      resolveStationPick({ stationsNear: [], serving: [station, { ...station, id: 9 }] }).type,
    ).toBe("choose");
    expect(resolveStationPick({ stationsNear: [], serving: [] }).type).toBe("none");
  });
  it("touch radius is at least 28px and scales with zoom", () => {
    expect(stationTouchRadius(32, 1)).toBe(28);
    expect(stationTouchRadius(32, 4)).toBe(64);
  });
});

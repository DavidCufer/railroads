import { describe, expect, it } from "vitest";
import { LONG_HAUL_LEG_MAP_FRACTION, longHaulChainFor } from "../../../src/data/industries";
import { createRng } from "../../../src/sim/rng";
import { generateMap } from "../../../src/sim/map/generate";
import { terrainName } from "../../../src/sim/map/terrain";
import { createGameState } from "../../../src/sim/state";
import type { GameState } from "../../../src/sim/state";

const dist = (a: { x: number; y: number }, b: { x: number; y: number }): number =>
  Math.hypot(a.x - b.x, a.y - b.y);

function chainOf(state: GameState) {
  const chain = longHaulChainFor(state.startYear);
  const find = (type: string) => state.industries.find((i) => i.type === type);
  return {
    chain,
    mine: find(chain.mine),
    processor: find(chain.processor),
    sink: find(chain.sink),
  };
}

describe("long-haul chain (Phase 40)", () => {
  it("is present from the start on every map, silver before 1940 and uranium after", () => {
    for (const [seed, startYear] of [
      [1, 1840],
      [2, 1900],
      [3, 1939],
      [4, 1940],
      [5, 1960],
    ] as const) {
      const state = createGameState({
        seed,
        startYear,
        size: "medium",
        waterLevel: "normal",
        roughness: "normal",
      });
      const { chain, mine, processor, sink } = chainOf(state);
      expect(chain.id, `${seed}/${startYear}`).toBe(startYear < 1940 ? "silver" : "uranium");
      expect(mine && processor && sink, `${seed}/${startYear}`).toBeTruthy();
      // exactly one chain: none of the other era's industries
      const other = startYear < 1940 ? "uraniumMine" : "silverMine";
      expect(state.industries.some((i) => i.type === other)).toBe(false);
    }
  });

  it("puts each leg at least a third of the map apart, on one landmass, with consistent ids", () => {
    for (const seed of [1, 2, 3, 7]) {
      const state = createGameState({
        seed,
        startYear: 1860,
        size: "medium",
        waterLevel: "normal",
        roughness: "normal",
      });
      const { mine, processor, sink } = chainOf(state);
      const third = LONG_HAUL_LEG_MAP_FRACTION * Math.max(state.map.width, state.map.height);
      // relaxed steps are allowed on awkward maps, but never below 40 % of the target
      for (const leg of [dist(mine!, processor!), dist(processor!, sink!)])
        expect(leg).toBeGreaterThanOrEqual(third * 0.4);
      expect(dist(mine!, sink!)).toBeGreaterThanOrEqual(third * 0.4 * 1.2);
      for (const i of [mine!, processor!, sink!]) {
        expect(state.industries[i.id]).toBe(i);
        expect(state.map.industryId[i.y * state.map.width + i.x]).toBe(i.id);
      }
    }
  });

  it("is deterministic for a seed and leaves the rest of the map unchanged", () => {
    const opts = {
      seed: 9,
      startYear: 1870,
      size: "medium",
      waterLevel: "normal",
      roughness: "normal",
    } as const;
    const a = createGameState(opts);
    const b = createGameState(opts);
    expect(a.industries).toEqual(b.industries);
    expect(a.rng).toEqual(b.rng);
    // the chain is added on top: every other industry, and the stream, are what plain generation gives
    const plain = generateMap(
      createRng(9),
      { size: "medium", waterLevel: "normal", roughness: "normal" },
      1870,
    );
    expect(a.industries.slice(0, plain.industries.length)).toEqual(plain.industries);
    expect(a.industries.length).toBe(plain.industries.length + 3);
  });

  it("places the customer beside a big town and the mine on hills or mountains", () => {
    const state = createGameState({
      seed: 3,
      startYear: 1850,
      size: "medium",
      waterLevel: "normal",
      roughness: "normal",
    });
    const { mine, sink } = chainOf(state);
    const big = [...state.cities].sort((a, b) => b.population - a.population).slice(0, 8);
    expect(big.some((c) => dist({ x: c.anchorX, y: c.anchorY }, sink!) <= 9)).toBe(true);
    expect(["hills", "mountain"]).toContain(
      terrainName(state.map.terrain[mine!.y * state.map.width + mine!.x] as number),
    );
  });

  it("works on the real-world regions", () => {
    for (const region of ["central-eu", "gb", "us-east"] as const) {
      const state = createGameState({ seed: 1, region });
      const { mine, processor, sink } = chainOf(state);
      expect(mine && processor && sink, region).toBeTruthy();
    }
  });
});

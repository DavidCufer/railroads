import { describe, expect, it } from "vitest";
import { rand, seedTile } from "../../src/render/rng";
import { isWorking } from "../../src/render/industrySmoke";
import { industrySmokeSources } from "../../src/render/industries";
import {
  emitSmoke,
  INDUSTRY_EMITTER_BASE,
  pruneSmokeEmitters,
  resetSmoke,
  smokeCount,
  updateSmoke,
} from "../../src/render/art/smoke";

describe("tile rng", () => {
  it("is deterministic per tile and differs between tiles", () => {
    seedTile(5, 9);
    const a = [rand(), rand(), rand()];
    seedTile(5, 9);
    const b = [rand(), rand(), rand()];
    seedTile(6, 9);
    const c = [rand(), rand(), rand()];
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
    for (const v of a) expect(v).toBeGreaterThanOrEqual(0);
  });
});

describe("industry smoke", () => {
  it("only working processors smoke", () => {
    expect(isWorking(undefined)).toBe(false);
    expect(isWorking({ monthlyOutput: { goods: 0 } })).toBe(false);
    expect(isWorking({ monthlyOutput: { goods: 12 } })).toBe(true);
    expect(industrySmokeSources("steelMill").length).toBe(3);
    expect(industrySmokeSources("farm").length).toBe(0);
  });

  it("chimney puffs are short-lived and survive train emitter pruning", () => {
    resetSmoke();
    emitSmoke(INDUSTRY_EMITTER_BASE + 1, 1, 5, 0, 0, 0, 0, "chimney");
    expect(smokeCount()).toBe(5);
    pruneSmokeEmitters(new Set());
    updateSmoke(5);
    expect(smokeCount()).toBe(0);
  });

  it("train puffs live under a second", () => {
    resetSmoke();
    emitSmoke(1, 1, 10, 0, 0, 1, 0, "steam");
    updateSmoke(1.1);
    expect(smokeCount()).toBe(0);
  });
});

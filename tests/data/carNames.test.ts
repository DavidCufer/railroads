/** Phase 52: two cargoes share a car name only when they really share the car. */
import { describe, expect, it } from "vitest";
import { CARGO } from "../../src/data/cargo";

describe("car names", () => {
  it("only genuinely shared cars share a name", () => {
    const seen = new Map<string, string[]>();
    for (const c of Object.values(CARGO))
      seen.set(c.carLabel, [...(seen.get(c.carLabel) ?? []), c.id]);
    const shared = [...seen].filter(([, ids]) => ids.length > 1).map(([name]) => name);
    expect(shared.sort()).toEqual(["Ore hopper", "Tanker car"].filter((n) => shared.includes(n)));
    expect(CARGO.food.carLabel).not.toBe(CARGO.goods.carLabel);
  });
});

import { describe, expect, it } from "vitest";
import { outputShares, type Pickups } from "../../../src/sim/stations/pickups";
import type { CargoType } from "../../../src/data/cargo";

const none: Pickups = { history: new Map(), ordered: new Map() };
const pk = (
  history: Array<[number, number]>,
  ordered: number[] = [],
  cargo: CargoType = "silverBars",
): Pickups => ({
  history: new Map(history.map(([id, n]) => [id, { [cargo]: n }])),
  ordered: new Map(ordered.map((id) => [id, new Set<CargoType>([cargo])])),
});

describe("outputShares (Phase 78)", () => {
  it("one collector takes all", () => {
    const s = outputShares([1, 2], "silverBars", pk([[2, 40]]));
    expect(s.get(1)).toBe(0);
    expect(s.get(2)).toBe(1);
  });
  it("two collectors split by pickups", () => {
    const s = outputShares(
      [1, 2],
      "silverBars",
      pk([
        [1, 30],
        [2, 90],
      ]),
    );
    expect(s.get(1)).toBeCloseTo(0.25);
    expect(s.get(2)).toBeCloseTo(0.75);
  });
  it("nobody collects: even split", () => {
    const s = outputShares([1, 2, 3], "silverBars", none);
    for (const id of [1, 2, 3]) expect(s.get(id)).toBeCloseTo(1 / 3);
  });
  it("orders alone (no history yet) split evenly among those stations", () => {
    const s = outputShares([1, 2, 3], "silverBars", pk([], [1, 3]));
    expect(s.get(1)).toBeCloseTo(0.5);
    expect(s.get(2)).toBe(0);
  });
  it("a new line (orders, no history) counts as the average collector", () => {
    const s = outputShares([1, 2], "silverBars", pk([[1, 60]], [2]));
    expect(s.get(1)).toBeCloseTo(0.5);
  });
  it("another cargo's pickups do not count", () => {
    const s = outputShares([1, 2], "silverBars", pk([[1, 50]], [], "coal"));
    expect(s.get(1)).toBeCloseTo(0.5);
  });
});

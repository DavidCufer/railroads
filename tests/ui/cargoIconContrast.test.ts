import { describe, expect, it } from "vitest";
import { CARGO, CARGO_TYPES } from "../../src/data/cargo";
import { cargoIconColor, contrastRatio } from "../../src/ui/icons";

describe("cargo icons on the dark panel (Phase 73)", () => {
  it("every cargo icon reaches 3:1 against its tile on the panel", () => {
    for (const id of CARGO_TYPES) {
      const c = cargoIconColor(CARGO[id].color);
      const r = (n: number): number => parseInt(c.slice(n, n + 2), 16);
      const bg = (n: number, p: number): number => Math.round(p * 0.75 + r(n) * 0.25);
      const tile = `#${[1, 3, 5]
        .map((n, i) =>
          bg(n, [0x20, 0x32, 0x2b][i] as number)
            .toString(16)
            .padStart(2, "0"),
        )
        .join("")}`;
      expect(contrastRatio(c, tile), id).toBeGreaterThanOrEqual(3);
    }
  });
  it("coal is lightened, a light cargo is left alone", () => {
    expect(cargoIconColor(CARGO.coal.color)).not.toBe(CARGO.coal.color);
    expect(cargoIconColor(CARGO.passengers.color)).toBe(CARGO.passengers.color.toLowerCase());
  });
});

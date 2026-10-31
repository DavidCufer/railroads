import { describe, expect, it } from "vitest";
import { CARGO, CARGO_TYPES } from "../../src/data/cargo";
import { cargoIconColor, contrastRatio } from "../../src/ui/icons";

const PANEL = "#20322b";
function mix(a: string, b: string, t: number): string {
  const part = (i: number): string =>
    Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - t) + parseInt(b.slice(i, i + 2), 16) * t)
      .toString(16)
      .padStart(2, "0");
  return `#${part(1)}${part(3)}${part(5)}`;
}

describe("cargo icons on the dark panel (Phase 73)", () => {
  it("every cargo icon reaches 3:1 against its tile on the panel", () => {
    for (const id of CARGO_TYPES) {
      const c = cargoIconColor(CARGO[id].color);
      const tile = mix(PANEL, CARGO[id].color, 0.25);
      expect(contrastRatio(c, tile), id).toBeGreaterThanOrEqual(3);
    }
  });
  it("coal is lightened, a light cargo is left alone", () => {
    expect(cargoIconColor(CARGO.coal.color)).not.toBe(CARGO.coal.color);
    expect(cargoIconColor(CARGO.passengers.color)).toBe(CARGO.passengers.color.toLowerCase());
  });
});

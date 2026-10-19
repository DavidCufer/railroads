import { describe, expect, it } from "vitest";
import { CARGO, CARGO_TYPES, type CargoType } from "../../src/data/cargo";

/** Phase 58 item 3: which cargo is paid by the ton-mile and which for speed. */
describe("cargo tariff (Phase 58)", () => {
  const bulk: CargoType[] = [
    "coal",
    "ironOre",
    "wood",
    "grain",
    "oil",
    "steel",
    "lumber",
    "fuel",
    "silverOre",
    "uraniumOre",
  ];
  const timed: CargoType[] = ["passengers", "mail", "livestock", "food", "goods"];

  it("bulk freight is on a tonnage tariff, express and perishable cargo is not", () => {
    for (const c of bulk) expect(CARGO[c].tonnage, c).toBe(true);
    for (const c of timed) expect(CARGO[c].tonnage, c).toBeUndefined();
  });

  it("every cargo is one or the other or a long-haul chain's valuable final cargo", () => {
    const rest = CARGO_TYPES.filter((c) => !bulk.includes(c) && !timed.includes(c));
    expect(rest.sort()).toEqual(["enrichedUranium", "silverBars"]);
  });

  it("the more urgent cargo has the shorter expected time", () => {
    expect(CARGO.mail.urgency).toBeLessThan(CARGO.livestock.urgency);
    expect(CARGO.livestock.urgency).toBeLessThan(CARGO.food.urgency);
    expect(CARGO.food.urgency).toBeLessThan(CARGO.goods.urgency);
    for (const c of bulk) expect(CARGO[c].urgency, c).toBeGreaterThan(CARGO.goods.urgency);
  });
});

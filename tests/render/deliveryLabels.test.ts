import { describe, expect, it } from "vitest";
import { addFloatingLabel, stackRanks, type FloatingLabel } from "../../src/render/deliveryLabels";

const fmt = (n: number): string => `$${n}`;
const dl = (n: number): string => `${n} deliveries`;
const label = (tile: number, startMs: number, revenue = 100): FloatingLabel => ({
  stationTile: tile,
  text: `+$${revenue}`,
  color: "#ffffff",
  startMs,
  revenue,
  deliveries: 1,
});

describe("delivery label stacking", () => {
  it("ranks newest first (0 = bottom) per station, independently", () => {
    const a = label(1, 0);
    const b = label(1, 300);
    const c = label(2, 100);
    const ranks = stackRanks([a, b, c], 500);
    expect(ranks.get(b)).toBe(0);
    expect(ranks.get(a)).toBe(1);
    expect(ranks.get(c)).toBe(0);
  });

  it("merges a burst into the newest label once three are live", () => {
    const labels: FloatingLabel[] = [];
    for (let i = 0; i < 6; i++) addFloatingLabel(labels, label(1, i * 100), fmt, dl);
    expect(labels).toHaveLength(3);
    const newest = labels[2]!;
    expect(newest.deliveries).toBe(4);
    expect(newest.revenue).toBe(400);
    expect(newest.text).toBe("+$400 · 4 deliveries");
  });

  it("does not merge across stations, after the window, or non-revenue labels", () => {
    const labels: FloatingLabel[] = [];
    for (let i = 0; i < 3; i++) addFloatingLabel(labels, label(1, i * 100), fmt, dl);
    addFloatingLabel(labels, label(2, 250), fmt, dl);
    addFloatingLabel(labels, label(1, 5000), fmt, dl);
    addFloatingLabel(
      labels,
      { stationTile: 1, text: "Transferred", color: "#fff", startMs: 5100 },
      fmt,
      dl,
    );
    expect(labels).toHaveLength(6);
  });
});

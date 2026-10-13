import { describe, expect, it } from "vitest";
import { difficultyNote } from "../../src/ui/difficultyNote";
import { DIFFICULTY } from "../../src/data/finance";
import { strings } from "../../src/ui/strings";

describe("difficulty note (Phase 47)", () => {
  it("is built from the difficulty data", () => {
    expect(difficultyNote("hard")).toBe(
      `Hard: ${DIFFICULTY.hard.graceMonths} months to fix negative cash; lenders charge more when debt exceeds ${DIFFICULTY.hard.riskDebtRatio * 100}% of net worth.`,
    );
    expect(difficultyNote("normal")).toContain(`${DIFFICULTY.normal.graceMonths} months`);
    expect(difficultyNote("easy")).toContain("no bankruptcy");
  });
});

describe("game-over duration (Phase 47)", () => {
  it("shows months under a year, and a singular year", () => {
    const d = strings.gameOver.duration;
    expect(d(8)).toBe("8 months of railroading");
    expect(d(1)).toBe("1 month of railroading");
    expect(d(12)).toBe("1 year of railroading");
    expect(d(30)).toBe("2 years of railroading");
  });
});

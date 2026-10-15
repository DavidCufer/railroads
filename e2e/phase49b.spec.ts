import { expect, test } from "@playwright/test";

test.describe("Phase 49B: engines redrawn", () => {
  test("engine sheet: every locomotive and car on print plates", async ({ page }) => {
    await page.setViewportSize({ width: 1000, height: 700 });
    await page.goto("/?debug=1&gallery=1&sheet=1&h=72");
    await page.waitForSelector("#gallery");
    await expect(page.locator("#gallery canvas")).toHaveCount(22 + 8);
    await page.locator("#gallery").screenshot({ path: "docs/screenshots/phase-49b-engines.png" });
  });
});

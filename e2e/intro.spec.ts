import { expect, test } from "@playwright/test";

const SIZES = [
  { name: "phone", width: 800, height: 360 },
  { name: "tablet", width: 1280, height: 800 },
];

test.describe("Phase 85 — intro screen", () => {
  for (const size of SIZES) {
    test(`intro shows from the first frame, animates, then disappears (${size.name})`, async ({
      page,
    }) => {
      const consoleErrors: string[] = [];
      page.on("console", (msg) => {
        if (msg.type() === "error") consoleErrors.push(msg.text());
      });
      page.on("pageerror", (err) => consoleErrors.push(err.message));

      await page.setViewportSize({ width: size.width, height: size.height });
      await page.goto("/?introMs=4000", { waitUntil: "commit" });
      const intro = page.locator("#intro");
      await expect(intro).toBeVisible();
      await expect(intro.locator(".intro-title")).toHaveAttribute("aria-label", "Iron & Steam");
      await page.screenshot({ path: `docs/screenshots/phase-85-intro-${size.name}-first.png` });

      await page.waitForTimeout(1500);
      await expect(page.locator("#intro-line")).not.toHaveText("");
      await page.screenshot({ path: `docs/screenshots/phase-85-intro-${size.name}-mid.png` });

      await expect(page.locator(".title-screen")).toBeAttached();
      await expect(intro).toBeHidden({ timeout: 8000 });
      await expect(page.getByRole("button", { name: "New Game" })).toBeVisible();
      expect(consoleErrors).toEqual([]);
    });
  }

  test("debug pages have no intro", async ({ page }) => {
    await page.goto("/?debug=1");
    await page.waitForFunction(() => window.__game !== undefined);
    await expect(page.locator("#intro")).toHaveCount(0);
  });
});

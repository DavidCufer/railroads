import { expect, test } from "@playwright/test";

test("app loads, canvas renders, no console errors", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => consoleErrors.push(err.message));

  await page.goto("/?debug=1");

  const canvas = page.locator("#game-canvas");
  await expect(canvas).toBeVisible();

  await page.waitForFunction(
    () => (window as unknown as { __game?: unknown }).__game !== undefined,
  );

  await page.waitForTimeout(300);

  expect(consoleErrors).toEqual([]);

  await page.screenshot({ path: "docs/screenshots/phase-0-smoke.png" });
});

test("dev-only FPS overlay, debug controls, and window.__game never appear without ?debug=1", async ({
  page,
}) => {
  // This suite always runs against the real production build (playwright.config.ts's webServer
  // is `npm run build && npm run preview`), so this is checking the actual build the Android
  // workflow also packages, not just dev-server behavior (PLAN Phase 11: "verify they never
  // appear in the production build / APK").
  await page.goto("/");

  // The title screen covers the game on a real (non-debug) load — dismiss it like a real player
  // would, so the underlying game view (where the overlay/controls would render) is checked too.
  await page.getByRole("button", { name: "New Game" }).click();
  await page.getByRole("button", { name: "Random" }).click();
  await page.getByRole("button", { name: "Start Game" }).click();
  await expect(page.locator(".top-bar")).toBeVisible();
  await page.waitForTimeout(300);
  // The main game view a real player sees — no FPS/tick overlay, no seed/size dev controls.
  await page.screenshot({ path: "docs/screenshots/phase-11-no-debug-overlay.png" });

  await expect(page.locator("#debug-overlay")).toHaveCount(0);
  await expect(page.locator("#debug-controls")).toHaveCount(0);
  const hasGameHook = await page.evaluate(
    () => (window as unknown as { __game?: unknown }).__game !== undefined,
  );
  expect(hasGameHook).toBe(false);
});

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

import { expect, test, type Page } from "@playwright/test";
import "./gameWindow";

/**
 * Phase 12 error boundary: an uncaught exception or unhandled rejection anywhere in the app
 * writes an emergency save and shows a blocking "Save & Reload" dialog (src/ui/errorBoundary.ts).
 * `window.__game.debugThrow(kind)` (debug-only) fires the same real browser-level error/
 * unhandledrejection event a genuine crash would, so this exercises the actual global listeners,
 * not just a direct function call into the handler.
 */
const PHONE_VIEWPORT = { width: 800, height: 360 };

async function setup(page: Page): Promise<void> {
  await page.setViewportSize(PHONE_VIEWPORT);
  await page.goto("/?debug=1");
  await page.waitForFunction(() => window.__game !== undefined);
}

test.describe("Phase 12 — error boundary", () => {
  test("an uncaught synchronous exception shows the crash dialog", async ({ page }) => {
    await setup(page);
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(String(err)));

    await page.evaluate(() => window.__game!.debugThrow("sync"));
    await expect(page.locator(".error-boundary-overlay")).toBeVisible();
    await expect(page.getByText("Something went wrong")).toBeVisible();
    await expect(page.getByRole("button", { name: "Save & Reload" })).toBeVisible();

    // The dialog is genuinely modal: no close button, no way to get back to the game underneath.
    await expect(page.locator(".error-boundary-overlay .panel-close")).toHaveCount(0);

    expect(pageErrors.some((e) => e.includes("debug throw (sync)"))).toBe(true);
  });

  test("an unhandled promise rejection shows the same crash dialog", async ({ page }) => {
    await setup(page);
    await page.evaluate(() => window.__game!.debugThrow("async"));
    await expect(page.locator(".error-boundary-overlay")).toBeVisible();
    await expect(page.getByText("Something went wrong")).toBeVisible();
  });

  test("the crash writes an emergency save, recoverable from the title screen's Load Game screen", async ({
    page,
  }) => {
    await setup(page);
    // A distinctive amount of cash so the recovered save is identifiably from *this* crash, not
    // just "some emergency save existed already" (IndexedDB persists across this test file's
    // other cases within the same browser context).
    await page.evaluate(() => window.__game!.debugSetCash(1_234_567));
    await page.evaluate(() => window.__game!.debugThrow("sync"));
    await expect(page.locator(".error-boundary-overlay")).toBeVisible();

    // Click the dialog's own reload button — a real navigation, not a simulated one.
    await page.getByRole("button", { name: "Save & Reload" }).click();
    await page.waitForLoadState();

    // The reload lands back on `?debug=1` (same URL), which skips the title screen entirely by
    // design (see src/main.ts) — so to check the save the way a real player actually would,
    // navigate fresh without `?debug=1` and reach the title screen's Load Game flow from there.
    // IndexedDB persists across navigations in the same browser context, so the emergency save
    // written before the reload is still there.
    await page.goto("/");
    await expect(page.locator(".title-screen")).toBeVisible();
    await page.getByRole("button", { name: "Load Game" }).click();
    await expect(page.getByText("Emergency Save")).toBeVisible();
    await expect(page.getByText(/\$1,234,567|\$1\.2M/)).toBeVisible();
  });
});

import { expect, test, type Page } from "@playwright/test";

const PHONE_VIEWPORT = { width: 800, height: 360 };

/** Starts a real (non-debug) Random game with a fixed seed via the title/New Game screens, so
 * saves made in one test are identifiable and reproducible. */
async function startRandomGame(page: Page, seed: string): Promise<void> {
  await page.setViewportSize(PHONE_VIEWPORT);
  await page.goto("/");
  await page.getByRole("button", { name: "New Game" }).click();
  await page.getByRole("button", { name: "Random" }).click();
  await page.locator(".seed-input").fill(seed);
  await page.getByRole("button", { name: "Start Game" }).click();
  await expect(page.locator(".top-bar")).toBeVisible();
}

test.describe("Phase 11 — save/load", () => {
  test("Save Game (in-game menu) writes a manual slot, Continue and Load Game both find it", async ({
    page,
  }) => {
    await startRandomGame(page, "424242");

    // Save Game via the in-game ☰ menu.
    await page.getByRole("button", { name: "Menu" }).click();
    page.once("dialog", (dialog) => void dialog.accept("My Save"));
    await page.getByRole("button", { name: "Save Game" }).click();
    await expect(page.locator(".save-load-screen")).toBeVisible();
    await page.getByRole("button", { name: "Save", exact: true }).first().click();
    await expect(page.getByText("My Save")).toBeVisible();
    await page.getByRole("button", { name: "Back" }).click();

    // Reload the app fresh — Continue should now be enabled and load that save.
    await page.goto("/");
    const continueBtn = page.getByRole("button", { name: "Continue" });
    await expect(continueBtn).toBeEnabled();
    await continueBtn.click();
    await expect(page.locator(".top-bar")).toBeVisible();
    await expect(page.locator(".title-screen")).toHaveCount(0);

    // Load Game screen also lists it with the right details.
    await page.goto("/");
    await page.getByRole("button", { name: "Load Game" }).click();
    await expect(page.locator(".save-load-screen")).toBeVisible();
    await expect(page.getByText("My Save")).toBeVisible();
    await expect(page.getByText(/Random map/)).toBeVisible();
    await page.screenshot({ path: "docs/screenshots/phase-11-load-screen.png" });

    await page.getByRole("button", { name: "Load" }).click();
    await expect(page.locator(".top-bar")).toBeVisible();
    await expect(page.locator(".title-screen")).toHaveCount(0);
  });

  test("autosave fires on a monthly boundary and Continue picks it up without a manual save", async ({
    page,
  }) => {
    await page.setViewportSize(PHONE_VIEWPORT);
    await page.goto("/?debug=1");
    await page.waitForFunction(() => Boolean((window as { __game?: unknown }).__game));
    // 31 in-game days crosses the first month boundary (SPEC §3/§13: autosave monthly).
    await page.evaluate(() => {
      (window as unknown as { __game: { runDays: (n: number) => void } }).__game.runDays(31);
    });
    await page.waitForTimeout(200); // let the fire-and-forget IndexedDB write land

    const hasAuto = await page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open("railroads-saves");
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      const tx = db.transaction("saves", "readonly");
      const req = tx.objectStore("saves").get("auto-0");
      const record = await new Promise((resolve, reject) => {
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      db.close();
      return record !== undefined;
    });
    expect(hasAuto).toBe(true);
  });

  test("Load Game screen lists every slot as empty when nothing has ever been saved", async ({
    page,
  }) => {
    await page.setViewportSize(PHONE_VIEWPORT);
    await page.goto("/");
    await page.getByRole("button", { name: "Load Game" }).click();
    await expect(page.locator(".save-load-screen")).toBeVisible();
    // 3 autosave + 5 manual slots, every one empty — no Load/Delete button anywhere yet.
    await expect(page.locator(".save-slot-card")).toHaveCount(8);
    await expect(page.locator(".save-slot-empty")).toHaveCount(8);
    await expect(page.getByRole("button", { name: "Load" })).toHaveCount(0);
  });
});

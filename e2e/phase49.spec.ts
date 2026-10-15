import { expect, test } from "@playwright/test";

const PHONE = { width: 800, height: 360 };

test.describe("Phase 49 — era makeover", () => {
  test("title screen: cartouche, ticket buttons, animated scene", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.setViewportSize(PHONE);
    await page.goto("/");
    await expect(page.locator(".title-cartouche")).toBeVisible();
    for (const name of ["New Game", "Scenarios", "Load Game", "Achievements", "Settings"]) {
      await expect(page.getByRole("button", { name })).toBeVisible();
    }
    // Everything fits the phone viewport.
    const box = await page.locator(".title-btn-grid").boundingBox();
    expect(box && box.y >= 0 && box.y + box.height <= PHONE.height).toBe(true);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: "docs/screenshots/phase-49-title.png" });
    expect(errors).toEqual([]);
  });

  test("new game, scenarios and achievements screens keep the era look", async ({ page }) => {
    await page.setViewportSize(PHONE);
    await page.goto("/");
    await page.getByRole("button", { name: "New Game" }).click();
    await expect(page.locator(".new-game-screen")).toBeVisible();
    await page.waitForTimeout(300);
    await page.screenshot({ path: "docs/screenshots/phase-49-new-game.png" });
    await page.getByRole("button", { name: "Back" }).click();
    await page.getByRole("button", { name: "Scenarios" }).click();
    await expect(page.locator(".scenario-card").first()).toBeVisible();
    await page.screenshot({ path: "docs/screenshots/phase-49-scenarios.png" });
  });
});

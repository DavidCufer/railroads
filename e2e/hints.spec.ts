import { expect, test } from "@playwright/test";

const PHONE_VIEWPORT = { width: 800, height: 360 };

test.describe("Phase 11 — first-game hints", () => {
  test("hint card shows on a first game, steps through, dismisses, and never appears again", async ({
    page,
  }) => {
    await page.setViewportSize(PHONE_VIEWPORT);
    await page.goto("/");
    await page.getByRole("button", { name: "New Game" }).click();
    await page.getByRole("button", { name: "Random" }).click();
    await page.getByRole("button", { name: "Start Game" }).click();

    const hint = page.locator(".hint-card");
    await expect(hint).toBeVisible();
    await expect(hint).toContainText("Track tool");
    await page.screenshot({ path: "docs/screenshots/phase-11-hint.png" });

    // Doesn't block map/UI input underneath it.
    await expect(page.locator(".toolbar")).toBeVisible();

    await page.getByRole("button", { name: "Got it" }).click();
    await expect(hint).toContainText("Station on a straight");
    await page.getByRole("button", { name: "Got it" }).click();
    await expect(hint).toContainText("Engine Shed");
    await page.getByRole("button", { name: "Got it" }).click();
    await expect(hint).toContainText("Set orders");
    await page.getByRole("button", { name: "Start playing" }).click();
    await expect(hint).toHaveCount(0);

    const seen = await page.evaluate(() => window.localStorage.getItem("railroads.hintsSeen"));
    expect(seen).toBe("1");

    // A second game in the same browser doesn't show it again.
    await page.goto("/");
    await page.getByRole("button", { name: "New Game" }).click();
    await page.getByRole("button", { name: "Random" }).click();
    await page.getByRole("button", { name: "Start Game" }).click();
    await expect(page.locator(".hint-card")).toHaveCount(0);
  });

  test("Skip tips dismisses immediately and marks hints as seen", async ({ page }) => {
    await page.setViewportSize(PHONE_VIEWPORT);
    await page.goto("/");
    await page.getByRole("button", { name: "New Game" }).click();
    await page.getByRole("button", { name: "Random" }).click();
    await page.getByRole("button", { name: "Start Game" }).click();

    await expect(page.locator(".hint-card")).toBeVisible();
    await page.getByRole("button", { name: "Skip tips" }).click();
    await expect(page.locator(".hint-card")).toHaveCount(0);
    const seen = await page.evaluate(() => window.localStorage.getItem("railroads.hintsSeen"));
    expect(seen).toBe("1");
  });
});

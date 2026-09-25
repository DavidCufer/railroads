import { expect, test } from "@playwright/test";

const PHONE_VIEWPORT = { width: 800, height: 360 };

test.describe("Phase 10 — title screen and New Game screen", () => {
  test("title screen shows on load (no ?debug=1), Continue is disabled", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("pageerror", (err) => consoleErrors.push(err.message));

    await page.setViewportSize(PHONE_VIEWPORT);
    await page.goto("/");

    await expect(page.locator(".title-screen")).toBeVisible();
    await expect(page.getByText("Railroads", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "New Game" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Continue" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Settings" })).toBeEnabled();

    await page.screenshot({ path: "docs/screenshots/phase-10-main-menu.png" });

    expect(consoleErrors).toEqual([]);
  });

  test("Settings placeholder opens and can go back", async ({ page }) => {
    await page.setViewportSize(PHONE_VIEWPORT);
    await page.goto("/");
    await page.getByRole("button", { name: "Settings" }).click();
    await expect(page.locator(".settings-placeholder")).toBeVisible();
    await page.getByRole("button", { name: "Back" }).click();
    await expect(page.locator(".title-menu")).toBeVisible();
  });

  test("New Game screen: Real World tab shows region cards, Random tab shows generator options", async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("pageerror", (err) => consoleErrors.push(err.message));

    await page.setViewportSize(PHONE_VIEWPORT);
    await page.goto("/");
    await page.getByRole("button", { name: "New Game" }).click();

    await expect(page.locator(".new-game-screen")).toBeVisible();
    // Real World tab (default): 4 region cards.
    await expect(page.locator(".region-card")).toHaveCount(4);
    await expect(page.getByText("Eastern United States")).toBeVisible();
    await page.screenshot({ path: "docs/screenshots/phase-10-new-game-real-world.png" });

    // Random tab: generator options.
    await page.getByRole("button", { name: "Random" }).click();
    await expect(page.locator(".random-options")).toBeVisible();
    await expect(page.getByText("Terrain", { exact: true })).toBeVisible();
    await page.screenshot({ path: "docs/screenshots/phase-10-new-game-random.png" });

    expect(consoleErrors).toEqual([]);
  });

  test("selecting a region and starting dismisses the title screen and starts that region", async ({
    page,
  }) => {
    await page.setViewportSize(PHONE_VIEWPORT);
    await page.goto("/");
    await page.getByRole("button", { name: "New Game" }).click();
    await page.getByText("American West").click();
    await page.getByRole("button", { name: "Start Game" }).click();

    await expect(page.locator(".title-screen")).toHaveCount(0);
    // The in-game top bar should now be visible with the region's 1860 default start year.
    await expect(page.locator(".top-bar .date")).toContainText("1860");
  });

  test("starting a Random game dismisses the title screen", async ({ page }) => {
    await page.setViewportSize(PHONE_VIEWPORT);
    await page.goto("/");
    await page.getByRole("button", { name: "New Game" }).click();
    await page.getByRole("button", { name: "Random" }).click();
    await page.getByRole("button", { name: "Start Game" }).click();

    await expect(page.locator(".title-screen")).toHaveCount(0);
    await expect(page.locator(".top-bar")).toBeVisible();
  });
});

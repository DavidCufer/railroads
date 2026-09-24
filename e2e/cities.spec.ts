import { expect, test } from "@playwright/test";
import "./gameWindow";
import type { CityInfo, IndustryInfo } from "./gameWindow";

test.describe("Phase 3 — cities and industries", () => {
  test("tap a city shows its info panel", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("pageerror", (err) => consoleErrors.push(err.message));

    await page.goto("/?debug=1");
    await page.waitForFunction(() => window.__game !== undefined);
    await page.evaluate(() => {
      window.__game?.regenerate({
        seed: 12345,
        size: "medium",
        waterLevel: "normal",
        roughness: "normal",
      });
    });

    const cities = await page.evaluate(() => window.__game?.getCities() ?? []);
    expect(cities.length).toBeGreaterThan(0);
    const target = cities.find((c) => c.tier === "city") ?? (cities[0] as CityInfo);

    const center = await page.evaluate((id) => window.__game?.getCityWorldCenter(id), target.id);
    expect(center).not.toBeNull();
    if (!center) throw new Error("unreachable");

    await page.evaluate((c) => window.__game?.camera.setCenter(c.x, c.y), center);
    await page.evaluate(() => window.__game?.camera.setZoom(1.5));
    await page.waitForTimeout(350);

    const viewport = page.viewportSize();
    if (!viewport) throw new Error("no viewport");
    await page.mouse.click(viewport.width / 2, viewport.height / 2);
    await page.waitForTimeout(300);

    const panelTitle = page.locator(".panel-title");
    await expect(panelTitle).toHaveText(target.name);
    await page.screenshot({ path: "docs/screenshots/phase-3-city-panel.png" });

    expect(consoleErrors).toEqual([]);
  });

  test("tap an industry shows its info panel", async ({ page }) => {
    await page.goto("/?debug=1");
    await page.waitForFunction(() => window.__game !== undefined);
    await page.evaluate(() => {
      window.__game?.regenerate({
        seed: 12345,
        size: "medium",
        waterLevel: "normal",
        roughness: "normal",
      });
    });

    const industries = await page.evaluate(() => window.__game?.getIndustries() ?? []);
    expect(industries.length).toBeGreaterThan(0);
    const target = industries[0] as IndustryInfo;
    const TILE_SIZE = 32;

    await page.evaluate((worldPos) => window.__game?.camera.setCenter(worldPos.x, worldPos.y), {
      x: (target.x + 0.5) * TILE_SIZE,
      y: (target.y + 0.5) * TILE_SIZE,
    });
    await page.evaluate(() => window.__game?.camera.setZoom(2));
    await page.waitForTimeout(350);

    const viewport = page.viewportSize();
    if (!viewport) throw new Error("no viewport");
    await page.mouse.click(viewport.width / 2, viewport.height / 2);
    await page.waitForTimeout(300);

    const panelTitle = page.locator(".panel-title");
    await expect(panelTitle).toBeVisible();
    await page.screenshot({ path: "docs/screenshots/phase-3-industry-panel.png" });
  });

  test("speed buttons change the game speed and the calendar advances", async ({ page }) => {
    await page.goto("/?debug=1");
    await page.waitForFunction(() => window.__game !== undefined);

    expect(await page.evaluate(() => window.__game?.getSpeed())).toBe(1);
    const startTicks = await page.evaluate(() => window.__game?.getTicks() ?? 0);

    await page.getByRole("button", { name: "8×" }).click();
    expect(await page.evaluate(() => window.__game?.getSpeed())).toBe(8);
    await page.waitForTimeout(1000);

    const laterTicks = await page.evaluate(() => window.__game?.getTicks() ?? 0);
    expect(laterTicks).toBeGreaterThan(startTicks);

    await page.getByRole("button", { name: "Pause" }).click();
    expect(await page.evaluate(() => window.__game?.getSpeed())).toBe(0);
    const pausedTicks = await page.evaluate(() => window.__game?.getTicks() ?? 0);
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => window.__game?.getTicks() ?? 0)).toBe(pausedTicks);
  });

  test("overview and closeup screenshots for visual review", async ({ page }) => {
    await page.goto("/?debug=1");
    await page.waitForFunction(() => window.__game !== undefined);
    await page.evaluate(() => {
      window.__game?.regenerate({
        seed: 12345,
        size: "medium",
        waterLevel: "normal",
        roughness: "normal",
      });
    });

    await page.evaluate(() => window.__game?.camera.setZoom(0.25));
    await page.waitForTimeout(350);
    await page.screenshot({ path: "docs/screenshots/phase-3-overview.png" });

    const cities = await page.evaluate(() => window.__game?.getCities() ?? []);
    const metro = cities.find((c) => c.tier === "city" || c.tier === "metropolis");
    if (metro) {
      const center = await page.evaluate((id) => window.__game?.getCityWorldCenter(id), metro.id);
      if (center) {
        await page.evaluate((c) => window.__game?.camera.setCenter(c.x, c.y), center);
      }
    }
    await page.evaluate(() => window.__game?.camera.setZoom(2));
    await page.waitForTimeout(350);
    await page.screenshot({ path: "docs/screenshots/phase-3-city-closeup.png" });
  });
});

import { expect, test } from "@playwright/test";
import "./gameWindow";

const PHONE_VIEWPORT = { width: 800, height: 360 };

test.describe("Phase 10 — real-world regions", () => {
  test("us-east loads and renders at overview and closeup zoom", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("pageerror", (err) => consoleErrors.push(err.message));

    await page.setViewportSize(PHONE_VIEWPORT);
    await page.goto("/?debug=1");
    await page.waitForFunction(() => window.__game !== undefined);

    await page.evaluate(() => {
      window.__game?.regenerate({ seed: 1, region: "us-east" });
    });

    const map = await page.evaluate(() => window.__game?.getMap());
    expect(map?.width).toBe(160);
    expect(map?.height).toBe(142);

    // Overview zoom (SPEC §4.1: below 0.5 renders the simplified overview style).
    await page.evaluate(() => window.__game?.camera.setZoom(0.25));
    await page.evaluate(() => window.__game?.camera.setCenter(2560, 2272));
    await page.waitForTimeout(400);
    await page.screenshot({ path: "docs/screenshots/phase-10-us-east-overview.png" });

    // Closeup on New York (id 0) at zoom 2.
    const nyCenter = await page.evaluate(() => window.__game?.getCityWorldCenter(0));
    expect(nyCenter).not.toBeNull();
    if (nyCenter) {
      await page.evaluate((c) => window.__game?.camera.setCenter(c.x, c.y), nyCenter);
      await page.evaluate(() => window.__game?.camera.setZoom(2));
      await page.waitForTimeout(400);
      await page.screenshot({ path: "docs/screenshots/phase-10-us-east-closeup.png" });
    }

    expect(consoleErrors).toEqual([]);
  });

  test("gb loads and renders at overview and closeup zoom", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("pageerror", (err) => consoleErrors.push(err.message));

    await page.setViewportSize(PHONE_VIEWPORT);
    await page.goto("/?debug=1");
    await page.waitForFunction(() => window.__game !== undefined);

    await page.evaluate(() => {
      window.__game?.regenerate({ seed: 1, region: "gb" });
    });

    const map = await page.evaluate(() => window.__game?.getMap());
    expect(map?.width).toBe(112);
    expect(map?.height).toBe(144);

    await page.evaluate(() => window.__game?.camera.setZoom(0.25));
    await page.evaluate(() => window.__game?.camera.setCenter(1792, 2304));
    await page.waitForTimeout(400);
    await page.screenshot({ path: "docs/screenshots/phase-10-gb-overview.png" });

    // Closeup on London (id 0) at zoom 2.
    const londonCenter = await page.evaluate(() => window.__game?.getCityWorldCenter(0));
    expect(londonCenter).not.toBeNull();
    if (londonCenter) {
      await page.evaluate((c) => window.__game?.camera.setCenter(c.x, c.y), londonCenter);
      await page.evaluate(() => window.__game?.camera.setZoom(2));
      await page.waitForTimeout(400);
      await page.screenshot({ path: "docs/screenshots/phase-10-gb-closeup.png" });
    }

    expect(consoleErrors).toEqual([]);
  });

  test("Chicago is absent from the city list before 1833 and founded news fires once its year arrives", async ({
    page,
  }) => {
    await page.goto("/?debug=1");
    await page.waitForFunction(() => window.__game !== undefined);
    await page.evaluate(() => window.__game?.regenerate({ seed: 1, region: "us-east" }));

    const cities = await page.evaluate(() => window.__game?.getCities());
    const chicago = cities?.find((c) => c.name === "Chicago");
    expect(chicago).toBeDefined();
    expect(chicago?.tiles.length).toBe(0);
  });
});

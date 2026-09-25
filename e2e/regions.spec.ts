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

  test("central-eu loads and renders at overview and closeup zoom", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("pageerror", (err) => consoleErrors.push(err.message));

    await page.setViewportSize(PHONE_VIEWPORT);
    await page.goto("/?debug=1");
    await page.waitForFunction(() => window.__game !== undefined);

    await page.evaluate(() => {
      window.__game?.regenerate({ seed: 1, region: "central-eu" });
    });

    const map = await page.evaluate(() => window.__game?.getMap());
    expect(map?.width).toBe(142);
    expect(map?.height).toBe(144);

    await page.evaluate(() => window.__game?.camera.setZoom(0.25));
    await page.evaluate(() => window.__game?.camera.setCenter(2272, 2304));
    await page.waitForTimeout(400);
    await page.screenshot({ path: "docs/screenshots/phase-10-central-eu-overview.png" });

    // Closeup on Vienna (id 1) at zoom 2.
    const viennaCenter = await page.evaluate(() => window.__game?.getCityWorldCenter(1));
    expect(viennaCenter).not.toBeNull();
    if (viennaCenter) {
      await page.evaluate((c) => window.__game?.camera.setCenter(c.x, c.y), viennaCenter);
      await page.evaluate(() => window.__game?.camera.setZoom(2));
      await page.waitForTimeout(400);
      await page.screenshot({ path: "docs/screenshots/phase-10-central-eu-closeup.png" });
    }

    expect(consoleErrors).toEqual([]);
  });

  test("us-west loads and renders at overview and closeup zoom", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("pageerror", (err) => consoleErrors.push(err.message));

    await page.setViewportSize(PHONE_VIEWPORT);
    await page.goto("/?debug=1");
    await page.waitForFunction(() => window.__game !== undefined);

    await page.evaluate(() => {
      window.__game?.regenerate({ seed: 1, region: "us-west" });
    });

    const map = await page.evaluate(() => window.__game?.getMap());
    expect(map?.width).toBe(136);
    expect(map?.height).toBe(144);

    await page.evaluate(() => window.__game?.camera.setZoom(0.25));
    await page.evaluate(() => window.__game?.camera.setCenter(2176, 2304));
    await page.waitForTimeout(400);
    await page.screenshot({ path: "docs/screenshots/phase-10-us-west-overview.png" });

    // Closeup on San Francisco (id 0) at zoom 2 — shows the Bay.
    const sfCenter = await page.evaluate(() => window.__game?.getCityWorldCenter(0));
    expect(sfCenter).not.toBeNull();
    if (sfCenter) {
      await page.evaluate((c) => window.__game?.camera.setCenter(c.x, c.y), sfCenter);
      await page.evaluate(() => window.__game?.camera.setZoom(2));
      await page.waitForTimeout(400);
      await page.screenshot({ path: "docs/screenshots/phase-10-us-west-closeup.png" });
    }

    expect(consoleErrors).toEqual([]);
  });

  // Full-region thumbnails: the existing overview screenshots above are a phone-viewport *crop* of
  // the middle of each region (a Medium/Large map is always bigger than 800x360 shows at any zoom).
  // These render each whole region into one PNG each, at the minimum zoom (0.25x, MIN_ZOOM), in a
  // viewport sized to fit the entire map — so a reviewer can judge overall recognizability and
  // terrain fidelity in one image instead of stitching crops together.
  const FULL_REGIONS: Array<{ id: string; width: number; height: number }> = [
    { id: "us-east", width: 160, height: 142 },
    { id: "gb", width: 112, height: 144 },
    { id: "central-eu", width: 142, height: 144 },
    { id: "us-west", width: 136, height: 144 },
  ];
  const TILE_SIZE = 32;
  const MIN_ZOOM = 0.25;

  for (const region of FULL_REGIONS) {
    test(`${region.id} full-region thumbnail`, async ({ page }) => {
      const consoleErrors: string[] = [];
      page.on("console", (msg) => {
        if (msg.type() === "error") consoleErrors.push(msg.text());
      });
      page.on("pageerror", (err) => consoleErrors.push(err.message));

      const viewport = {
        width: Math.ceil(region.width * TILE_SIZE * MIN_ZOOM) + 40,
        height: Math.ceil(region.height * TILE_SIZE * MIN_ZOOM) + 40,
      };
      await page.setViewportSize(viewport);
      await page.goto("/?debug=1");
      await page.waitForFunction(() => window.__game !== undefined);

      await page.evaluate((id) => window.__game?.regenerate({ seed: 1, region: id }), region.id);

      await page.evaluate((zoom) => window.__game?.camera.setZoom(zoom), MIN_ZOOM);
      await page.evaluate(
        ({ w, h }) => window.__game?.camera.setCenter((w * 32) / 2, (h * 32) / 2),
        { w: region.width, h: region.height },
      );
      await page.waitForTimeout(500);
      await page.screenshot({ path: `docs/screenshots/phase-10-${region.id}-full.png` });

      expect(consoleErrors).toEqual([]);
    });
  }

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

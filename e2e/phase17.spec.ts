import { expect, test, type Page } from "@playwright/test";
import "./gameWindow";

const PHONE_VIEWPORT = { width: 800, height: 360 };
const TILE_SIZE = 32;
// Seed 12345: a flat row through the city of Dunville (footprint includes (66,145) and (67,145)).
const ROW_Y = 145;
const STATION_X = 67;

async function setup(page: Page): Promise<void> {
  await page.setViewportSize(PHONE_VIEWPORT);
  await page.goto("/?debug=1");
  await page.waitForFunction(() => window.__game !== undefined);
  await page.evaluate(() =>
    window.__game?.regenerate({
      seed: 12345,
      size: "medium",
      waterLevel: "normal",
      roughness: "normal",
    }),
  );
  await page.evaluate(
    ({ y }) => {
      const g = window.__game!;
      const w = g.getMap().width;
      const path: number[] = [];
      for (let x = 62; x <= 81; x++) path.push(y * w + x);
      g.buildTrackPath(path);
      g.buildStation(y * w + 67, "station");
      g.buildStation(y * w + 79, "station");
    },
    { y: ROW_Y },
  );
  await page.evaluate(
    ({ x, y, tile }) => {
      window.__game!.camera.setCenter((x + 0.5) * tile, (y + 0.5) * tile);
      window.__game!.camera.setZoom(1.5);
    },
    { x: STATION_X, y: ROW_Y, tile: TILE_SIZE },
  );
  await page.waitForTimeout(300);
}

async function tilePoint(page: Page, x: number, y: number): Promise<{ x: number; y: number }> {
  return page.evaluate(({ x, y }) => window.__game!.tileScreenPoint(x, y), { x, y });
}

test.describe("Phase 17 — tap targeting", () => {
  test("a tap near a station inside a city opens the station, not the city", async ({ page }) => {
    await setup(page);
    // The station tile is (67,145); tile (66,145) is a city tile. Tap 26px left of the station
    // centre — already inside the neighbouring city tile at zoom 1.5.
    const c = await tilePoint(page, STATION_X, ROW_Y);
    const cityTile = await tilePoint(page, 66, ROW_Y);
    expect(cityTile.x).toBeLessThan(c.x);
    await page.getByRole("button", { name: "Info", exact: true }).click();
    await page.mouse.click(c.x - 26, c.y);
    await expect(page.locator(".panel-row.served-by-row")).toHaveCount(0);
    await expect(page.locator(".station-buy-train-btn")).toBeVisible();
    await page.screenshot({ path: "docs/screenshots/phase-17-tap-station.png" });
  });

  test("a tap on a city tile far from the station still opens the city; served-by opens the station", async ({
    page,
  }) => {
    await setup(page);
    const c = await tilePoint(page, STATION_X, ROW_Y);
    await page.getByRole("button", { name: "Info", exact: true }).click();
    // Dunville spans y=142..149; (67,148) is well outside the station's touch radius.
    const p = await tilePoint(page, 67, 148);
    void c;
    await page.mouse.click(p.x, p.y);
    const link = page.locator('[data-testid="served-by-station"]').first();
    await expect(link).toBeVisible();
    await link.click();
    await expect(page.locator(".station-buy-train-btn")).toBeVisible();
  });

  test("while adding stops, tapping the city picks the station serving it", async ({ page }) => {
    await setup(page);
    const c = await tilePoint(page, STATION_X, ROW_Y);
    await page.getByRole("button", { name: "Info", exact: true }).click();
    await page.mouse.click(c.x, c.y);
    await page.locator(".station-buy-train-btn").click();
    await page.waitForTimeout(300);
    await page.locator(".wizard-next").click(); // Engine → Cars
    await page.locator(".wizard-next").click(); // Cars → Route
    const cityTile = await tilePoint(page, 66, 147);
    await page.mouse.click(cityTile.x, cityTile.y);
    await page.waitForTimeout(100);
    // The route step is still open and the timeline now has one stop.
    await expect(page.locator(".panel-title")).toContainText("Buy train");
    await expect(page.locator('[data-testid="tl-stop"]')).toHaveCount(1);
  });

  test("a station next to an industry shows a chooser", async ({ page }) => {
    await setup(page);
    await page.evaluate(
      ({ x, y }) => {
        const g = window.__game!;
        g.debugPlaceIndustry(y * g.getMap().width + x, "coalMine");
      },
      { x: STATION_X, y: ROW_Y - 1 },
    );
    const c = await tilePoint(page, STATION_X, ROW_Y);
    await page.getByRole("button", { name: "Info", exact: true }).click();
    // 26px above the station centre: inside the industry tile, within the station touch radius,
    // but off the station's own tile.
    await page.mouse.click(c.x, c.y - 26);
    const chooser = page.locator('[data-testid="chooser"]');
    await expect(chooser).toBeVisible();
    await expect(chooser.locator("button")).toHaveCount(2);
    await page.screenshot({ path: "docs/screenshots/phase-17-chooser.png" });
    await chooser.locator('button[data-kind="station"]').click();
    await expect(page.locator(".station-buy-train-btn")).toBeVisible();
  });
});

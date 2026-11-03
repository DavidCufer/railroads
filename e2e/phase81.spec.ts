import { test, expect } from "@playwright/test";
import "./gameWindow";
import { build, centerOn, clearArea, range, setup, station, TILE_SIZE } from "./p30bHelpers";

/** Phase 81: picking stations near the map's lower edge on a 800x360 phone. */
test("picking a station at the map's bottom edge works from the slim bar", async ({ page }) => {
  await setup(page);
  const h = await page.evaluate(
    () => (window.__game!.getMap() as unknown as { height: number }).height,
  );
  const y = h - 2;
  await clearArea(page, 50, 70, y - 4, y);
  await build(
    page,
    range(13, (i) => ({ x: 52 + i, y })),
  );
  await station(page, 52, y);
  await station(page, 64, y);
  await centerOn(page, 58, y, 1);
  const a = await page.evaluate(() => window.__game!.getStations()[0]!.id);
  await page.evaluate((id) => window.__game!.debugOpenStation(id), a);
  await page.locator(".station-buy-train-btn").click();
  await page.locator(".wizard-next").click();
  await page.locator(".train-car-add-btn[data-cargo='passengers']").click();
  await page.locator(".wizard-next").click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: "docs/screenshots/phase-81-before.png" });
  const sheetTop = async (): Promise<number> =>
    (await page.locator(".panel-bottom").boundingBox())!.y;
  const full = await sheetTop();

  await page.locator(".train-pick-station-btn").click();
  await expect(page.locator(".route-sheet-slim")).toBeVisible();
  await page.waitForTimeout(600);
  expect(await sheetTop()).toBeGreaterThan(full + 40);
  // The camera may pan past the map edge: bring the bottom row up above the slim bar.
  await page.evaluate(
    ({ x, y, tile }) => window.__game!.camera.setCenter((x + 0.5) * tile, (y + 0.5) * tile + 120),
    { x: 58, y, tile: TILE_SIZE },
  );
  await page.waitForTimeout(400);
  const pt = await page.evaluate(({ y }) => window.__game!.tileScreenPoint(64, y), { y });
  expect(pt.y).toBeLessThan(await sheetTop());
  await page.screenshot({ path: "docs/screenshots/phase-81-after.png" });
  await page.mouse.click(pt.x, pt.y);
  await expect(page.locator('[data-testid="pick-chips"] .rs-chip')).toHaveCount(1);
  await page.locator('[data-testid="pick-done"]').click();
  await expect(page.locator(".route-sheet-slim")).toHaveCount(0);
  await expect(page.locator(".rs-orders li")).toHaveCount(1);
  await page.waitForTimeout(500);
  await page.screenshot({ path: "docs/screenshots/phase-81-restored.png" });
});

test("the camera pans past the map edge only while a panel covers it", async ({ page }) => {
  await setup(page);
  const worldH = await page.evaluate(
    () => (window.__game!.getMap() as unknown as { height: number }).height * 32,
  );
  const far = worldH + 600;
  const centerY = (): Promise<number> => page.evaluate(() => window.__game!.camera.getCenter().y);
  await page.evaluate((y) => window.__game!.camera.setCenter(58 * 32, y), far);
  await page.waitForTimeout(200);
  const bare = await centerY();
  expect(bare).toBeLessThan(far);
  await clearArea(page, 50, 70, 30, 40);
  await build(
    page,
    range(5, (i) => ({ x: 52 + i, y: 35 })),
  );
  await station(page, 52, 35);
  const sid = await page.evaluate(() => window.__game!.getStations()[0]!.id);
  await page.evaluate((id) => window.__game!.debugOpenStation(id), sid);
  await page.locator(".station-buy-train-btn").click();
  await page.locator(".wizard-next").click();
  await page.locator(".train-car-add-btn[data-cargo='passengers']").click();
  await page.locator(".wizard-next").click();
  await page.waitForTimeout(500);
  await page.evaluate((y) => window.__game!.camera.setCenter(58 * 32, y), far);
  await page.waitForTimeout(200);
  expect(await centerY()).toBeGreaterThan(bare + 50);
  await page
    .locator(".panel-bottom .panel-close, .panel-bottom [aria-label='Close']")
    .first()
    .click();
  await page.waitForTimeout(600);
  expect(await centerY()).toBeLessThanOrEqual(bare + 1);
});

import { expect, test, type Page } from "@playwright/test";
import "./gameWindow";

/** Phase 60: the finance panel shows the section-gang track upkeep and the head office as ledger lines. */
test.use({ deviceScaleFactor: 2 });

const PHONE_VIEWPORT = { width: 800, height: 360 };
const ROW_Y = 5; // a quiet corner of the map, away from any map-gen city/industry

async function clearStrip(page: Page, x0: number, x1: number, y: number): Promise<void> {
  await page.evaluate(
    ({ x0, x1, y }) => {
      const map = window.__game!.getMap();
      for (let row = y - 2; row <= y + 2; row++) {
        for (let x = x0; x <= x1; x++) {
          const idx = row * map.width + x;
          (map as unknown as { terrain: Uint8Array }).terrain[idx] = 0;
          (map as unknown as { industryId: Int16Array }).industryId[idx] = -1;
          (map as unknown as { cityId: Int16Array }).cityId[idx] = -1;
        }
      }
    },
    { x0, x1, y },
  );
}

test("finance panel lists Track upkeep and Head office after the first months", async ({
  page,
}) => {
  await page.setViewportSize(PHONE_VIEWPORT);
  await page.goto("/?debug=1");
  await page.waitForFunction(() => window.__game !== undefined);
  await page.evaluate(() =>
    window.__game?.regenerate({
      seed: 12345,
      size: "medium",
      waterLevel: "normal",
      roughness: "normal",
      startYear: 1900,
    }),
  );
  await clearStrip(page, 40, 100, ROW_Y);
  const built = await page.evaluate(
    ({ y }) => {
      const g = window.__game!;
      const width = g.getMap().width;
      const path: number[] = [];
      for (let x = 50; x <= 90; x++) path.push(y * width + x);
      const t = g.buildTrackPath(path);
      const a = g.buildStation(y * width + 50, "depot");
      const b = g.buildStation(y * width + 90, "depot");
      return t.ok && a.ok && b.ok;
    },
    { y: ROW_Y },
  );
  expect(built).toBe(true);
  await page.evaluate(() => window.__game!.runDays(65)); // two month boundaries
  const fin = await page.evaluate(() => window.__game!.getFinance());
  expect(fin.thisYear.trackMaintenance).toBeGreaterThan(0);
  expect(fin.thisYear.administration).toBeGreaterThan(0);

  await page.locator(".cash").click();
  await page.waitForTimeout(300);
  await expect(page.locator(".panel-title")).toHaveText("Finance");
  await page.getByRole("tab", { name: "This year" }).click();
  await page.waitForTimeout(300);
  const panel = page.locator(".panel");
  await expect(panel).toContainText("Track upkeep");
  await expect(panel).toContainText("Head office");
  await panel.getByText("Head office").first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(100);
  await page.screenshot({ path: "docs/screenshots/phase-60-finance.png" });
});

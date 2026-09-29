import { expect, test, type Page } from "@playwright/test";
import "./gameWindow";

/** Phase 26B screenshots and checks: news, junction art, station Build tab, Help, map edge. */
test.use({ deviceScaleFactor: 2 });

const PHONE_VIEWPORT = { width: 800, height: 360 };
const shot = (name: string): string => `docs/screenshots/phase-26b-${name}.png`;

async function setup(page: Page): Promise<void> {
  await page.setViewportSize(PHONE_VIEWPORT);
  await page.goto("/?debug=1");
  await page.waitForFunction(() => window.__game !== undefined);
  await page.evaluate(() =>
    window.__game?.regenerate({ seed: 12345, size: "medium", waterLevel: "normal", startYear: 1900 }),
  );
  await page.evaluate(() => window.__game!.debugSetCash(50_000_000));
  await page.evaluate(() => window.__game!.setSpeed(0));
}

test.describe("Phase 26B — news", () => {
  test("Clear all with two-tap confirm, and collapsed repeats show a count", async ({ page }) => {
    await setup(page);
    await page.evaluate(() => {
      const s = window.__game!.getState() as unknown as {
        news: Array<Record<string, unknown>>;
        trains: unknown[];
      };
      s.news.push(
        { id: 1, tick: 100, kind: "newLocomotive", locoId: "american-4-4-0" },
        { id: 2, tick: 200, kind: "trafficJam", tile: 5000, count: 3 },
        { id: 3, tick: 300, kind: "washout", tile: 5100 },
      );
    });
    await page.locator(".news-button").click();
    await page.waitForTimeout(350);
    await expect(page.getByText(/Traffic jam near .* ×3/)).toBeVisible();
    await page.screenshot({ path: shot("news-collapsed") });
    await page.locator(".news-clear-btn").click();
    await expect(page.getByText("Clear all news?")).toBeVisible();
    await page.screenshot({ path: shot("news-clear-confirm") });
    await page.locator(".news-clear-btn").click();
    await expect(page.getByText("No news yet.")).toBeVisible();
    expect(await page.evaluate(() => window.__game!.getNewsCount())).toBe(0);
    await page.screenshot({ path: shot("news-cleared") });
  });
});

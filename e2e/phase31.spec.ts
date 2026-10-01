import { expect, test, type Page } from "@playwright/test";
import "./gameWindow";

/** Phase 31 — a train panel only views the train; stops are added through an explicit "Add stop" toggle. */
const PHONE = { width: 800, height: 360 };
const ROW_Y = 47;

test.use({ deviceScaleFactor: 2 });

async function setup(page: Page): Promise<{ a: number; b: number; train: number }> {
  await page.setViewportSize(PHONE);
  await page.goto("/?debug=1");
  await page.waitForFunction(() => window.__game !== undefined);
  await page.evaluate(() =>
    window.__game?.regenerate({
      seed: 12345,
      size: "medium",
      waterLevel: "normal",
      roughness: "normal",
      startYear: 1848,
    }),
  );
  const ids = await page.evaluate((y) => {
    const g = window.__game!;
    const w = g.getMap().width;
    const row = Array.from({ length: 20 }, (_, i) => y * w + 71 + i);
    if (!g.buildTrackPath(row).ok) throw new Error("track");
    g.buildStation(y * w + 76, "station");
    g.buildStation(y * w + 90, "depot");
    const [a, b] = g.getStations();
    const bought = g.buyTrain(a!.id, "american-4-4-0", ["passengers", "mail"]);
    if (!bought.ok) throw new Error(`buy ${bought.reason}`);
    g.setOrders(bought.trainId!, [
      { stationId: a!.id, rule: "auto" },
      { stationId: b!.id, rule: "auto" },
    ]);
    return { a: a!.id, b: b!.id, train: bought.trainId! };
  }, ROW_Y);
  await page.evaluate(() => window.__game!.setSpeed(0));
  return ids;
}

async function shot(page: Page, name: string): Promise<void> {
  await page.waitForTimeout(350);
  await page.evaluate(() => document.querySelectorAll(".toast").forEach((t) => t.remove()));
  await page.screenshot({ path: `docs/screenshots/phase-31-${name}.png` });
}

test.describe("Phase 31 — view-only train panel", () => {
  test("tapping stations while viewing a train adds nothing; Add stop … Done does", async ({
    page,
  }) => {
    const ids = await setup(page);
    await page.evaluate((id) => window.__game!.debugOpenTrain(id), ids.train);
    const stops = page.locator('[data-testid="tl-stop"]');
    await expect(stops).toHaveCount(2);
    await shot(page, "train-panel-view");

    await page.evaluate((sid) => window.__game!.debugPickStation(sid), ids.a);
    await expect(stops).toHaveCount(2);

    await page.locator(".train-pick-station-btn").click();
    await expect(page.locator(".train-pick-station-btn")).toContainText("Done");
    await shot(page, "train-panel-adding");
    await page.evaluate((sid) => window.__game!.debugPickStation(sid), ids.a);
    await expect(stops).toHaveCount(3);

    await page.locator(".train-pick-station-btn").click();
    await expect(page.locator(".train-pick-station-btn")).not.toContainText("Done");
    await page.evaluate((sid) => window.__game!.debugPickStation(sid), ids.b);
    await expect(stops).toHaveCount(3);
  });
});

import { expect, test, type Page } from "@playwright/test";
import "./gameWindow";

/** Phase 32 — the Route tab flags an ordered station the route passes without stopping, with an "Add stop here" action. */
const PHONE = { width: 800, height: 360 };
const ROW_Y = 47;

test.use({ deviceScaleFactor: 2 });

async function setup(page: Page): Promise<number> {
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
  const train = await page.evaluate((y) => {
    const g = window.__game!;
    const w = g.getMap().width;
    const row = Array.from({ length: 30 }, (_, i) => y * w + 71 + i);
    if (!g.buildTrackPath(row).ok) throw new Error("track");
    g.buildStation(y * w + 74, "station");
    g.buildStation(y * w + 86, "station");
    g.buildStation(y * w + 98, "station");
    const [a, b, c] = g.getStations();
    const bought = g.buyTrain(a!.id, "american-4-4-0", ["passengers", "mail"]);
    if (!bought.ok) throw new Error(`buy ${bought.reason}`);
    g.setOrders(bought.trainId!, [
      { stationId: a!.id, rule: "auto" },
      { stationId: b!.id, rule: "auto" },
      { stationId: c!.id, rule: "auto" },
    ]);
    return bought.trainId!;
  }, ROW_Y);
  await page.evaluate(() => window.__game!.setSpeed(0));
  return train;
}

test("Route tab flags the middle stop passed on the way back; Add stop here inserts it", async ({
  page,
}) => {
  const train = await setup(page);
  await page.evaluate((id) => window.__game!.debugOpenTrain(id), train);
  const stops = page.locator('[data-testid="tl-stop"]');
  await expect(stops).toHaveCount(3);
  const note = page.locator('[data-testid="tl-note"]');
  await expect(note).toHaveCount(1);
  await expect(note).toContainText("Passed without stopping on the way from");
  await page.waitForTimeout(350);
  await note.scrollIntoViewIfNeeded();
  await page.waitForTimeout(350);
  await page.screenshot({ path: "docs/screenshots/phase-32-passed-note.png" });
  await note.locator("button").click();
  await expect(stops).toHaveCount(4);
  await expect(note).toHaveCount(0);
});

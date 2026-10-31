import { expect, test } from "@playwright/test";
import "./gameWindow";
import { addTowns } from "./addTowns";
import { clearArea, setup } from "./p30bHelpers";

/** Phase 74 (owner play-test 9): tab bar, lay up from anywhere, train load rows, city card, yearly money. */
test.use({ deviceScaleFactor: 2 });
const shot = (name: string): string => `docs/screenshots/phase-74-${name}.png`;

/** A coal mine feeding a steel mill: a train that really carries load (towns alone left the cars empty in a bare patch). */
async function coalWorld(page: import("@playwright/test").Page) {
  await setup(page);
  await clearArea(page, 60, 100, 30, 40);
  return page.evaluate(() => {
    const g = window.__game!;
    const w = g.getMap().width;
    const y = 35;
    g.debugPlaceIndustry((y - 1) * w + 71, "coalMine");
    g.debugPlaceIndustry((y - 1) * w + 90, "steelMill");
    if (!g.buildTrackPath(Array.from({ length: 20 }, (_, i) => y * w + 71 + i)).ok)
      throw new Error("track");
    g.buildStation(y * w + 71, "depot");
    g.buildStation(y * w + 90, "depot");
    const st = g.getStations();
    const bought = g.buyTrain(st[0]!.id, "atlantic-4-4-2", ["coal", "coal"]);
    if (!bought.ok) throw new Error(bought.reason);
    g.setOrders(
      bought.trainId!,
      st.map((s) => ({ stationId: s.id, rule: "auto" })),
    );
    return { train: bought.trainId! };
  });
}

async function world(page: import("@playwright/test").Page) {
  await setup(page);
  await clearArea(page, 60, 100, 30, 40);
  return page.evaluate(() => {
    const g = window.__game!;
    const w = g.getMap().width;
    const y = 35;
    if (!g.buildTrackPath(Array.from({ length: 30 }, (_, i) => y * w + 71 + i)).ok)
      throw new Error("track");
    g.buildStation(y * w + 71, "depot");
    g.buildStation(y * w + 100, "depot");
    const st = g.getStations();
    const bought = g.buyTrain(st[0]!.id, "atlantic-4-4-2", ["passengers", "mail"]);
    if (!bought.ok) throw new Error(bought.reason);
    g.setOrders(
      bought.trainId!,
      st.map((s) => ({ stationId: s.id, rule: "auto" })),
    );
    return { train: bought.trainId!, a: st[0]!.id, b: st[1]!.id };
  });
}

test("a running train queues a lay-up, shows it, and can cancel", async ({ page }) => {
  const ids = await world(page);
  // Run until it is on the line.
  for (let i = 0; i < 60; i++) {
    await page.evaluate(() => window.__game!.runDays(1));
    const status = await page.evaluate(() => window.__game!.getTrains()[0]!.status);
    if (status === "moving") break;
  }
  await page.evaluate((id) => window.__game!.debugOpenTrain(id), ids.train);
  const btn = page.locator(".train-layup-btn");
  await btn.click();
  await expect(page.locator('[data-testid="train-layup-queued"]')).toContainText("Lays up at");
  await page.screenshot({ path: shot("layup-queued") });
  await btn.click(); // cancel
  await expect(page.locator('[data-testid="train-layup-queued"]')).toHaveCount(0);
  await btn.click();
  await page.evaluate(() => window.__game!.runDays(40));
  const status = await page.evaluate(() => window.__game!.getTrains()[0]!.status);
  expect(status).toBe("laidUp");
});

test("train stats: one load row per cargo; tab bar stays inside its header", async ({ page }) => {
  const ids = await coalWorld(page);
  await page.evaluate((id) => window.__game!.debugOpenTrain(id), ids.train);
  await page.locator(".tab", { hasText: "Stats" }).click();
  // A new train has no history: no average and no "mostly empty" hint yet.
  await expect(page.locator('[data-testid="cargo-load-row"]')).toHaveCount(1);
  await expect(page.locator(".train-stats")).toContainText("Average after 2 months");
  await expect(page.locator(".load-hint")).toHaveCount(0);
  await page.evaluate(() => window.__game!.runDays(240));
  await page.evaluate((id) => window.__game!.debugOpenTrain(id), ids.train);
  await page.locator(".tab", { hasText: "Stats" }).click();
  await expect(page.locator('[data-testid="cargo-load-row"]')).toHaveCount(1);
  await expect(page.locator(".train-stats")).toContainText("full on average");
  const text = await page.locator(".train-stats").innerText();
  expect(text).not.toMatch(/\d\.\d{4,}/);
  await page.locator('[data-testid="cargo-load-row"]').first().scrollIntoViewIfNeeded();
  await page.locator(".panel-body").evaluate((el) => (el.scrollTop = el.scrollHeight));
  await page.waitForTimeout(200);
  await page.screenshot({ path: shot("train-stats") });
  // The tab bar is exactly as tall as its tabs: the underline cannot spill onto the content.
  const geo = await page.evaluate(() => {
    const bar = document.querySelector(".tabs")!.getBoundingClientRect();
    const tab = document.querySelector(".tab.active")!.getBoundingClientRect();
    return { barBottom: bar.bottom, tabBottom: tab.bottom };
  });
  expect(geo.tabBottom).toBeLessThanOrEqual(geo.barBottom);
});

test("city panel shows the reached-by-train card; station upkeep is per year", async ({ page }) => {
  const ids = await world(page);
  await page.evaluate(() => window.__game!.runDays(60));
  await page.evaluate((id) => window.__game!.debugOpenStation(id), ids.a);
  await page.locator(".tab", { hasText: "Build" }).click();
  await expect(page.locator(".stat-tile", { hasText: "Upkeep / year" })).toBeVisible();
  await page.locator(".stat-tile", { hasText: "Upkeep / year" }).scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  await page.screenshot({ path: shot("station-upkeep") });
  const [cityId] = await addTowns(page, [ids.a], ["Graz"], 36_000);
  await addTowns(page, [ids.b], ["Padua"], 30_000);
  await page.evaluate(() => window.__game!.runDays(40));
  await page.evaluate((id) => window.__game!.debugOpenCity(id), cityId!);
  await expect(page.locator('[data-testid="city-connected"]')).toBeVisible();
  await page.locator(".panel-body").evaluate((el) => (el.scrollTop = 0));
  await page.waitForTimeout(300);
  await page.screenshot({ path: shot("city") });
});

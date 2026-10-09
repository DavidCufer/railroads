import { expect, test, type Page } from "@playwright/test";
import "./gameWindow";

/** Phase 45: contracts - the offer toast, the Contracts panel with offers, then an accepted contract. */
test.use({ deviceScaleFactor: 2 });

const PHONE_VIEWPORT = { width: 800, height: 360 };
const shot = (name: string): string => `docs/screenshots/phase-45-${name}.png`;

async function setup(page: Page): Promise<void> {
  await page.setViewportSize(PHONE_VIEWPORT);
  await page.goto("/?debug=1");
  await page.waitForFunction(() => window.__game !== undefined);
  await page.evaluate(() =>
    window.__game?.regenerate({
      seed: 12345,
      size: "medium",
      waterLevel: "normal",
      startYear: 1900,
    }),
  );
  await page.evaluate(() => window.__game!.setSpeed(0));
}

/** Puts two real offers (a delivery and a connection) into the game and queues the news item for the first. */
async function injectOffers(page: Page): Promise<void> {
  await page.evaluate(() => {
    const state = window.__game!.getState() as {
      ticks: number;
      cities: Array<{ id: number; tiles: number[]; population: number }>;
      news: unknown[];
      pendingNews: unknown[];
      nextNewsId: number;
      contracts: { offers: unknown[]; nextId: number };
    };
    const [a, b] = [...state.cities]
      .filter((c) => c.tiles.length > 0)
      .sort((x, y) => y.population - x.population);
    const month = 30 * 24;
    const mk = (over: Record<string, unknown>) => ({
      id: state.contracts.nextId++,
      progress: 0,
      offeredTick: state.ticks,
      expiresTick: state.ticks + 3 * month,
      ...over,
    });
    const delivery = mk({
      kind: "delivery",
      cityId: a!.id,
      cargo: "goods",
      target: 300,
      reward: 85_000,
      durationTicks: 12 * month,
    });
    const connection = mk({
      kind: "connection",
      cityId: b!.id,
      target: 0,
      reward: 120_000,
      paid: 0,
      fromTile: 0,
      toTile: 1,
      durationTicks: 30 * month,
    });
    state.contracts.offers.push(delivery, connection);
    const item = {
      kind: "contract",
      event: "offered",
      contract: delivery,
      money: 85_000,
      id: state.nextNewsId++,
      tick: state.ticks,
    };
    state.news.push(item);
    state.pendingNews.push(item);
  });
}

test("contracts: toast, offers list, accepted contract", async ({ page }) => {
  await setup(page);
  await injectOffers(page);
  await page.evaluate(() => window.__game!.setSpeed(1));
  await expect(page.locator(".toast")).toBeVisible();
  await page.evaluate(() => window.__game!.setSpeed(0));
  await page.screenshot({ path: shot("toast") });

  const badge = page.locator(".contracts-button .contracts-badge");
  await expect(badge).toHaveText("2");
  await page.locator(".contracts-button").click();
  await expect(page.locator(".contract-card")).toHaveCount(2);
  await page.waitForTimeout(400);
  await page.screenshot({ path: shot("offers") });

  await page.locator(".contract-accept").first().click();
  await expect(page.locator(".contract-abandon")).toHaveCount(1);
  await page.waitForTimeout(300);
  await page.screenshot({ path: shot("accepted") });

  const counts = await page.evaluate(() => {
    const s = window.__game!.getState() as { contracts: { offers: unknown[]; active: unknown[] } };
    return { offers: s.contracts.offers.length, active: s.contracts.active.length };
  });
  expect(counts).toEqual({ offers: 1, active: 1 });

  await page.locator(".contract-decline").first().click();
  await expect(page.locator(".contract-card")).toHaveCount(1);
});

import { expect, test } from "@playwright/test";
import "./gameWindow";

/** Phase 39: the insolvency banner (one line, days left) and the bankruptcy game-over screen. */
test.use({ deviceScaleFactor: 2 });

/** The few fields of the game state these tests set (`getState` is typed `unknown` in gameWindow.ts). */
interface MutableState {
  ticks: number;
  cash: number;
  finance: { loans: number; bankrupt: boolean };
}

async function freshGame(page: import("@playwright/test").Page): Promise<void> {
  await page.setViewportSize({ width: 800, height: 360 });
  await page.goto("/?debug=1");
  await page.waitForFunction(() => window.__game !== undefined);
  await page.evaluate(() =>
    window.__game?.regenerate({ seed: 1, region: "central-eu", startYear: 1900 }),
  );
  await page.evaluate(() => window.__game!.setSpeed(0));
}

test("a company with no cash and no credit shows the insolvency banner with the days left", async ({
  page,
}) => {
  await freshGame(page);
  await page.evaluate(() => {
    const state = window.__game!.getState() as MutableState;
    state.ticks = 30 * 30 * 24; // past the two start-up years: no free credit
    state.cash = -400_000;
  });
  await page.evaluate(() => window.__game!.runDays(31));
  const banner = page.locator(".status-banner");
  await expect(banner).toBeVisible();
  await expect(banner).toHaveText(/Insolvent: \d+ months? to recover/);
  const months = Number((await banner.textContent())!.match(/(\d+) months?/)![1]);
  expect(months).toBeGreaterThanOrEqual(2); // the old bound: more than 30 days left
  expect(months).toBeLessThanOrEqual(3); // ... and at most 90
  await page.screenshot({ path: "docs/screenshots/phase-39-insolvent.png" });
});

test("bankruptcy stops the clock and shows the game-over card", async ({ page }) => {
  await freshGame(page);
  await page.evaluate(() => {
    const state = window.__game!.getState() as MutableState;
    state.ticks = 50 * 30 * 24;
    state.cash = -900_000;
    state.finance.loans = 300_000;
    state.finance.bankrupt = true;
  });
  await page.evaluate(() => window.__game!.setSpeed(1));
  const card = page.locator(".game-over-card");
  await expect(card).toBeVisible();
  await expect(card.locator("h2")).toHaveText("Bankrupt");
  await expect(card.locator("li")).toHaveCount(4);
  await page.screenshot({ path: "docs/screenshots/phase-39-game-over.png" });
  await card.getByRole("button", { name: "New game" }).click();
  await expect(page.locator(".game-over")).toHaveCount(0);
});

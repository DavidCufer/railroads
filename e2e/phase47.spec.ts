import { expect, test } from "@playwright/test";
import "./gameWindow";
import { lineWithTrain } from "./p30bHelpers";

/** Phase 47: play-test 5 fixes - the toast cap, the difficulty line, the "add a train" hint, the game-over duration. */
test.use({ deviceScaleFactor: 2 });

const VIEWPORT = { width: 800, height: 360 };
const shot = (name: string): string => `docs/screenshots/phase-47-${name}.png`;

test("at most three toasts are on screen, the newest ones", async ({ page }) => {
  await page.setViewportSize(VIEWPORT);
  await page.goto("/?debug=1");
  await page.waitForFunction(() => window.__game !== undefined);
  await page.evaluate(() => {
    for (let i = 1; i <= 10; i++) window.__game!.debugToast(`Test toast number ${i}`, "warn");
  });
  const live = page.locator(".toast:not([data-leaving])");
  await expect(live).toHaveCount(3);
  await expect(live.nth(2)).toHaveText("Test toast number 10");
  await expect(live.nth(0)).toHaveText("Test toast number 8");
  await page.waitForTimeout(400);
  await page.screenshot({ path: shot("toasts") });
});

test("the New Game screen describes the selected difficulty", async ({ page }) => {
  await page.setViewportSize(VIEWPORT);
  await page.goto("/");
  await page.getByRole("button", { name: "New Game" }).click();
  const note = page.getByTestId("difficulty-note");
  await expect(note).toContainText("Normal:");
  await page.getByRole("button", { name: "Hard", exact: true }).click();
  await expect(note).toContainText("Hard: 2 months to fix negative cash");
  await expect(note).toContainText("lenders charge more when debt exceeds 50%");
  await page.screenshot({ path: shot("difficulty") });
});

test("full trains with a crowd waiting get an add-a-train hint, in a card and on the line", async ({
  page,
}) => {
  const { a } = await lineWithTrain(page);
  await page.evaluate(() => window.__game!.runDays(40));
  await page.evaluate((stationId) => {
    const s = window.__game!.getState() as unknown as {
      stationCargo: Map<number, Record<string, { amount: number; waitingDays: number }>>;
    };
    s.stationCargo.set(stationId, { passengers: { amount: 3000, waitingDays: 1 } });
  }, a);
  await page.evaluate(() => window.__game!.runDays(70));
  await expect(page.getByTestId("hint-card")).toContainText("add a train");
  await page.screenshot({ path: shot("add-train-card") });
  await page.getByTestId("hint-card").getByRole("button").click();
  await page.locator(".train-list-button").click();
  await page.locator('[data-testid="list-sort-lines"]').click();
  await expect(page.getByTestId("line-add-train")).toContainText("Full trains,");
  await page.screenshot({ path: shot("add-train") });
});

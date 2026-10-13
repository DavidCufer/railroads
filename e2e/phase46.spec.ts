import { expect, test, type Page } from "@playwright/test";
import "./gameWindow";

/** Phase 46: scenarios (the list, the scenario card in Goals, the win and lose cards), achievements and company history. */
test.use({ deviceScaleFactor: 2 });

const PHONE_VIEWPORT = { width: 800, height: 360 };
const shot = (name: string): string => `docs/screenshots/phase-46-${name}.png`;

async function startScenario(page: Page, id: string): Promise<void> {
  await page.setViewportSize(PHONE_VIEWPORT);
  await page.goto("/?debug=1");
  await page.waitForFunction(() => window.__game !== undefined);
  await page.evaluate((scenarioId) => window.__game?.startScenario(scenarioId), id);
  await page.evaluate(() => window.__game!.setSpeed(0));
}

interface ScenarioStateShape {
  ticks: number;
  scenario?: { status: string; stars: number; progress: number };
}

test.describe("Phase 46 - scenarios", () => {
  test("the title screen lists the scenarios and starting one shows its goal", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("pageerror", (err) => consoleErrors.push(err.message));
    await page.setViewportSize(PHONE_VIEWPORT);
    await page.goto("/");
    await page.screenshot({ path: shot("title") });
    await page.getByRole("button", { name: "Scenarios" }).click();
    await expect(page.getByTestId("scenario-semmering")).toBeVisible();
    await expect(page.locator(".scenario-card")).toHaveCount(5);
    await page.screenshot({ path: shot("scenarios") });

    await page.getByTestId("scenario-transcontinental").getByRole("button").click();
    await expect(page.locator(".title-screen")).toHaveCount(0);
    await page.locator(".goals-button").click();
    await expect(page.getByTestId("scenario-card")).toContainText("Sacramento");
    await page.screenshot({ path: shot("scenario-card") });
    expect(consoleErrors).toEqual([]);
  });

  test("a delivery scenario ends with a win card and stars; the best is remembered", async ({
    page,
  }) => {
    await startScenario(page, "coalTrieste");
    await page.evaluate(() => {
      const s = window.__game!.getState() as unknown as ScenarioStateShape;
      s.scenario!.progress = 6000;
      window.__game!.setSpeed(1);
    });
    await expect(page.getByTestId("scenario-end")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("scenario-end-stars")).toContainText("★");
    await page.screenshot({ path: shot("scenario-won") });
    const stored = await page.evaluate(() => window.localStorage.getItem("railroads.profile"));
    expect(JSON.parse(stored as string).scenarioStars.coalTrieste).toBeGreaterThanOrEqual(1);
  });

  test("a missed deadline ends with a lose card", async ({ page }) => {
    await startScenario(page, "semmering");
    await page.evaluate(() => {
      const s = window.__game!.getState() as unknown as ScenarioStateShape;
      s.ticks = 8 * 360 * 24; // January 1858
      window.__game!.setSpeed(1);
    });
    await expect(page.getByTestId("scenario-end")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("scenario-end")).toContainText("deadline");
    await page.screenshot({ path: shot("scenario-lost") });
  });
});

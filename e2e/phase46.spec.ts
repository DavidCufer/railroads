import { expect, test, type Page } from "@playwright/test";
import "./gameWindow";
import { lineWithTrain } from "./p30bHelpers";

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

  test("the win card pauses visibly, lists the star ladder, and Keep playing resumes the old speed (Phase 73)", async ({
    page,
  }) => {
    await startScenario(page, "coalTrieste");
    await page.evaluate(() => {
      const s = window.__game!.getState() as unknown as ScenarioStateShape;
      s.scenario!.progress = 6000;
      window.__game!.setSpeed(2);
    });
    await expect(page.getByTestId("scenario-end")).toBeVisible({ timeout: 15_000 });
    // Paused, and the speed bar says so (the pause button is lit, 2x is not).
    expect(await page.evaluate(() => window.__game!.getSpeed())).toBe(0);
    await expect(page.locator(".speed-group button.active")).toHaveAttribute("aria-label", "Pause");
    await expect(page.locator(".speed-group button.active")).toHaveCount(1);
    const ladder = page.getByTestId("scenario-ladder");
    await expect(ladder.locator("li")).toHaveCount(3);
    await expect(ladder.locator("li").first()).toHaveClass(/earned/);
    await expect(ladder).toContainText("Deliver 6,000 t of coal by 1866");
    await page.screenshot({ path: shot("scenario-won-ladder") });
    await page.getByRole("button", { name: "Keep playing" }).click();
    await expect(page.getByTestId("scenario-end")).toHaveCount(0);
    expect(await page.evaluate(() => window.__game!.getSpeed())).toBe(2);
    await expect(page.locator(".speed-group button.active")).toHaveText("2×");
    // The Goals panel shows only the scenario: no free-play trophies.
    await page.locator(".goals-button").click();
    await expect(page.getByTestId("scenario-card")).toBeVisible();
    await expect(page.locator(".goal-card")).toHaveCount(0);
    await page.waitForTimeout(500);
    await page.screenshot({ path: shot("scenario-goals-ladder") });
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

test.describe("Phase 46 - achievements and company history", () => {
  test("the title screen lists every achievement, locked", async ({ page }) => {
    await page.setViewportSize(PHONE_VIEWPORT);
    await page.goto("/");
    await page.getByRole("button", { name: "Achievements" }).click();
    await expect(page.getByTestId("achievements-screen")).toBeVisible();
    await expect(page.locator(".achievement-row")).toHaveCount(25);
    await expect(page.locator(".achievement-row.unlocked")).toHaveCount(0);
    await page.screenshot({ path: shot("achievements-locked") });
  });

  test("a running company unlocks achievements (toast, list, profile) and has a history", async ({
    page,
  }) => {
    await lineWithTrain(page);
    await page.evaluate(() => window.__game!.runDays(2.5 * 360));
    await expect(page.locator(".toast", { hasText: "Achievement" }).first()).toBeVisible();
    await page.screenshot({ path: shot("toast") });

    await page.locator("[aria-label='Menu']").first().click();
    await page.locator('[data-testid="menu-achievements"]').click();
    await expect(page.getByTestId("achievement-firstTrain")).toHaveClass(/unlocked/);
    await expect(page.getByTestId("achievement-profit5M")).toHaveClass(/locked/);
    await page.screenshot({ path: shot("achievements") });
    const stored = await page.evaluate(() => window.localStorage.getItem("railroads.profile"));
    expect(JSON.parse(stored as string).achievements.firstTrain).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    await page.getByRole("button", { name: "Back" }).click();

    await page.locator('[data-testid="menu-history"]').click();
    await expect(page.getByTestId("history-screen")).toBeVisible();
    await expect(page.locator(".history-chart")).toHaveCount(3);
    await expect(page.locator(".history-event").first()).toBeVisible();
    await page.screenshot({ path: shot("history") });
    const state = await page.evaluate(() => {
      const s = window.__game!.getState() as unknown as {
        history: { snapshots: unknown[]; events: Array<{ kind: string }> };
      };
      return { snapshots: s.history.snapshots.length, kinds: s.history.events.map((e) => e.kind) };
    });
    expect(state.snapshots).toBeGreaterThanOrEqual(3);
    expect(state.kinds).toContain("firstTrain");
  });

  test("the game-over card has a History button", async ({ page }) => {
    await lineWithTrain(page);
    await page.evaluate(() => {
      const s = window.__game!.getState() as unknown as { finance: { bankrupt: boolean } };
      s.finance.bankrupt = true;
    });
    await page.evaluate(() => window.__game!.setSpeed(1));
    await expect(page.locator(".game-over-card")).toBeVisible({ timeout: 15_000 });
    await page.locator(".game-over-card").getByRole("button", { name: "History" }).click();
    await expect(page.getByTestId("history-screen")).toBeVisible();
    await page.screenshot({ path: shot("history-bankrupt") });
  });
});

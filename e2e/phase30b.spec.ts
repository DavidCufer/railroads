import { expect, test, type Page } from "@playwright/test";
import "./gameWindow";

/** Phase 30B: visibility & UX (play-test 2). */
test.use({ deviceScaleFactor: 2 });
const PHONE_VIEWPORT = { width: 800, height: 360 };
const shot = (name: string): string => `docs/screenshots/phase-30b-${name}.png`;

async function start(
  page: Page,
  opts: { seed?: number; startYear?: number; difficulty?: string } = {},
) {
  await page.setViewportSize(PHONE_VIEWPORT);
  await page.goto("/?debug=1");
  await page.waitForFunction(() => window.__game !== undefined);
  await page.evaluate((o) => {
    window.__game!.regenerate({
      seed: o.seed ?? 1,
      startYear: o.startYear ?? 1900,
      ...(o.difficulty ? { difficulty: o.difficulty } : {}),
    });
    window.__game!.setSpeed(0);
  }, opts);
  await page.waitForTimeout(300);
}

test.describe("Phase 30B", () => {
  test("toasts never cover a panel header, even when the panel opens after them (Bug 4)", async ({
    page,
  }) => {
    await start(page);
    await page.evaluate(() => {
      for (let i = 0; i < 4; i++)
        window.__game!.debugToast(`Berlin has grown into a Metropolis ${i}`, "warn");
    });
    await page.locator(".top-bar .cash, [aria-label='Cash']").first().click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: shot("toast-over-finance") });
    const panel = await page.locator(".panel.panel-open").boundingBox();
    const toasts = await page
      .locator(".toast")
      .evaluateAll((els) => els.map((e) => e.getBoundingClientRect().right));
    expect(panel).not.toBeNull();
    for (const r of toasts) expect(r).toBeLessThanOrEqual(panel!.x + 1);
  });

  test("first-hour hints mention loans on Hard and the Norris on an 1830 start", async ({
    page,
  }) => {
    await page.setViewportSize(PHONE_VIEWPORT);
    await page.goto("/");
    await page.getByRole("button", { name: "New Game" }).click();
    await page.getByRole("button", { name: "Random" }).click();
    await page.getByRole("button", { name: "1830", exact: true }).click();
    await page.getByRole("button", { name: "Hard", exact: true }).click();
    await page.getByRole("button", { name: "Start Game" }).click();
    const hint = page.locator(".hint-card");
    for (let i = 0; i < 4; i++) await page.getByRole("button", { name: "Got it" }).click();
    await expect(hint).toContainText("Borrow");
    await page.screenshot({ path: shot("hint-hard") });
    await page.getByRole("button", { name: "Got it" }).click();
    await expect(hint).toContainText("Norris 4-2-0 arrives in 1838");
    await page.screenshot({ path: shot("hint-1830") });
  });

  test("the new-engine card shows each engine's year after a fast-forward", async ({ page }) => {
    await start(page, { startYear: 1860 });
    await page.evaluate(() => window.__game!.runDays(365 * 10));
    const card = page.locator(".new-engine-card");
    await expect(card).toBeVisible();
    const years = await card.locator(".year-chip").allTextContents();
    expect(years.length).toBeGreaterThan(0);
    for (const y of years) expect(y).toMatch(/18[6-9]\d|19\d\d/);
    await page.screenshot({ path: shot("new-engines-years") });
  });
});

import { expect, test, type Page } from "@playwright/test";
import "./gameWindow";
import { lineWithTrain } from "./p30bHelpers";

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

  test("buy wizard: cash vs price from step 1, Borrow shortcut, km distances, rule picker", async ({
    page,
  }) => {
    const { a, b } = await lineWithTrain(page);
    await page.evaluate(() => window.__game!.debugSetCash(90_000));
    await page.evaluate((id) => window.__game!.debugOpenStation(id), a);
    await page.locator(".station-buy-train-btn").click();
    const strip = page.locator('[data-testid="cash-strip"]');
    await expect(strip).toContainText("Cash $90");
    await expect(strip).toContainText("Short");
    await expect(page.locator(".cant-chip").first()).toBeVisible();
    await page.waitForTimeout(300);
    await page.screenshot({ path: shot("wizard-step1-short") });
    await page.locator('[data-testid="borrow-shortcut"]').click();
    const cash = await page.evaluate(() => window.__game!.getCash());
    expect(cash).toBeGreaterThanOrEqual(190_000);
    await expect(strip).toContainText("Cash $190");
    await page.evaluate(() => window.__game!.debugSetCash(50_000_000));
    await page.locator(".wizard-next").click();
    await page.locator(".train-car-add-btn", { hasText: "Passengers" }).click();
    await page.locator(".wizard-next").click();
    await page.locator(".rs-list-btn").click();
    await expect(page.locator(".rs-dist").first()).toContainText("km");
    await page.waitForTimeout(300);
    await page.screenshot({ path: shot("route-list-km") });
    await page.locator('[data-testid="rs-station"]').first().click();
    await page.locator('[data-testid="rule-chip"]').first().click();
    await expect(page.locator(".rule-picker")).toBeVisible();
    await page.waitForTimeout(200);
    await page.screenshot({ path: shot("rule-picker") });
    await page.locator('[data-testid="rule-option-fullLoad"]').click();
    await expect(page.locator('[data-testid="rule-chip"]').first()).toContainText("Full load");
    void b;
  });

  test("Help has pages on running a line and on upkeep", async ({ page }) => {
    await start(page);
    await page.locator("[aria-label='Menu']").first().click();
    await page.locator('[data-testid="menu-help"]').click();
    await page.locator('[data-tab="lines"]').click();
    await expect(page.getByText(/passing loop is a short double section/)).toBeVisible();
    await expect(page.getByText(/Water Tower/)).toContainText("km");
    await page.waitForTimeout(300);
    await page.screenshot({ path: shot("help-lines") });
    await page.locator('[data-tab="upkeep"]').click();
    await expect(page.getByText(/Track wears with tonnage/)).toBeVisible();
    await page.waitForTimeout(300);
    await page.screenshot({ path: shot("help-upkeep") });
  });

  test("Lines view shows per-line profit; station panel shows revenue and turned-away", async ({
    page,
  }) => {
    const { a } = await lineWithTrain(page);
    await page.evaluate(() => window.__game!.runDays(200));
    await page.locator(".train-list-button").click();
    await page.locator('[data-testid="list-sort-lines"]').click();
    await expect(page.locator('[data-testid="line-row"]')).toHaveCount(1);
    await page.waitForTimeout(300);
    await page.screenshot({ path: shot("lines-view") });
    // Give the station a recorded turned-away pile so the panel has something to say.
    await page.evaluate((id) => {
      const f = window.__game!.getStationFlow(id);
      if (!f) throw new Error("no flow");
      f.lastMonth.passengers = {
        revenue: f.lastMonth.passengers?.revenue ?? 4200,
        units: 30,
        lostUnits: 18,
        lostRevenue: 1300,
      };
      window.__game!.debugOpenStation(id);
    }, a);
    await expect(page.getByText("Results here")).toBeVisible();
    await expect(page.getByText(/18 gave up waiting/)).toBeVisible();
    await page.locator(".panel-body").evaluate((el) => (el.scrollTop = el.scrollHeight));
    await page.waitForTimeout(300);
    await page.screenshot({ path: shot("station-results") });
  });

  test("upgrade cards show an estimate computed from the station's flows", async ({ page }) => {
    const { a } = await lineWithTrain(page);
    await page.evaluate((id) => {
      const f = window.__game!.getStationFlow(id)!;
      f.lastMonth.mail = { revenue: 2000, units: 40, lostUnits: 10, lostRevenue: 500 };
      f.lastMonth.passengers = { revenue: 6000, units: 90, lostUnits: 0, lostRevenue: 0 };
      window.__game!.debugOpenStation(id);
    }, a);
    await page.locator('[data-tab="build"]').click();
    const est = page.locator('[data-testid="upgrade-estimate"]');
    await expect(est.first()).toContainText("at current traffic");
    await expect(est.first()).toContainText("/yr");
    await page.locator(".panel-body").evaluate((el) => (el.scrollTop = 110));
    await page.waitForTimeout(300);
    await page.screenshot({ path: shot("upgrade-estimate") });
  });
});

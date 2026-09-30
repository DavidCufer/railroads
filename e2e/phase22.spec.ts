import { expect, test, type Page } from "@playwright/test";
import "./gameWindow";

/** Phase 22 — Train screens (STYLE §11) at phone landscape 800×360, rendered at devicePixelRatio 2
 * so the side-view drawings are checked crisp. */
const PHONE = { width: 800, height: 360 };
const ROW_Y = 47; // flat row through Ashtown for seed 12345 (see phase17.spec.ts)
const LOCO = "american-4-4-0";

test.use({ deviceScaleFactor: 2 });

async function setup(page: Page, startYear = 1848): Promise<void> {
  await page.setViewportSize(PHONE);
  await page.goto("/?debug=1");
  await page.waitForFunction(() => window.__game !== undefined);
  await page.evaluate(
    (year) =>
      window.__game?.regenerate({
        seed: 12345,
        size: "medium",
        waterLevel: "normal",
        roughness: "normal",
        startYear: year,
      }),
    startYear,
  );
}

/** Track + two stations (+ optionally a train), paused. */
async function buildWorld(
  page: Page,
  withTrain = true,
): Promise<{ a: number; b: number; train: number }> {
  const ids = await page.evaluate(
    ({ y, loco, withTrain }) => {
      const g = window.__game!;
      const w = g.getMap().width;
      const row = Array.from({ length: 20 }, (_, i) => y * w + 71 + i);
      if (!g.buildTrackPath(row).ok) throw new Error("track");
      g.buildStation(y * w + 76, "station");
      g.buildStation(y * w + 90, "depot");
      const [a, b] = g.getStations();
      let train = -1;
      if (withTrain) {
        const bought = g.buyTrain(a!.id, loco, ["passengers", "mail"]);
        if (!bought.ok) throw new Error(`buy ${bought.reason}`);
        train = bought.trainId!;
        g.setOrders(train, [
          { stationId: a!.id, rule: "auto" },
          { stationId: b!.id, rule: "auto" },
        ]);
      }
      return { a: a!.id, b: b!.id, train };
    },
    { y: ROW_Y, loco: LOCO, withTrain },
  );
  await page.evaluate(() => window.__game!.setSpeed(0));
  return ids;
}

async function shot(page: Page, name: string): Promise<void> {
  await page.waitForTimeout(350);
  await page.evaluate(() => document.querySelectorAll(".toast").forEach((t) => t.remove()));
  await page.screenshot({ path: `docs/screenshots/phase-22-${name}.png` });
}

/** Nothing inside `root` may stick out of it (clipped drawings/text are the failure we look for). */
async function noHorizontalOverflow(page: Page, rootSel: string): Promise<void> {
  const problems = await page.evaluate((sel) => {
    const root = document.querySelector<HTMLElement>(sel);
    if (!root) return ["missing " + sel];
    const box = root.getBoundingClientRect();
    const out: string[] = [];
    for (const el of root.querySelectorAll<HTMLElement>("*")) {
      if (el.closest(".consist-strip, .eng-list, .cb-palette, .roster-strip, .loco-crop")) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.right > box.right + 1 || r.left < box.left - 1)
        out.push(`${el.className} ${Math.round(r.left)}..${Math.round(r.right)}`);
    }
    return out;
  }, rootSel);
  expect(problems).toEqual([]);
}

test.describe("Phase 22 — train screens", () => {
  test("buy wizard: engine → cars → route, then a train exists", async ({ page }) => {
    await setup(page);
    const ids = await buildWorld(page, false);
    await page.evaluate((id) => window.__game!.debugOpenStation(id), ids.a);
    await page.locator(".station-buy-train-btn").click();
    await expect(page.locator(".sheet-wizard")).toBeVisible();
    await expect(page.locator(".sheet-title")).toContainText("Buy train");
    await expect(page.locator(".step.current")).toContainText("Engine");
    await expect(page.locator(".train-loco-btn").first()).toBeVisible();
    await noHorizontalOverflow(page, ".sheet-wizard");
    await shot(page, "buy-engine");

    await page.locator('[data-testid="engine-american-4-4-0"]').click();
    await expect(page.locator(".eng-name")).toHaveText("American 4-4-0");
    await page.locator(".wizard-next").click();
    await expect(page.locator(".step.current")).toContainText("Cars");
    await page.locator(".train-car-add-btn", { hasText: "Passengers" }).click();
    await page.locator(".train-car-add-btn", { hasText: "Coal" }).click();
    await expect(page.locator(".consist-car-btn")).toHaveCount(2);
    await noHorizontalOverflow(page, ".sheet-wizard");
    await shot(page, "buy-cars");
    // Tap a car to remove it, then add it back through the palette.
    await page.locator(".consist-car-btn").first().click();
    await expect(page.locator(".consist-car-btn")).toHaveCount(1);
    await page.locator(".train-car-add-btn", { hasText: "Coal" }).click();
    await page.locator(".wizard-next").click();

    // Route step: the sheet gives way to the side panel; stops come from the map-pick mode.
    await expect(page.locator(".sheet")).toHaveCount(0);
    await expect(page.locator(".panel-title")).toContainText("Buy train");
    await expect(page.locator(".panel-action-build")).toBeDisabled();
    for (const id of [ids.a, ids.a, ids.b]) {
      await page.evaluate((sid) => window.__game!.debugPickStation(sid), id);
    }
    await expect(page.locator('[data-testid="tl-stop"]')).toHaveCount(2);
    await expect(page.locator(".panel-action-build")).toBeEnabled();
    await shot(page, "buy-route");
    await page.locator(".panel-action-build").click();
    const trains = await page.evaluate(() => window.__game!.getTrains());
    expect(trains).toHaveLength(1);
    expect(trains[0]!.cars.length).toBe(2);
  });

  test("train panel: hero strip, status, route timeline, stats, rule change", async ({ page }) => {
    await setup(page);
    const ids = await buildWorld(page, true);
    await page.evaluate(() => window.__game!.runDays(6));
    await page.evaluate((id) => window.__game!.debugOpenTrain(id), ids.train);
    await expect(page.locator(".panel-title")).toHaveText("Train 1");
    await expect(page.locator(".train-hero .consist-veh")).toHaveCount(3); // 2 cars + loco
    await expect(page.locator('[data-testid="train-status"]')).toBeVisible();
    await expect(page.locator('[data-testid="tl-stop"]')).toHaveCount(2);
    await noHorizontalOverflow(page, ".panel");
    await shot(page, "train-panel");

    // Tap a stop's rule chip: it cycles Auto → Full load, keeping the train's progress.
    const before = await page.evaluate(() => window.__game!.getTrains()[0]!.status);
    await page.locator('[data-testid="rule-chip"]').first().click();
    await expect(page.locator('[data-testid="rule-chip"]').first()).toContainText("Full load");
    const after = await page.evaluate(() => window.__game!.getTrains()[0]!.status);
    expect(after).toBe(before);

    await page.locator(".tab", { hasText: "Stats" }).click();
    await expect(page.locator(".train-stats")).toBeVisible();
    await shot(page, "train-stats");
    await page.locator(".tab", { hasText: "Route" }).click();

    // A third stop through the map-pick hook (as if the player tapped a station).
    await page.evaluate((sid) => window.__game!.debugPickStation(sid), ids.a);
    await expect(page.locator('[data-testid="tl-stop"]')).toHaveCount(3);
    await page.locator(".panel-body").evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    await shot(page, "train-route");
  });

  test("roster: lanes by traction, silhouettes for future models, detail with a note", async ({
    page,
  }) => {
    await setup(page, 1920);
    const ids = await buildWorld(page, false);
    await page.evaluate(
      ({ a, b }) => {
        const g = window.__game!;
        const bought = g.buyTrain(a, "pacific-4-6-2", ["passengers"]);
        if (!bought.ok) throw new Error("buy");
        g.setOrders(bought.trainId!, [
          { stationId: a, rule: "auto" },
          { stationId: b, rule: "auto" },
        ]);
      },
      { a: ids.a, b: ids.b },
    );
    await page.locator(".era-badge").click();
    await expect(page.locator(".sheet-roster")).toBeVisible();
    await expect(page.locator(".roster-lane")).toHaveCount(3);
    // 1920: the Pacific (1905) is known and owned; the 1976 heavy diesel is a silhouette.
    await expect(page.locator('[data-testid="roster-pacific-4-6-2"]')).toContainText("Pacific");
    await expect(page.locator('[data-testid="roster-pacific-4-6-2"] .roster-owned')).toHaveText(
      "×1",
    );
    const future = page.locator('[data-testid="roster-heavy-diesel"]');
    await expect(future).toBeDisabled();
    await expect(future).not.toContainText("Heavy");
    await expect(future).toContainText("1976");
    await shot(page, "roster");

    await page.locator('[data-testid="roster-pacific-4-6-2"]').click();
    await expect(page.locator(".roster-note")).not.toBeEmpty();
    await expect(page.locator(".roster-owned-line")).toContainText("1 in service");
    await noHorizontalOverflow(page, ".sheet-roster");
    await shot(page, "roster-detail");
    await page.locator(".roster-back").click();
    await expect(page.locator(".roster-lane")).toHaveCount(3);
    await page.locator(".sheet-close").click();
    await expect(page.locator(".sheet-roster")).toHaveCount(0);
  });

  test("new engine card: announced at the year turn, once, with Roster / OK", async ({ page }) => {
    await setup(page, 1911);
    await page.evaluate(() => window.__game!.setSpeed(0));
    await page.evaluate(() => window.__game!.runDays(365));
    await expect(page.locator(".new-engine-card")).toBeVisible();
    await expect(page.locator(".new-engine-card")).toContainText("Mikado");
    await noHorizontalOverflow(page, ".new-engine-card");
    await shot(page, "new-engine");
    await page.locator(".new-engine-roster").click();
    await expect(page.locator(".new-engine-card")).toHaveCount(0);
    await expect(page.locator(".sheet-roster")).toBeVisible();
    await page.locator(".sheet-close").click();
  });

  test("buy wizard in 1985: filters, dimmed electrics without wire, hero for a diesel", async ({
    page,
  }) => {
    await setup(page, 1985);
    const ids = await buildWorld(page, false);
    await page.evaluate((id) => window.__game!.debugOpenStation(id), ids.a);
    await page.locator(".station-buy-train-btn").click();
    await expect(page.locator(".eng-filter .segmented-btn")).toHaveCount(3); // All + diesel + electric
    await page.locator('.eng-filter [data-filter="electric"]').click();
    const electric = page.locator(".eng-card.locked").first();
    await expect(electric).toBeVisible();
    await electric.click();
    await expect(page.locator(".eng-warning")).toBeVisible();
    await noHorizontalOverflow(page, ".sheet-wizard");
    await shot(page, "buy-engine-electric");
    await page.locator('.eng-filter [data-filter="diesel"]').click();
    await page.locator(".eng-card").first().click();
    await expect(page.locator(".eng-warning")).toHaveCount(0);
    await shot(page, "buy-engine-diesel");
    await page.locator(".wizard-next").click();
    await expect(page.locator(".train-car-add-btn").first()).toBeVisible();
  });

  test("station trains tab and news show locomotive pictures", async ({ page }) => {
    await setup(page);
    const ids = await buildWorld(page, true);
    await page.evaluate((id) => window.__game!.debugOpenStation(id), ids.a);
    await page.locator(".tab", { hasText: "Trains" }).click();
    await expect(page.locator(".train-loco-btn canvas.art-canvas").first()).toBeVisible();
    await shot(page, "station-trains");
  });
});

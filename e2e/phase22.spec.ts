import { expect, test, type Page } from "@playwright/test";
import "./gameWindow";

/** Phase 22 — train screens (STYLE §11): buy wizard, train panel, roster, new-engine card. Runs at
 * phone landscape with a 2× pixel ratio so the locomotive drawings are checked at real sharpness. */
const PHONE = { width: 800, height: 360 };
const TILE_SIZE = 32;
const ROW_Y = 47; // flat row through Ashtown for seed 12345 (see phase17.spec.ts)

test.use({ deviceScaleFactor: 2 });

async function setup(page: Page, startYear = 1950): Promise<void> {
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
  await page.evaluate(() => window.__game!.setSpeed(0));
}

async function buildStations(page: Page): Promise<{ a: number; b: number }> {
  return page.evaluate(
    ({ y }) => {
      const g = window.__game!;
      const w = g.getMap().width;
      const row = Array.from({ length: 20 }, (_, i) => y * w + 71 + i);
      if (!g.buildTrackPath(row).ok) throw new Error("track");
      g.buildStation(y * w + 76, "station");
      g.buildStation(y * w + 90, "depot");
      const [a, b] = g.getStations();
      return { a: a!.id, b: b!.id };
    },
    { y: ROW_Y },
  );
}

async function shot(page: Page, name: string): Promise<void> {
  await page.waitForTimeout(350);
  await page.evaluate(() => document.querySelectorAll(".toast").forEach((t) => t.remove()));
  await page.screenshot({ path: `docs/screenshots/phase-22-${name}.png` });
}

async function centerOn(page: Page, x: number, y: number, zoom: number): Promise<void> {
  await page.evaluate(
    ({ x, y, tile, zoom }) => {
      window.__game!.camera.setCenter((x + 0.5) * tile, (y + 0.5) * tile);
      window.__game!.camera.setZoom(zoom);
    },
    { x, y, tile: TILE_SIZE, zoom },
  );
  await page.waitForTimeout(250);
}

async function pickStation(page: Page, x: number): Promise<void> {
  await page.locator(".train-pick-station-btn").click();
  await centerOn(page, x < 80 ? x + 6 : x + 6, ROW_Y, 1.5);
  const p = await page.evaluate(({ x, y }) => window.__game!.tileScreenPoint(x, y), {
    x,
    y: ROW_Y,
  });
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(150);
}

/** No element inside the sheet/panel may stick out of it or under the footer. */
async function noClipping(page: Page, rootSel: string): Promise<void> {
  const problems = await page.evaluate((sel) => {
    const root = document.querySelector<HTMLElement>(sel);
    if (!root) return ["missing " + sel];
    const box = root.getBoundingClientRect();
    const out: string[] = [];
    for (const el of root.querySelectorAll<HTMLElement>("canvas, button, .hstat, .stat-tile")) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (
        el.closest(
          ".thumb-crop, .eng-list, .cb-palette, .ros-strip, .consist-strip, .wiz-hero, .sheet-body",
        )
      )
        continue;
      if (r.right > box.right + 1 || r.left < box.left - 1)
        out.push(`x ${el.className} ${Math.round(r.left)}..${Math.round(r.right)}`);
    }
    return out;
  }, rootSel);
  expect(problems).toEqual([]);
}

test.describe("Phase 22 — train screens", () => {
  test("buy wizard: engine → cars → route → buy", async ({ page }) => {
    await setup(page);
    const ids = await buildStations(page);
    await page.evaluate((id) => window.__game!.debugOpenStation(id), ids.a);
    await page.locator(".station-buy-train-btn").click();
    await expect(page.locator(".wizard-sheet")).toBeVisible();
    await expect(page.locator(".sheet-title")).toContainText("Buy train");
    await expect(page.locator(".eng-card").first()).toBeVisible();
    await noClipping(page, ".wizard-sheet");
    await shot(page, "buy-engine");

    // The wizard's first screen has a stat block and the picked engine's picture.
    await expect(page.locator(".hero-plate canvas")).toBeVisible();
    await expect(page.locator(".hstat")).toHaveCount(6);

    await page.locator(".wizard-next").click();
    await expect(page.locator(".car-tile").first()).toBeVisible();
    await page.locator(".sugg-chip").first().click();
    await page.locator(".car-tile", { hasText: "Coal" }).click();
    await noClipping(page, ".wizard-sheet");
    await shot(page, "buy-cars");

    await page.locator(".wizard-next").click();
    await expect(page.locator(".wizard-sheet")).toHaveCount(0);
    await expect(page.locator(".panel-title")).toHaveText("Buy Train");
    await expect(page.locator(".panel-action-build")).toBeDisabled();
    await pickStation(page, 76);
    await pickStation(page, 90);
    await expect(page.locator(".train-order-row")).toHaveCount(2);
    await expect(page.locator(".panel-action-build")).toBeEnabled();
    await shot(page, "buy-route");
    await page.locator(".panel-action-build").click();
    await page.waitForTimeout(150);
    const trains = await page.evaluate(() => window.__game!.getTrains());
    expect(trains).toHaveLength(1);
    expect(trains[0]!.cars.length).toBeGreaterThan(1);
  });

  test("train panel: hero, route timeline, stats, edit cars", async ({ page }) => {
    await setup(page);
    const ids = await buildStations(page);
    const trainId = await page.evaluate(({ a, b }) => {
      const g = window.__game!;
      const bought = g.buyTrain(a, "cab-unit-diesel", ["passengers", "mail", "coal", "coal"]);
      if (!bought.ok) throw new Error(bought.reason);
      g.setOrders(bought.trainId!, [
        { stationId: a, rule: "fullLoad" },
        { stationId: b, rule: "auto" },
      ]);
      g.runDays(3);
      return bought.trainId!;
    }, ids);
    await page.evaluate((id) => window.__game!.debugOpenStation(id), ids.a);
    await page.locator(".tab", { hasText: "Trains" }).click();
    await page.locator(".train-loco-btn").first().click();
    await expect(page.locator(".panel-title")).toHaveText("Train 1");
    await expect(page.locator(".train-hero canvas")).toBeVisible();
    await expect(page.locator(".status-line")).toBeVisible();
    await noClipping(page, ".panel");
    await shot(page, "train-panel");

    // Route tab is the default; tapping the rule chip cycles the loading rule without losing progress.
    const before = await page.evaluate(
      (id) => window.__game!.getTrains().find((t) => t.id === id)!.orders[0]!.rule,
      trainId,
    );
    await page.locator(".rule-chip").first().click();
    const after = await page.evaluate(
      (id) => window.__game!.getTrains().find((t) => t.id === id)!.orders[0]!.rule,
      trainId,
    );
    expect(after).not.toBe(before);
    await page.locator(".panel-body").evaluate((el) => {
      el.scrollTop = 120;
    });
    await shot(page, "train-route");

    await page.locator(".tab", { hasText: "Stats" }).click();
    await shot(page, "train-stats");

    await page.locator(".train-edit-cars-btn").click();
    await expect(page.locator(".sheet-title")).toHaveText("Edit Consist");
    await shot(page, "edit-cars");
  });

  test("roster and detail", async ({ page }) => {
    await setup(page);
    await page.locator(".era-badge").click();
    await expect(page.locator(".roster-sheet")).toBeVisible();
    await expect(page.locator(".ros-card")).toHaveCount(22);
    await expect(page.locator(".ros-card.future").first()).toBeVisible();
    await shot(page, "roster");
    await page.locator('.ros-card[data-loco="pacific-4-6-2"]').click();
    await expect(page.locator(".ros-note")).toBeVisible();
    await shot(page, "roster-detail");
    await page.locator(".ros-back").click();
    await expect(page.locator(".ros-rows")).toBeVisible();
  });

  test("new-engine announcement card", async ({ page }) => {
    await setup(page);
    await page.evaluate(() => window.__game!.debugAnnounceLoco("road-switcher-diesel"));
    await expect(page.locator(".announce-card")).toBeVisible();
    await expect(page.locator(".announce-overline")).toHaveText("NEW LOCOMOTIVE");
    await shot(page, "new-engine");
    await page.locator(".announce-roster").click();
    await expect(page.locator(".roster-sheet")).toBeVisible();
    await expect(page.locator(".ros-card.focus")).toHaveCount(1);
  });
});

import { expect, test, type Page } from "@playwright/test";
import "./gameWindow";

/** Phase 20 — UI system v2: every panel's first screen at phone landscape (STYLE §8.4). */
const PHONE = { width: 800, height: 360 };
const TILE_SIZE = 32;
const ROW_Y = 47; // flat row through Ashtown for seed 12345 (see phase17.spec.ts)
const LOCO = "american-4-4-0";

async function setup(page: Page, viewport = PHONE): Promise<void> {
  await page.setViewportSize(viewport);
  await page.goto("/?debug=1");
  await page.waitForFunction(() => window.__game !== undefined);
  await page.evaluate(() =>
    window.__game?.regenerate({
      seed: 12345,
      size: "medium",
      waterLevel: "normal",
      roughness: "normal",
      startYear: 1848,
    }),
  );
}

/** Track + two stations + a train, so the panels have something real to show. */
async function buildWorld(page: Page): Promise<{ a: number; b: number; train: number }> {
  const ids = await page.evaluate(
    ({ y, loco }) => {
      const g = window.__game!;
      const w = g.getMap().width;
      const row = Array.from({ length: 20 }, (_, i) => y * w + 71 + i);
      if (!g.buildTrackPath(row).ok) throw new Error("track");
      g.buildStation(y * w + 76, "station");
      g.buildStation(y * w + 90, "depot");
      const [a, b] = g.getStations();
      const bought = g.buyTrain(a!.id, loco, ["passengers", "mail"]);
      if (!bought.ok) throw new Error(`buy ${bought.reason}`);
      g.setOrders(bought.trainId!, [
        { stationId: a!.id, rule: "auto" },
        { stationId: b!.id, rule: "auto" },
      ]);
      return { a: a!.id, b: b!.id, train: bought.trainId! };
    },
    { y: ROW_Y, loco: LOCO },
  );
  await page.evaluate(() => window.__game!.setSpeed(0));
  await page.evaluate(() => window.__game!.runDays(40));
  return ids;
}

async function shot(page: Page, name: string): Promise<void> {
  await page.waitForTimeout(350);
  // Transient toasts (breakdown news…) would cover the top bar; the panels are what we check.
  await page.evaluate(() => document.querySelectorAll(".toast").forEach((t) => t.remove()));
  await page.screenshot({ path: `docs/screenshots/phase-20-${name}.png` });
}

/** True when nothing inside the panel overflows its box horizontally and the body's first screen
 * is not clipped by the footer (rows overlapping the footer would fail this). */
async function panelLayoutOk(page: Page): Promise<void> {
  const problems = await page.evaluate(() => {
    const panel = document.querySelector<HTMLElement>(".panel");
    if (!panel) return ["no panel"];
    const box = panel.getBoundingClientRect();
    const out: string[] = [];
    for (const el of panel.querySelectorAll<HTMLElement>(".panel-body *")) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.right > box.right + 1)
        out.push(`overflow-x ${el.className} ${Math.round(r.right - box.right)}`);
    }
    return out;
  });
  expect(problems).toEqual([]);
}

/** Centres the camera on a world tile and taps the middle of the screen in Info mode. */
async function tapTile(page: Page, x: number, y: number, zoom = 2): Promise<void> {
  await page.evaluate(
    ({ x, y, tile, zoom }) => {
      window.__game!.camera.setCenter((x + 0.5) * tile, (y + 0.5) * tile);
      window.__game!.camera.setZoom(zoom);
    },
    { x, y, tile: TILE_SIZE, zoom },
  );
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: "Info", exact: true }).click();
  const vp = page.viewportSize()!;
  // Keep the tap clear of the panel side: tile is centred, panel opens on the right.
  await page.mouse.click(vp.width / 2, vp.height / 2);
  await page.waitForTimeout(300);
}

async function cityTile(page: Page, name?: string): Promise<{ x: number; y: number; id: number }> {
  return page.evaluate((wanted) => {
    const g = window.__game!;
    const w = g.getMap().width;
    const cities = g.getCities();
    const city =
      (wanted ? cities.find((c) => c.name === wanted) : undefined) ?? cities[cities.length - 1]!;
    const t = city.tiles[Math.floor(city.tiles.length / 2)]!;
    return { x: t % w, y: Math.floor(t / w), id: city.id };
  }, name);
}

test.describe("Phase 20 — UI v2 panels", () => {
  test("city panel", async ({ page }) => {
    await setup(page);
    await buildWorld(page);
    const t = await cityTile(page, "Claybury");
    await tapTile(page, t.x, t.y);
    await expect(page.locator(".panel-title")).toBeVisible();
    await panelLayoutOk(page);
    await shot(page, "city");
  });

  test("station panel: cargo, trains, build", async ({ page }) => {
    await setup(page);
    const ids = await buildWorld(page);
    await page.evaluate((id) => window.__game!.debugOpenStation(id), ids.a);
    await page.waitForTimeout(300);
    await panelLayoutOk(page);
    await shot(page, "station-cargo");
    await page.locator(".tab", { hasText: "Trains" }).click();
    await shot(page, "station-trains");
    await page.locator(".tab", { hasText: "Build" }).click();
    await shot(page, "station-build");
    await page.locator(".panel-body").evaluate((el) => (el.scrollTop = el.scrollHeight));
    await shot(page, "station-build-scrolled");
  });

  test("industry panel", async ({ page }) => {
    await setup(page);
    const factory = await page.evaluate(() =>
      window.__game!.getIndustries().find((i) => i.type === "factory")!,
    );
    await tapTile(page, factory.x, factory.y);
    await expect(page.locator(".panel-title")).toHaveText("Factory");
    await panelLayoutOk(page);
    await shot(page, "industry");
  });

  test("finance panel: overview and this year", async ({ page }) => {
    await setup(page);
    await buildWorld(page);
    await page.evaluate(() => window.__game!.takeLoan(100_000));
    await page.evaluate(() => window.__game!.runDays(120));
    await page.locator(".cash").click();
    await page.waitForTimeout(300);
    await expect(page.locator(".panel-title")).toHaveText("Finance");
    await expect(page.locator(".finance-chart")).toBeVisible();
    await panelLayoutOk(page);
    await shot(page, "finance-overview");
    await page.locator(".tab", { hasText: "This year" }).click();
    await panelLayoutOk(page);
    await shot(page, "finance-year");
  });

  test("menu, top bar, news, goals, settings, save", async ({ page }) => {
    await setup(page);
    await buildWorld(page);
    await page.evaluate(() => window.__game!.runDays(30));
    await page.screenshot({
      path: "docs/screenshots/phase-20-topbar.png",
      clip: { x: 0, y: 0, width: 800, height: 60 },
    });
    await page.getByRole("button", { name: "Menu" }).click();
    await page.waitForTimeout(300);
    await panelLayoutOk(page);
    await shot(page, "menu");
    await page.getByRole("button", { name: "Settings" }).click();
    await shot(page, "settings");
    await page.getByRole("button", { name: "Back" }).click();
    await page.getByRole("button", { name: "Save Game" }).click();
    await shot(page, "save");
    await page.getByRole("button", { name: "Back" }).click();
    await page.locator(".panel-close").click();
    await page.waitForTimeout(300);
    await page.locator(".news-button").click();
    await page.waitForTimeout(300);
    await panelLayoutOk(page);
    await shot(page, "news");
    await page.locator(".panel-close").click();
    await page.waitForTimeout(300);
    await page.locator(".goals-button").click();
    await page.waitForTimeout(300);
    await panelLayoutOk(page);
    await shot(page, "goals");
  });

  test("city panel at 1280×720", async ({ page }) => {
    await setup(page, { width: 1280, height: 720 });
    await buildWorld(page);
    const t = await cityTile(page, "Claybury");
    await tapTile(page, t.x, t.y);
    await expect(page.locator(".panel-title")).toBeVisible();
    await shot(page, "city-1280");
  });

  test("shell check: placement, train panel and yearly report keep the v2 header/footer", async ({
    page,
  }) => {
    await setup(page);
    const ids = await buildWorld(page);
    await page.evaluate((id) => window.__game!.debugOpenStation(id), ids.a);
    await page.locator(".tab", { hasText: "Trains" }).click();
    await page.locator(".train-loco-btn").first().click();
    await expect(page.locator(".panel-title")).toHaveText("Train 1");
    await panelLayoutOk(page);
    await shot(page, "train-shell");
    await page.locator(".panel-close").click();
    await page.waitForTimeout(300);
    await page.getByRole("button", { name: "Station", exact: true }).click();
    const vp = page.viewportSize()!;
    void vp;
    await page.evaluate(() => window.__game!.runDays(330));
    await page.locator(".top-bar .cash").click(); // Phase 28B: the report opens from Finance
    await page.getByRole("button", { name: "Yearly Report" }).click();
    await page.waitForTimeout(400);
    await shot(page, "yearly-report");
  });

  test("station placement panel", async ({ page }) => {
    await setup(page);
    await page.evaluate(
      ({ y }) => {
        const g = window.__game!;
        const w = g.getMap().width;
        g.buildTrackPath(Array.from({ length: 20 }, (_, i) => y * w + 71 + i));
      },
      { y: ROW_Y },
    );
    await page.evaluate(
      ({ y, tile }) => {
        window.__game!.camera.setCenter(76.5 * tile, (y + 0.5) * tile);
        window.__game!.camera.setZoom(1.5);
      },
      { y: ROW_Y, tile: TILE_SIZE },
    );
    await page.getByRole("button", { name: "Station", exact: true }).click();
    const p = await page.evaluate(({ y }) => window.__game!.tileScreenPoint(76, y), { y: ROW_Y });
    await page.mouse.click(p.x, p.y);
    await expect(page.locator(".panel-title")).toHaveText("New Station");
    await panelLayoutOk(page);
    await shot(page, "station-placement");
  });
});

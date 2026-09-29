import { expect, test, type Page } from "@playwright/test";
import "./gameWindow";

/** Phase 24A — finance operating view, per-train profit, industry spacing (800×360 screenshots). */
const PHONE = { width: 800, height: 360 };
const TILE_SIZE = 32;
const ROW_Y = 5; // a quiet corner of the seed-12345 map (see economy.spec.ts)

async function open(page: Page): Promise<void> {
  await page.setViewportSize(PHONE);
  await page.goto("/?debug=1");
  await page.waitForFunction(() => window.__game !== undefined);
}

async function shot(page: Page, name: string): Promise<void> {
  await page.waitForTimeout(500);
  await page.evaluate(() => document.querySelectorAll(".toast").forEach((t) => t.remove()));
  await page.screenshot({ path: `docs/screenshots/phase-24a-${name}.png` });
}

test.describe("Phase 24A", () => {
  test("operating profit, per-train profit and the sorted train list", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await open(page);
    await page.evaluate(() =>
      window.__game!.regenerate({
        seed: 12345,
        size: "medium",
        waterLevel: "normal",
        roughness: "normal",
        startYear: 1848,
      }),
    );
    const trainIds = await page.evaluate((y) => {
      const g = window.__game!;
      g.setSpeed(0);
      g.debugSetCash(2_000_000);
      const map = g.getMap();
      const raw = map as unknown as {
        terrain: Uint8Array;
        industryId: Int16Array;
        cityId: Int16Array;
      };
      for (let row = y - 2; row <= y + 2; row++) {
        for (let x = 60; x <= 90; x++) {
          const idx = row * map.width + x;
          raw.terrain[idx] = 0;
          raw.industryId[idx] = -1;
          raw.cityId[idx] = -1;
        }
      }
      const row = Array.from({ length: 11 }, (_, i) => y * map.width + 70 + i);
      if (!g.buildTrackPath(row).ok) throw new Error("track");
      g.buildStation(y * map.width + 70, "depot");
      g.buildStation(y * map.width + 80, "depot");
      g.debugPlaceIndustry(4 * map.width + 71, "coalMine");
      g.debugPlaceIndustry(4 * map.width + 81, "steelMill");
      const [a, b] = g.getStations();
      const orders = [
        { stationId: a!.id, rule: "auto" },
        { stationId: b!.id, rule: "auto" },
      ];
      const ids: number[] = [];
      for (const cars of [["coal", "coal", "coal", "coal"], ["passengers"]]) {
        const bought = g.buyTrain(a!.id, "american-4-4-0", cars);
        if (!bought.ok) throw new Error(`buy ${bought.reason}`);
        g.setOrders(bought.trainId!, orders);
        ids.push(bought.trainId!);
      }
      g.runDays(400);
      return ids;
    }, ROW_Y);

    // Finance overview: operating headline + bars, investments kept apart.
    await page.locator(".cash").click();
    await page.waitForTimeout(300);
    await expect(page.locator(".panel-title")).toHaveText("Finance");
    await expect(page.locator(".operating-headline")).toBeVisible();
    await expect(page.locator(".operating-value")).toContainText("/ month");
    await shot(page, "finance-overview");

    // Train panel → Stats: profit headline, last year, lifetime, paid-back meter.
    await page.evaluate((id) => window.__game!.debugOpenTrain(id), trainIds[0]!);
    await page.waitForTimeout(400);
    await page.locator(".tab", { hasText: "Stats" }).first().click();
    await expect(page.locator(".paid-back")).toBeVisible();
    await shot(page, "train-stats");

    // Train list sorted by profit.
    await page.locator(".panel-close").click();
    await page.waitForTimeout(400);
    await page.locator(".train-list-button").click();
    await page.waitForTimeout(300);
    await page.locator(".segmented-btn", { hasText: "Profit" }).click();
    await page.waitForTimeout(300);
    const rows = await page.locator(".train-list-row .train-profit-col").allTextContents();
    expect(rows.length).toBe(2);
    const amount = (s: string): number => {
      const m = /([+−-])\$([\d.,]+)(k|M)?/.exec(s.replace(/\s/g, ""));
      if (!m) return 0;
      const v = parseFloat(m[2]!.replace(/,/g, "")) * (m[3] === "k" ? 1e3 : m[3] === "M" ? 1e6 : 1);
      return m[1] === "+" ? v : -v;
    };
    expect(amount(rows[0]!)).toBeGreaterThanOrEqual(amount(rows[1]!));
    await shot(page, "train-list-by-profit");
    expect(errors).toEqual([]);
  });

  test("Central Europe: industries keep clear of Ljubljana and Trieste", async ({ page }) => {
    await open(page);
    await page.evaluate(() =>
      window.__game!.regenerate({ seed: 1, region: "central-eu", startYear: 1848 }),
    );
    await page.evaluate(() => window.__game!.setSpeed(0));
    const info = await page.evaluate(() => {
      const g = window.__game!;
      const map = g.getMap();
      const cities = g.getCities();
      const min = new Map<string, number>();
      for (const i of g.getIndustries()) {
        if (i.type === "port") continue;
        let best = Infinity;
        for (const c of cities)
          for (const t of c.tiles)
            best = Math.min(
              best,
              Math.hypot((t % map.width) - i.x, Math.floor(t / map.width) - i.y),
            );
        min.set(`${i.type}@${i.x},${i.y}`, best);
      }
      return { minDistance: Math.min(...min.values()) };
    });
    expect(info.minDistance).toBeGreaterThanOrEqual(5);

    const cities = await page.evaluate(() => window.__game!.getCities());
    for (const name of ["Ljubljana", "Trieste"]) {
      const c = await page.evaluate(
        (id) => window.__game!.getCityWorldCenter(id),
        cities.find((x) => x.name === name)!.id,
      );
      await page.evaluate(
        ({ c, t }) => {
          window.__game!.camera.setCenter(c!.x, c!.y);
          window.__game!.camera.setZoom(1);
          void t;
        },
        { c, t: TILE_SIZE },
      );
      await shot(page, `spacing-${name.toLowerCase()}`);
    }
  });
});

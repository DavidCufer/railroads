import { expect, test, type Page } from "@playwright/test";
import "./gameWindow";

/** Phase 34: live panels, quieter warnings, decluttered panels, save-name input, lines, spacing. Screenshots 800×360. */
test.use({ deviceScaleFactor: 2 });

const PHONE_VIEWPORT = { width: 800, height: 360 };
const shot = (name: string): string => `docs/screenshots/phase-34-${name}.png`;
type P = { x: number; y: number };
const range = (n: number, f: (i: number) => P): P[] => Array.from({ length: n }, (_, i) => f(i));

async function setup(page: Page): Promise<void> {
  await page.setViewportSize(PHONE_VIEWPORT);
  await page.goto("/?debug=1");
  await page.waitForFunction(() => window.__game !== undefined);
  await page.evaluate(() =>
    window.__game?.regenerate({
      seed: 12345,
      size: "medium",
      waterLevel: "normal",
      startYear: 1900,
    }),
  );
  await page.evaluate(() => window.__game!.debugSetCash(50_000_000));
  await page.evaluate(() => window.__game!.setSpeed(0));
}

async function clearArea(
  page: Page,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
): Promise<void> {
  await page.evaluate(
    ({ x0, x1, y0, y1 }) => {
      const map = window.__game!.getMap() as unknown as {
        width: number;
        height: number;
        terrain: Uint8Array;
        industryId: Int16Array;
        cityId: Int16Array;
        riverNext: Int32Array;
        riverFlow: Uint16Array;
      };
      for (let y = y0 - 3; y <= y1 + 3; y++) {
        for (let x = x0 - 3; x <= x1 + 3; x++) {
          if (x < 0 || y < 0 || x >= map.width || y >= map.height) continue;
          const idx = y * map.width + x;
          map.terrain[idx] = 0;
          map.industryId[idx] = -1;
          map.cityId[idx] = -1;
          map.riverNext[idx] = -1;
          map.riverFlow[idx] = 0;
        }
      }
      (window.__game!.getState() as unknown as { mapContentVersion: number }).mapContentVersion++;
    },
    { x0, x1, y0, y1 },
  );
}

async function build(page: Page, tiles: P[]): Promise<void> {
  const r = await page.evaluate((tiles) => {
    const w = window.__game!.getMap().width;
    return window.__game!.buildTrackPath(tiles.map(({ x, y }) => y * w + x));
  }, tiles);
  if (!r.ok) throw new Error(`build failed: ${r.reason}`);
}

async function station(page: Page, x: number, y: number): Promise<void> {
  await page.evaluate(
    ({ x, y }) => {
      const w = window.__game!.getMap().width;
      const r = window.__game!.buildStation(y * w + x, "station");
      if (!r.ok) throw new Error(`station failed: ${r.reason}`);
    },
    { x, y },
  );
}

async function lineWorld(page: Page): Promise<{ a: number; b: number }> {
  await setup(page);
  await clearArea(page, 50, 70, 30, 40);
  await build(
    page,
    range(13, (i) => ({ x: 52 + i, y: 35 })),
  );
  await station(page, 52, 35);
  await station(page, 64, 35);
  const st = await page.evaluate(() => window.__game!.getStations());
  return { a: st[0]!.id, b: st[1]!.id };
}

test.describe("Phase 34 — live panels", () => {
  test("the buy sheet's Buy button enables when cash rises, without reopening", async ({
    page,
  }) => {
    const { a } = await lineWorld(page);
    await page.evaluate((id) => window.__game!.debugOpenStation(id), a);
    await page.locator(".station-buy-train-btn").click();
    await page.locator(".wizard-next").click();
    await page.locator(".train-car-add-btn", { hasText: "Passengers" }).click();
    await page.locator(".wizard-next").click();
    await page.evaluate((sid) => window.__game!.debugPickStation(sid), a);
    await page.evaluate(() => window.__game!.debugPickStation(window.__game!.getStations()[1]!.id));
    await expect(page.locator('[data-testid="tl-stop"]')).toHaveCount(2);
    await expect(page.locator(".panel-action-build")).toBeEnabled();
    await page.evaluate(() => window.__game!.debugSetCash(100));
    await expect(page.locator(".panel-action-build")).toBeDisabled();
    await page.evaluate(() => window.__game!.debugSetCash(50_000_000));
    await expect(page.locator(".panel-action-build")).toBeEnabled({ timeout: 3000 });
  });

  test("the station panel's waiting cargo updates in place and keeps its scroll", async ({
    page,
  }) => {
    const { a } = await lineWorld(page);
    await page.evaluate((id) => window.__game!.debugOpenStation(id), a);
    await expect(page.locator(".panel")).toBeVisible();
    const before = await page.locator(".panel-body").innerHTML();
    await page.evaluate(() => {
      const s = window.__game!.getState() as unknown as {
        stationCargo: Map<number, Record<string, { amount: number; waitingDays: number }>>;
      };
      const id = window.__game!.getStations()[0]!.id;
      s.stationCargo.set(id, { passengers: { amount: 77, waitingDays: 1 } });
    });
    await expect
      .poll(async () => (await page.locator(".panel-body").innerHTML()) !== before, {
        timeout: 4000,
      })
      .toBe(true);
  });
});

test.describe("Phase 34 — warnings only at confirm", () => {
  test("buying a train with a cargo gap asks once; the train panel keeps a collapsed warning line", async ({
    page,
  }) => {
    const { a, b } = await lineWorld(page);
    await page.evaluate((id) => window.__game!.debugOpenStation(id), a);
    await page.locator(".station-buy-train-btn").click();
    await page.locator(".wizard-next").click();
    await page.locator(".train-car-add-btn", { hasText: "Coal" }).click();
    await page.locator(".wizard-next").click();
    await page.evaluate((sid) => window.__game!.debugPickStation(sid), a);
    await page.evaluate((sid) => window.__game!.debugPickStation(sid), b);
    await expect(page.locator('[data-testid="tl-stop"]')).toHaveCount(2);
    // No inline warning while building the route.
    await expect(page.locator(".cargo-gap-line")).toHaveCount(0);
    await page.locator(".panel-action-build").click();
    await expect(page.locator('[data-testid="gap-confirm"]')).toContainText(
      "Coal has nowhere to go",
    );
    await page.waitForTimeout(300);
    await page.screenshot({ path: shot("gap-confirm") });
    await page.locator(".gap-back").click();
    await expect(page.locator('[data-testid="gap-confirm"]')).toHaveCount(0);
    await page.locator(".panel-action-build").click();
    await page.locator(".gap-buy-anyway").click();
    const trains = await page.evaluate(() => window.__game!.getTrains());
    expect(trains).toHaveLength(1);
    await page.evaluate((id) => window.__game!.debugOpenTrain(id), trains[0]!.id);
    await expect(page.locator('[data-testid="warn-fold"]')).toContainText("1 warning");
    await expect(page.locator(".cargo-gap-line")).toHaveCount(0);
    await page.waitForTimeout(300);
    await page.screenshot({ path: shot("train-warning-collapsed") });
    await page.locator(".warn-fold-toggle").click();
    await expect(page.locator(".cargo-gap-line")).toHaveCount(1);
  });
});

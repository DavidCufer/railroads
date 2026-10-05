import { expect, test, type Page } from "@playwright/test";
import "./gameWindow";

/** Phase 35: the "Where passengers go" detail sheet. Screenshots 800×360. */
test.use({ deviceScaleFactor: 2 });

const PHONE_VIEWPORT = { width: 800, height: 360 };
const shot = (name: string): string => `docs/screenshots/phase-35-${name}.png`;
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

const TOWNS = [
  { name: "Venice", x: 52, pop: 40000 },
  { name: "Ljubljana", x: 64, pop: 30000 },
  { name: "Zagreb", x: 76, pop: 25000 },
  { name: "Padua", x: 52, y: 41, pop: 18000 },
  { name: "Verona", x: 58, y: 41, pop: 15000 },
];

test.describe("Phase 35 — where passengers go", () => {
  test("the passenger tile opens a sheet with first-stop bars, an expandable row and the unconnected towns", async ({
    page,
  }) => {
    await setup(page);
    await clearArea(page, 50, 80, 30, 45);
    await build(
      page,
      range(25, (i) => ({ x: 52 + i, y: 35 })),
    );
    await station(page, 52, 35);
    await station(page, 64, 35);
    await station(page, 76, 35);
    await page.evaluate((towns) => {
      const state = window.__game!.getState() as unknown as {
        cities: Array<Record<string, unknown>>;
        mapContentVersion: number;
      };
      const map = window.__game!.getMap() as unknown as { width: number; cityId: Int16Array };
      state.cities.length = 0;
      towns.forEach((t, i) => {
        const tile = (t.y ?? 35) * map.width + t.x;
        map.cityId[tile] = i;
        state.cities.push({
          id: i,
          name: t.name,
          tier: "city",
          population: t.pop,
          anchorX: t.x,
          anchorY: t.y ?? 35,
          coastal: false,
          tiles: [tile],
        });
      });
      state.mapContentVersion++;
    }, TOWNS);
    const st = await page.evaluate(() => window.__game!.getStations());
    await page.evaluate(
      ({ a, b, c }) => {
        for (const [from, to] of [
          [a, b],
          [b, c],
        ] as const) {
          const r = window.__game!.buyTrain(a, "atlantic-4-4-2", ["passengers"]);
          if (!r.ok) throw new Error(String(r.reason));
          window.__game!.setOrders(r.trainId!, [
            { stationId: from, rule: "auto" },
            { stationId: to, rule: "auto" },
          ]);
        }
      },
      { a: st[0]!.id, b: st[1]!.id, c: st[2]!.id },
    );
    await page.evaluate((id) => window.__game!.debugOpenStation(id), st[0]!.id);
    await page.locator(".dest-link").click();
    const sheet = page.locator(".sheet-destinations");
    await expect(sheet).toBeVisible();
    // One bucket: everything leaves via the Ljubljana stop; Zagreb is behind it.
    await expect(sheet.locator(".dest-row")).toHaveCount(1);
    await expect(sheet.locator(".dest-final")).toHaveCount(0);
    await sheet.locator(".dest-row-head").click();
    await expect(sheet.locator(".dest-final")).toContainText("Ljubljana");
    await expect(sheet.locator(".dest-final")).toContainText("Zagreb");
    await expect(sheet.locator(".dest-unconnected")).toContainText("Padua");
    await page.waitForTimeout(300);
    await page.screenshot({ path: shot("destinations") });

    // Phase 35C: the town panel shows the same kind of number: the town total, and how much of it is connected.
    const header = (await sheet.locator(".hint").first().textContent()) ?? "";
    await sheet.locator(".sheet-close").click();
    await expect(sheet).toHaveCount(0);
    await page.evaluate(() => window.__game!.debugOpenCity(0));
    const connected = page.locator(".city-connected");
    await expect(connected).toBeVisible();
    await expect(connected).toContainText("Connected:");
    // Venice 40k x 0.0121 a month in 1900 = 484 for the town; the station sends only the connected part of it.
    const town = Number(
      (await page.locator(".chip-lg").first().textContent())?.replace(/\D/g, "") ?? "0",
    );
    expect(town).toBe(484);
    expect(Number(header.replace(/\D/g, "").slice(0, 3))).toBeLessThanOrEqual(town);
    await page.waitForTimeout(300);
    await page.screenshot({ path: "docs/screenshots/phase-35c-town.png" });
  });
});

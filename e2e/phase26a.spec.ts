import { expect, test, type Page } from "@playwright/test";
import "./gameWindow";

/** Phase 26A screenshots and checks: repair crews, city next-tier info, discoveries, frontier towns. */
test.use({ deviceScaleFactor: 2 });

const PHONE_VIEWPORT = { width: 800, height: 360 };
const TILE_SIZE = 32;
type P = { x: number; y: number };
const shot = (name: string): string => `docs/screenshots/phase-26a-${name}.png`;

async function setup(page: Page, year = 1900): Promise<void> {
  await page.setViewportSize(PHONE_VIEWPORT);
  await page.goto("/?debug=1");
  await page.waitForFunction(() => window.__game !== undefined);
  await page.evaluate(
    (startYear) =>
      window.__game?.regenerate({ seed: 12345, size: "medium", waterLevel: "normal", startYear }),
    year,
  );
  await page.evaluate(() => window.__game!.debugSetCash(50_000_000));
  await page.evaluate(() => window.__game!.setSpeed(0));
}

async function centerOn(page: Page, x: number, y: number, zoom: number): Promise<void> {
  await page.evaluate(
    ({ x, y, tileSize }) =>
      window.__game?.camera.setCenter((x + 0.5) * tileSize, (y + 0.5) * tileSize),
    { x, y, tileSize: TILE_SIZE },
  );
  await page.evaluate((z) => window.__game?.camera.setZoom(z), zoom);
  await page.waitForTimeout(250);
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

async function station(page: Page, x: number, y: number, shed: boolean): Promise<number> {
  return page.evaluate(
    ({ x, y, shed }) => {
      const w = window.__game!.getMap().width;
      const r = window.__game!.buildStation(y * w + x, "station");
      if (!r.ok) throw new Error(`station failed: ${r.reason}`);
      const st = (
        window.__game!.getState() as unknown as {
          stations: Array<{ id: number; tile: number; hasEngineShed: boolean }>;
        }
      ).stations.find((s) => s.tile === y * w + x)!;
      st.hasEngineShed = shed;
      return st.id;
    },
    { x, y, shed },
  );
}

const range = (n: number, f: (i: number) => P): P[] => Array.from({ length: n }, (_, i) => f(i));

test.describe("Phase 26A — economy depth", () => {
  test("repair crew drives to a broken-down train; the panel says when it arrives", async ({
    page,
  }) => {
    await setup(page);
    await clearArea(page, 50, 100, 20, 40);
    await build(
      page,
      range(41, (i) => ({ x: 55 + i, y: 30 })),
    );
    const a = await station(page, 55, 30, true);
    const b = await station(page, 95, 30, false);
    const trainId = await page.evaluate(
      ({ a, b }) => {
        const r = window.__game!.buyTrain(a, "atlantic-4-4-2", ["coal", "coal"]);
        if (!r.ok || r.trainId === undefined) throw new Error("buy failed");
        window.__game!.setOrders(r.trainId, [
          { stationId: a, rule: "passThrough" },
          { stationId: b, rule: "passThrough" },
        ]);
        return r.trainId;
      },
      { a, b },
    );
    await page.evaluate(() => window.__game!.runDays(8));
    await page.evaluate((id) => window.__game!.debugBreakdown(id, 5), trainId);
    await page.evaluate(() => window.__game!.runDays(4));
    const t = await page.evaluate(
      (id) => window.__game!.getTrains().find((x) => x.id === id)!,
      trainId,
    );
    expect(t.status).toBe("broken");
    // Crew and train together in the map area, first without the panel, then with it.
    const crewAt = await page.evaluate(() => {
      const st = window.__game!.getState() as unknown as {
        ticks: number;
        map: { width: number };
        trains: Array<{
          repairCrew?: {
            startTick: number;
            dispatchTicks: number;
            travelTicks: number;
            path: number[];
          };
        }>;
      };
      const crew = st.trains[0]!.repairCrew!;
      const f = Math.min(1, (st.ticks - crew.startTick - crew.dispatchTicks) / crew.travelTicks);
      const i = Math.floor(f * (crew.path.length - 1));
      const tile = crew.path[i]!;
      return { x: tile % st.map.width, y: Math.floor(tile / st.map.width) };
    });
    await centerOn(page, t.x - 8, t.y, 1.0);
    await page.screenshot({ path: shot("repair-crew-map") });
    await centerOn(page, t.x + 5, t.y, 2);
    await page.evaluate((id) => window.__game!.debugOpenTrain(id), trainId);
    await page.waitForTimeout(300);
    const text = await page.locator("[data-testid=train-status]").innerText();
    expect(text).toMatch(/repair crew from .* arriving in \d+ days?/i);
    await page.screenshot({ path: shot("repair-crew-on-its-way") });
  });

  test("city panel shows the next tier and what it unlocks", async ({ page }) => {
    await setup(page);
    const town = await page.evaluate(() => {
      const c = window.__game!.getCities().find((c) => c.tier === "town");
      return c?.id ?? window.__game!.getCities()[0]!.id;
    });
    await page.evaluate((id) => window.__game!.debugOpenCity(id), town);
    await page.waitForTimeout(300);
    await expect(page.getByText(/Next tier/i).first()).toBeVisible();
    await expect(page.getByText(/unlocks demand for/i).first()).toBeVisible();
    await page.screenshot({ path: shot("city-next-tier") });
  });

  test("a discovered resource appears on the map with news", async ({ page }) => {
    await setup(page);
    const found = await page.evaluate(() => {
      const state = window.__game!.getState() as unknown as {
        industries: Array<{ id: number; type: string; x: number; y: number }>;
        news: Array<{ kind: string; industryId?: number }>;
        ticks: number;
      };
      return state.news.length >= 0 && state.industries.length;
    });
    expect(found).toBeGreaterThan(0);
    // Run years until a discovery news item shows up.
    let id = -1;
    for (let i = 0; i < 40 && id < 0; i++) {
      await page.evaluate(() => window.__game!.runDays(360));
      id = await page.evaluate(() => {
        const s = window.__game!.getState() as unknown as {
          news: Array<{ kind: string; industryId?: number }>;
        };
        return s.news.find((n) => n.kind === "discovery")?.industryId ?? -1;
      });
    }
    expect(id).toBeGreaterThanOrEqual(0);
    const at = await page.evaluate(
      (id) => window.__game!.getIndustries().find((i) => i.id === id)!,
      id,
    );
    await page.keyboard.press("Escape");
    await page.evaluate(() =>
      document.querySelector<HTMLElement>(".panel-close, [aria-label=Close]")?.click(),
    );
    await page.waitForTimeout(300);
    await centerOn(page, at.x, at.y, 1.5);
    await page.screenshot({ path: shot("discovered-resource") });
  });

  test("a frontier village is founded beside a long-served station in empty land", async ({
    page,
  }) => {
    await setup(page);
    await clearArea(page, 50, 100, 20, 40);
    await build(
      page,
      range(41, (i) => ({ x: 55 + i, y: 30 })),
    );
    const a = await station(page, 55, 30, true);
    const b = await station(page, 95, 30, false);
    await page.evaluate(
      ({ a, b }) => {
        const r = window.__game!.buyTrain(a, "atlantic-4-4-2", ["passengers"]);
        if (!r.ok || r.trainId === undefined) throw new Error("buy failed");
        window.__game!.setOrders(r.trainId, [
          { stationId: a, rule: "auto" },
          { stationId: b, rule: "auto" },
        ]);
        const st = window.__game!.getState() as unknown as {
          stations: Array<{ id: number; servedMonths?: number }>;
        };
        for (const s of st.stations) s.servedMonths = 23;
      },
      { a, b },
    );
    const before = await page.evaluate(() => window.__game!.getCities().length);
    let after = before;
    for (let i = 0; i < 40 && after === before; i++) {
      await page.evaluate(() => window.__game!.runDays(30));
      after = await page.evaluate(() => window.__game!.getCities().length);
    }
    expect(after).toBeGreaterThan(before);
    const village = await page.evaluate(() => {
      const c = window.__game!.getCities().at(-1)!;
      const w = window.__game!.getMap().width;
      return { id: c.id, tier: c.tier, x: c.tiles[0]! % w, y: Math.floor(c.tiles[0]! / w) };
    });
    expect(village.tier).toBe("village");
    await centerOn(page, village.x, village.y, 2);
    await page.screenshot({ path: shot("frontier-village") });
  });
});

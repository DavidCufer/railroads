import { expect, test, type Page } from "@playwright/test";
import "./gameWindow";

/**
 * Phase 25A screenshots and checks: diamond crossings, trains waiting at crossings/junctions,
 * one delivery label per cargo type. `SHOT=before` writes the *-before.png set (pre-change code);
 * the default writes *-after.png. 2x device scale so rails/ties are legible.
 */
test.use({ deviceScaleFactor: 2 });

const PHONE_VIEWPORT = { width: 800, height: 360 };
const TILE_SIZE = 32;
type P = { x: number; y: number };
const SHOT = process.env["SHOT"] ?? "after";
const shot = (name: string): string => `docs/screenshots/phase-25a-${name}-${SHOT}.png`;

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
  // Sim time only advances through runDays below, so screenshots catch the moment we stopped at.
  await page.evaluate(() => window.__game!.setSpeed(0));
}

async function centerOn(page: Page, x: number, y: number, zoom: number): Promise<void> {
  await page.evaluate(
    ({ x, y, tileSize }) => {
      window.__game?.camera.setCenter((x + 0.5) * tileSize, (y + 0.5) * tileSize);
    },
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

async function build(page: Page, tiles: P[], double = false): Promise<void> {
  const r = await page.evaluate(
    ({ tiles, double }) => {
      const w = window.__game!.getMap().width;
      const path = tiles.map(({ x, y }) => y * w + x);
      const b = window.__game!.buildTrackPath(path);
      if (!b.ok) return b;
      return double ? window.__game!.upgradeTrackPath(path) : b;
    },
    { tiles, double },
  );
  if (!r.ok) throw new Error(`build failed: ${r.reason}`);
}

async function station(page: Page, x: number, y: number): Promise<number> {
  return page.evaluate(
    ({ x, y }) => {
      const w = window.__game!.getMap().width;
      const r = window.__game!.buildStation(y * w + x, "terminal");
      if (!r.ok) throw new Error(`station failed: ${r.reason}`);
      const st = (
        window.__game!.getState() as unknown as {
          stations: Array<{ id: number; tile: number; hasEngineShed: boolean }>;
        }
      ).stations.find((s) => s.tile === y * w + x)!;
      st.hasEngineShed = true;
      return st.id;
    },
    { x, y },
  );
}

async function train(page: Page, at: number, to: number, cars: string[]): Promise<number> {
  return page.evaluate(
    ({ at, to, cars }) => {
      const b = window.__game!.buyTrain(at, "american-4-4-0", cars);
      if (!b.ok || b.trainId === undefined) throw new Error(`buy failed: ${b.reason}`);
      const r = window.__game!.setOrders(b.trainId, [
        { stationId: at, rule: "passThrough" },
        { stationId: to, rule: "passThrough" },
      ]);
      if (!r.ok) throw new Error(`orders failed: ${r.reason}`);
      return b.trainId;
    },
    { at, to, cars },
  );
}

const range = (n: number, f: (i: number) => P): P[] => Array.from({ length: n }, (_, i) => f(i));

/** Runs the sim in small steps until some train is halted at a crossing; returns its id. */
async function runUntilWaiting(page: Page): Promise<number> {
  for (let i = 0; i < 400; i++) {
    await page.evaluate(() => window.__game!.runDays(0.25));
    const id = await page.evaluate(
      () => window.__game!.getTrains().find((t) => t.waitingAtCrossing)?.id ?? -1,
    );
    if (id >= 0) return id;
  }
  throw new Error("no train ever waited at the crossing");
}

test.describe("Phase 25A — crossings", () => {
  test("diamond crossings: orthogonal, diagonal × orthogonal, diagonal × diagonal", async ({
    page,
  }) => {
    await setup(page);
    await clearArea(page, 50, 100, 20, 45);
    await build(
      page,
      range(13, (i) => ({ x: 56 + i, y: 30 })),
    );
    await build(
      page,
      range(13, (i) => ({ x: 62, y: 24 + i })),
    );
    await build(
      page,
      range(11, (i) => ({ x: 70 + i, y: 24 + i })),
    );
    await build(
      page,
      range(11, (i) => ({ x: 70 + i, y: 29 })),
    );
    await build(
      page,
      range(13, (i) => ({ x: 84 + i, y: 24 + i })),
    );
    await build(
      page,
      range(13, (i) => ({ x: 96 - i, y: 24 + i })),
    );
    for (const z of [3, 2]) {
      await centerOn(page, 62, 30, z);
      await page.screenshot({ path: shot(`crossing-orthogonal-z${z}`) });
      await centerOn(page, 75, 29, z);
      await page.screenshot({ path: shot(`crossing-diagonal-orthogonal-z${z}`) });
      await centerOn(page, 90, 30, z);
      await page.screenshot({ path: shot(`crossing-diagonal-diagonal-z${z}`) });
    }
  });

  test("two trains reach an X crossing together: one waits, none overlap", async ({ page }) => {
    await setup(page);
    await clearArea(page, 50, 80, 20, 50);
    await build(
      page,
      range(21, (i) => ({ x: 55 + i, y: 35 })),
    );
    await build(
      page,
      range(21, (i) => ({ x: 65, y: 25 + i })),
    );
    const w = await station(page, 55, 35);
    const e = await station(page, 75, 35);
    const n = await station(page, 65, 25);
    const s = await station(page, 65, 45);
    const a = await train(page, w, e, ["coal", "coal"]);
    const b = await train(page, n, s, ["coal", "coal"]);
    const waiting = await runUntilWaiting(page);
    expect([a, b]).toContain(waiting);
    await centerOn(page, 65, 35, 2);
    await page.screenshot({ path: shot("x-crossing-one-waiting-z2") });
    await page.evaluate((id) => window.__game!.debugOpenTrain(id), waiting);
    await page.waitForTimeout(300);
    await page.screenshot({ path: shot("x-crossing-waiting-panel") });
    await expect(page.getByText(/Waiting at crossing for/)).toBeVisible();
  });

  test("junction off double track: a branch train waits for the main-line train", async ({
    page,
  }) => {
    await setup(page);
    await clearArea(page, 50, 80, 50, 80);
    await build(
      page,
      range(25, (i) => ({ x: 55 + i, y: 65 })),
      true,
    );
    await build(page, [
      { x: 60, y: 60 },
      { x: 61, y: 61 },
      { x: 62, y: 62 },
      { x: 63, y: 63 },
      { x: 64, y: 64 },
      { x: 65, y: 65 },
    ]);
    const w = await station(page, 55, 65);
    const e = await station(page, 79, 65);
    const br = await station(page, 60, 60);
    await train(page, w, e, ["coal", "coal"]);
    await train(page, br, e, ["coal", "coal"]);
    await runUntilWaiting(page);
    await centerOn(page, 65, 65, 2);
    await page.screenshot({ path: shot("junction-double-one-waiting-z2") });
  });
});

test.describe("Phase 25A — delivery labels", () => {
  test("a mixed train (3 grain + 2 mail) unloading shows exactly two labels", async ({ page }) => {
    await setup(page);
    await clearArea(page, 50, 90, 20, 50);
    await build(
      page,
      range(31, (i) => ({ x: 55 + i, y: 35 })),
    );
    const a = await station(page, 55, 35);
    const b = await station(page, 85, 35);
    await train(page, a, b, ["grain", "grain", "grain", "mail", "mail"]);
    await page.evaluate(
      ({ a, b }) => {
        const state = window.__game!.getState() as unknown as {
          ticks: number;
          trains: Array<{
            cars: Array<{
              cargoType: string;
              loadedUnits: number;
              loadedTile?: number;
              loadedTick?: number;
            }>;
            orders: Array<{ stationId: number; rule: string }>;
          }>;
          stations: Array<{ id: number; tile: number }>;
          stationEconomy: Map<number, { accepts: string[] }>;
        };
        const from = state.stations.find((s) => s.id === a)!;
        const caps: Record<string, number> = { grain: 20, mail: 12 };
        const t = state.trains[0]!;
        for (const car of t.cars) {
          car.loadedUnits = caps[car.cargoType] ?? 10;
          car.loadedTile = from.tile;
          car.loadedTick = state.ticks - 24 * 12;
        }
        state.stationEconomy.get(b)!.accepts = ["grain", "mail"];
        t.orders.forEach((o) => (o.rule = "auto"));
      },
      { a, b },
    );
    let labels: Array<{ text: string }> = [];
    for (let i = 0; i < 300 && labels.length === 0; i++) {
      await page.evaluate(() => window.__game!.runDays(0.25));
      labels = await page.evaluate(() => window.__game!.getFloatingLabels());
    }
    expect(labels.map((l) => l.text)).toHaveLength(2);
    const st = await page.evaluate(
      (id) => window.__game!.getStations().find((s) => s.id === id)!,
      b,
    );
    await centerOn(page, st.x, st.y, 2);
    await page.waitForTimeout(400);
    await page.screenshot({ path: shot("delivery-labels-per-cargo") });
  });
});

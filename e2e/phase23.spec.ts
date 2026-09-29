import { expect, test, type Page } from "@playwright/test";
import "./gameWindow";

/** Phase 23A (5 km/tile world): screenshots + perf report. */
const PHONE_VIEWPORT = { width: 800, height: 360 };
const TILE_SIZE = 32;

async function open(page: Page): Promise<void> {
  await page.setViewportSize(PHONE_VIEWPORT);
  await page.goto("/?debug=1");
  await page.waitForFunction(() => window.__game !== undefined);
}

async function view(page: Page, x: number, y: number, zoom: number): Promise<void> {
  await page.evaluate(
    ({ x, y, t }) => window.__game!.camera.setCenter((x + 0.5) * t, (y + 0.5) * t),
    { x, y, t: TILE_SIZE },
  );
  await page.evaluate((z) => window.__game!.camera.setZoom(z), zoom);
  await page.waitForTimeout(700);
}

test.describe("Phase 23A — world scale", () => {
  test("Trieste–Ljubljana overview, line with a train, random map, coastline", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await open(page);
    const t0 = Date.now();
    await page.evaluate(() =>
      window.__game!.regenerate({ seed: 1, region: "central-eu", startYear: 1848 }),
    );
    console.log(`[perf] region load ${Date.now() - t0} ms`);
    await page.evaluate(() => window.__game!.setSpeed(0));
    await page.evaluate(() => window.__game!.debugSetCash(2_000_000));

    const cities = await page.evaluate(() => window.__game!.getCities());
    const map = await page.evaluate(() => window.__game!.getMap());
    const centerOf = async (id: number): Promise<{ x: number; y: number }> => {
      const c = await page.evaluate((i) => window.__game!.getCityWorldCenter(i), id);
      return { x: Math.round(c!.x / TILE_SIZE - 0.5), y: Math.round(c!.y / TILE_SIZE - 0.5) };
    };
    const trieste = await centerOf(cities.find((c) => c.name === "Trieste")!.id);
    const ljubljana = await centerOf(cities.find((c) => c.name === "Ljubljana")!.id);
    const mid = { x: (trieste.x + ljubljana.x) / 2, y: (trieste.y + ljubljana.y) / 2 };

    await view(page, mid.x, mid.y, 0.5);
    await page.screenshot({ path: "docs/screenshots/phase-23-central-eu-overview.png" });

    // A line between the two cities: diagonal, then straight.
    const path: number[] = [];
    let { x, y } = trieste;
    path.push(y * map.width + x);
    while (x !== ljubljana.x || y !== ljubljana.y) {
      x += Math.sign(ljubljana.x - x);
      y += Math.sign(ljubljana.y - y);
      path.push(y * map.width + x);
    }
    const built = await page.evaluate((p) => window.__game!.buildTrackPath(p), path);
    console.log(`[line] built=${JSON.stringify(built)} length=${path.length} tiles`);
    if (built.ok) {
      const a = await page.evaluate((t) => window.__game!.buildStation(t, "station"), path[0]!);
      const b = await page.evaluate(
        (t) => window.__game!.buildStation(t, "station"),
        path[path.length - 1]!,
      );
      expect(a.ok && b.ok).toBe(true);
      const stations = await page.evaluate(() => window.__game!.getStations());
      const bought = await page.evaluate(
        (id) => window.__game!.buyTrain(id, "american-4-4-0", ["passengers", "passengers"]),
        stations[0]!.id,
      );
      console.log(`[train] ${JSON.stringify(bought)}`);
      if (bought.ok) {
        await page.evaluate(
          ([tid, s0, s1]) =>
            window.__game!.setOrders(tid as number, [
              { stationId: s0 as number, rule: "auto" },
              { stationId: s1 as number, rule: "auto" },
            ]),
          [bought.trainId, stations[0]!.id, stations[1]!.id],
        );
        await page.evaluate(() => window.__game!.runDays(3));
      }
    }
    await view(page, mid.x, mid.y, 1);
    await page.screenshot({ path: "docs/screenshots/phase-23-central-eu-line-zoom1.png" });

    // Random medium map overview.
    const t1 = Date.now();
    await page.evaluate(() =>
      window.__game!.regenerate({
        seed: 4242,
        size: "medium",
        waterLevel: "high",
        roughness: "normal",
      }),
    );
    console.log(`[perf] random medium generate ${Date.now() - t1} ms`);
    await page.evaluate(() => window.__game!.setSpeed(0));
    const rm = await page.evaluate(() => window.__game!.getMap());
    expect(rm.width).toBe(256);
    await view(page, rm.width / 2, rm.height / 2, 0.5);
    await page.screenshot({ path: "docs/screenshots/phase-23-random-medium-overview.png" });
    console.log(
      `[perf] random overview avgRenderMs ${await page.evaluate(() => window.__game!.getAvgRenderMs())}`,
    );

    // Coastline close-up at zoom 2 (Trieste on the Adriatic).
    await page.evaluate(() => window.__game!.regenerate({ seed: 1, region: "central-eu" }));
    await page.evaluate(() => window.__game!.setSpeed(0));
    await view(page, trieste.x, trieste.y + 3, 2);
    await page.screenshot({ path: "docs/screenshots/phase-23-coastline-zoom2.png" });
    console.log(
      `[perf] zoom2 avgRenderMs ${await page.evaluate(() => window.__game!.getAvgRenderMs())}`,
    );

    expect(errors).toEqual([]);
  });
});

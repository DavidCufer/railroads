import { expect, test, type Page } from "@playwright/test";
import "./gameWindow";

/** Phase 58: one train-length scale, so the big freight engines haul real-length trains; a 40-car coal train climbs a hill
 * line, a 60-car train draws and runs at frame rate, and a small engine still runs a short local. */
test.use({ deviceScaleFactor: 2 });

interface MapArrays {
  terrain: Uint8Array;
  elevation: Uint8Array;
  riverNext: Int32Array;
  riverFlow: Uint16Array;
  industryId: Int16Array;
  cityId: Int16Array;
}

interface TrainState {
  id: number;
  cars: Array<{ cargoType: string; loadedUnits: number; loadedTile?: number; loadedTick?: number }>;
}

async function newGame(page: Page, startYear: number, width = 1000, height = 520): Promise<void> {
  await page.setViewportSize({ width, height });
  await page.goto("/?debug=1");
  await page.waitForFunction(() => window.__game !== undefined);
  await page.evaluate(
    (year) => window.__game?.regenerate({ seed: 1, region: "central-eu", startYear: year }),
    startYear,
  );
  await page.evaluate(() => window.__game!.setSpeed(0));
}

/** A straight line of plain track at row `y`, tiles `x0..x1`, cleared of terrain features. Returns the tiles. */
async function flatLine(page: Page, x0: number, x1: number, y: number): Promise<number[]> {
  return page.evaluate(
    ({ x0, x1, y }) => {
      const g = window.__game!;
      const map = g.getMap();
      const m = map as unknown as MapArrays;
      const tiles: number[] = [];
      for (let row = y - 3; row <= y + 3; row++)
        for (let x = x0 - 3; x <= x1 + 3; x++) {
          const i = row * map.width + x;
          m.terrain[i] = 0;
          m.elevation[i] = 0;
          m.riverNext[i] = -1;
          m.riverFlow[i] = 0;
          m.industryId[i] = -1;
          m.cityId[i] = -1;
        }
      for (let x = x0; x <= x1; x++) tiles.push(y * map.width + x);
      g.debugSetCash(500_000_000);
      if (!g.buildTrackPath(tiles).ok) throw new Error("track");
      return tiles;
    },
    { x0, x1, y },
  );
}

test("1945: the Buy Train list gives each engine its real-length train (Articulated 60 cars, Planet 6)", async ({
  page,
}) => {
  await newGame(page, 1945, 800, 640);
  const tiles = await flatLine(page, 30, 40, 120);
  const stationId = await page.evaluate((t) => {
    const g = window.__game!;
    g.buildStation(t[0]!, "station");
    return g.getStations()[0]!.id;
  }, tiles);
  await page.evaluate((id) => window.__game!.debugOpenStation(id), stationId);
  await page.getByRole("button", { name: "Buy Train" }).click();
  await page.getByTestId("engine-articulated-4-8-8-4").click();
  // the spec sheet's "Max cars" row
  const cars = page.getByTitle("Max cars").first();
  await expect(cars).toBeVisible();
  await expect(cars).toContainText("60");
  await page.screenshot({ path: "docs/screenshots/phase-58-buy-list.png" });
  await page.getByTestId("engine-mikado-2-8-2").click();
  await expect(page.getByTitle("Max cars").first()).toContainText("35");
  await page.getByTestId("engine-planet-2-2-0").click();
  await expect(page.getByTitle("Max cars").first()).toContainText("6");
});

test("a 40-car coal train behind an Articulated climbs a hill line", async ({ page }) => {
  await newGame(page, 1945, 1100, 560);
  const X0 = 30;
  const X1 = 74;
  const Y = 120;
  const ridge = (x: number): number => {
    const dx = x - X0;
    if (dx <= 3) return 2;
    if (dx <= 8) return 2 + (dx - 3);
    if (dx <= 11) return 7;
    return Math.max(0, 7 - Math.floor((dx - 11) / 3));
  };
  const ids = await page.evaluate(
    ({ X0, X1, Y, elev }) => {
      const g = window.__game!;
      const map = g.getMap();
      const m = map as unknown as MapArrays;
      for (let row = Y - 3; row <= Y + 3; row++)
        for (let x = X0 - 3; x <= X1 + 3; x++) {
          const i = row * map.width + x;
          m.terrain[i] = x >= X0 + 2 && x <= X0 + 14 ? 2 : 0; // hills over the ridge
          m.elevation[i] = elev[x - X0 + 3] ?? 0;
          m.riverNext[i] = -1;
          m.riverFlow[i] = 0;
          m.industryId[i] = -1;
          m.cityId[i] = -1;
        }
      g.debugSetCash(500_000_000);
      const path: number[] = [];
      for (let x = X0; x <= X1; x++) path.push(Y * map.width + x);
      if (!g.buildTrackPath(path).ok) throw new Error("track");
      g.debugPlaceIndustry((Y - 1) * map.width + X0, "coalMine");
      g.debugPlaceIndustry((Y - 1) * map.width + X1, "steelMill");
      if (!g.buildStation(path[0]!, "terminal").ok) throw new Error("station a");
      if (!g.buildStation(path[path.length - 1]!, "terminal").ok) throw new Error("station b");
      const [a, b] = [g.getStations()[0]!.id, g.getStations()[1]!.id];
      const bought = g.buyTrain(a, "articulated-4-8-8-4", Array(40).fill("coal"));
      if (!bought.ok) throw new Error(`train ${bought.reason}`);
      // fill the hoppers at the mine (e2e shortcut: a 40-car train waits months for a mine's 60 t a month)
      const train = (g.getState() as { trains: TrainState[] }).trains.find(
        (t) => t.id === bought.trainId,
      )!;
      for (const c of train.cars) {
        c.loadedUnits = 20;
        c.loadedTile = path[0]!;
        c.loadedTick = 0;
      }
      g.setOrders(bought.trainId!, [
        { stationId: a, rule: "auto" },
        { stationId: b, rule: "auto" },
      ]);
      return { trainId: bought.trainId! };
    },
    {
      X0,
      X1,
      Y,
      elev: Array.from({ length: X1 - X0 + 7 }, (_, i) => ridge(i - 3 + X0)),
    },
  );
  // run until the head is over the ridge with the whole train behind it
  const onRidge = await page.evaluate(
    ({ trainId, X0, Y }) => {
      const g = window.__game!;
      for (let step = 0; step < 24 * 200; step++) {
        g.runDays(1 / 24);
        const t = g.getTrains().find((tr) => tr.id === trainId)!;
        if (t.y === Y && t.x >= X0 + 12 && t.x <= X0 + 14 && t.status === "moving")
          return { x: t.x, cars: g.getTrainCars(trainId).length };
      }
      return null;
    },
    { ...ids, X0, Y },
  );
  expect(onRidge).not.toBeNull();
  expect(onRidge!.cars).toBe(40);
  await page.evaluate(
    ({ trainId, Y }) => {
      const g = window.__game!;
      const t = g.getTrains().find((tr) => tr.id === trainId)!;
      g.camera.setZoom(1);
      g.camera.setCenter((t.x + 0.5 - 3) * 32, (Y - 1) * 32);
      g.debugOpenTrain(trainId);
    },
    { ...ids, Y },
  );
  await page.waitForTimeout(1500);
  const render = await page.evaluate(() => window.__game!.getAvgRenderMs());
  console.log(`[perf] 40-car train in view, panel open: avg render ${render.toFixed(2)} ms`);
  await page.screenshot({ path: "docs/screenshots/phase-58-long-coal.png" });
});

test("the longest train (60 cars) costs no more to draw than a 3-car one in the same view", async ({
  page,
}) => {
  const Y = 120;
  const measure = async (cars: number): Promise<number> => {
    await newGame(page, 1945, 1100, 560);
    const tiles = await flatLine(page, 20, 100, Y);
    const trainId = await page.evaluate(
      ({ tiles, cars }) => {
        const g = window.__game!;
        g.buildStation(tiles[0]!, "terminal");
        g.buildStation(tiles[tiles.length - 1]!, "terminal");
        const [a, b] = [g.getStations()[0]!.id, g.getStations()[1]!.id];
        const bought = g.buyTrain(a, "articulated-4-8-8-4", Array(cars).fill("coal"));
        if (!bought.ok) throw new Error(`train ${bought.reason}`);
        g.setOrders(bought.trainId!, [
          { stationId: a, rule: "auto" },
          { stationId: b, rule: "auto" },
        ]);
        return bought.trainId!;
      },
      { tiles, cars },
    );
    await page.evaluate(() => window.__game!.runDays(8));
    await page.evaluate(
      ({ trainId, Y }) => {
        const g = window.__game!;
        const t = g.getTrains().find((tr) => tr.id === trainId)!;
        g.camera.setZoom(1);
        g.camera.setCenter((t.x + 0.5 - 6) * 32, Y * 32);
        g.setSpeed(1);
      },
      { trainId, Y },
    );
    await page.waitForTimeout(3000);
    const m = await page.evaluate(
      (id) => ({
        render: window.__game!.getAvgRenderMs(),
        cars: window.__game!.getTrainCars(id).length,
      }),
      trainId,
    );
    expect(m.cars).toBe(cars);
    return m.render;
  };
  const short = await measure(3);
  const long = await measure(60);
  console.log(`[perf] avg render: 3 cars ${short.toFixed(2)} ms, 60 cars ${long.toFixed(2)} ms`);
  // the same view: the long train adds a sprite per car, which must stay small beside the map itself
  expect(long).toBeLessThan(short * 1.5 + 3);
});

test("a short local: a Planet with three coaches runs between two towns' stations", async ({
  page,
}) => {
  await newGame(page, 1840, 900, 520);
  const Y = 120;
  const tiles = await flatLine(page, 30, 42, Y);
  const trainId = await page.evaluate(
    ({ tiles }) => {
      const g = window.__game!;
      g.debugSetCash(2_000_000);
      g.buildStation(tiles[0]!, "station");
      g.buildStation(tiles[tiles.length - 1]!, "station");
      const [a, b] = [g.getStations()[0]!.id, g.getStations()[1]!.id];
      const bought = g.buyTrain(a, "planet-2-2-0", ["passengers", "passengers", "passengers"]);
      if (!bought.ok) throw new Error(`train ${bought.reason}`);
      g.setOrders(bought.trainId!, [
        { stationId: a, rule: "auto" },
        { stationId: b, rule: "auto" },
      ]);
      return bought.trainId!;
    },
    { tiles },
  );
  await page.evaluate(() => window.__game!.runDays(3));
  await page.evaluate(
    ({ trainId, Y }) => {
      const g = window.__game!;
      const t = g.getTrains().find((tr) => tr.id === trainId)!;
      g.camera.setZoom(2);
      g.camera.setCenter((t.x + 0.5) * 32, Y * 32);
      g.debugOpenTrain(trainId);
    },
    { trainId, Y },
  );
  await page.waitForTimeout(400);
  expect(await page.evaluate((id) => window.__game!.getTrainCars(id).length, trainId)).toBe(3);
  await page.screenshot({ path: "docs/screenshots/phase-58-short-local.png" });
});

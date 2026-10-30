import { expect, test, type Page } from "@playwright/test";
import "./gameWindow";

/** Phase 57: the High-Speed Trainset and the Streamliner are priced by their real rating, and a heavy coal train climbs a hill line. */
test.use({ deviceScaleFactor: 2 });

/** "$45k" / "$1.2M" -> dollars. */
function dollars(text: string): number {
  const m = /\$([\d.]+)([kM]?)/.exec(text);
  if (!m) throw new Error(`no price in "${text}"`);
  return Number(m[1]) * (m[2] === "M" ? 1_000_000 : m[2] === "k" ? 1_000 : 1);
}

interface MapArrays {
  terrain: Uint8Array;
  elevation: Uint8Array;
  riverNext: Int32Array;
  riverFlow: Uint16Array;
  industryId: Int16Array;
  cityId: Int16Array;
}

async function openBuyTrain(page: Page, startYear: number): Promise<void> {
  await page.setViewportSize({ width: 800, height: 640 });
  await page.goto("/?debug=1");
  await page.waitForFunction(() => window.__game !== undefined);
  await page.evaluate(
    (year) => window.__game?.regenerate({ seed: 1, region: "central-eu", startYear: year }),
    startYear,
  );
  await page.evaluate(() => window.__game!.setSpeed(0));
  const stationId = await page.evaluate(() => {
    const game = window.__game!;
    const map = game.getMap();
    const m = map as unknown as MapArrays;
    const y = Math.floor(map.height / 2);
    const tiles: number[] = [];
    for (let x = 30; x < 38; x++) {
      const idx = y * map.width + x;
      m.terrain[idx] = 0;
      m.riverNext[idx] = -1;
      m.riverFlow[idx] = 0;
      m.industryId[idx] = -1;
      tiles.push(idx);
    }
    game.debugSetCash(50_000_000);
    game.buildTrackPath(tiles);
    game.buildStation(tiles[0]!, "station");
    return game.getStations()[0]!.id;
  });
  await page.evaluate((id) => window.__game!.debugOpenStation(id), stationId);
  await page.getByRole("button", { name: "Buy Train" }).click();
}

test("1995: the High-Speed Trainset costs its real 8.8 MW, not its game power; the Streamliner its real 2,000 hp", async ({
  page,
}) => {
  await openBuyTrain(page, 1995);
  const inflation = 1 + (1995 - 1830) * 0.012;
  const price = async (id: string): Promise<number> =>
    dollars(await page.getByTestId(`engine-${id}`).innerText());
  // 8,800 kW x $60 = $528k at 1830 prices; the list shows two figures at $1M+, so allow 3 %
  const hst = await price("high-speed-trainset");
  expect(Math.abs(hst - 528_000 * inflation) / (528_000 * inflation)).toBeLessThan(0.03);
  // dearer than the 4.8 MW Modern Electric and the 8 MW Heavy Freight Electric ($480k): rated power, not weight, sets the price
  expect(hst).toBeGreaterThan(await price("heavy-freight-electric"));
  expect(hst).toBeGreaterThan(1.5 * (await price("modern-electric")));
  const streamliner = 120_000 * inflation;
  // the Streamliner is on the list in 1995 (diesel stays buyable); its price is 2,000 hp x $60
  expect(Math.abs((await price("streamliner-diesel")) - streamliner) / streamliner).toBeLessThan(
    0.02,
  );
});

test("a heavy coal train climbs a hill line from a mine to a steel mill", async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 520 });
  await page.goto("/?debug=1");
  await page.waitForFunction(() => window.__game !== undefined);
  await page.evaluate(() =>
    window.__game?.regenerate({ seed: 1, region: "central-eu", startYear: 1945 }),
  );
  await page.evaluate(() => window.__game!.setSpeed(0));
  const X0 = 30;
  const X1 = 58;
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
      g.debugSetCash(50_000_000);
      const path: number[] = [];
      for (let x = X0; x <= X1; x++) path.push(Y * map.width + x);
      if (!g.buildTrackPath(path).ok) throw new Error("track");
      g.debugPlaceIndustry((Y - 1) * map.width + X0, "coalMine");
      g.debugPlaceIndustry((Y - 1) * map.width + X1, "steelMill");
      if (!g.buildStation(path[0]!, "terminal").ok) throw new Error("station a");
      if (!g.buildStation(path[path.length - 1]!, "terminal").ok) throw new Error("station b");
      const [a, b] = [g.getStations()[0]!.id, g.getStations()[1]!.id];
      const bought = g.buyTrain(a, "articulated-4-8-8-4", Array(12).fill("coal"));
      if (!bought.ok) throw new Error(`train ${bought.reason}`);
      g.setOrders(bought.trainId!, [
        { stationId: a, rule: "fullLoad", maxWaitDays: 30 },
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
  // run until the loaded train is on the ridge
  const onRidge = await page.evaluate(
    ({ trainId, X0, Y }) => {
      const g = window.__game!;
      for (let step = 0; step < 24 * 200; step++) {
        g.runDays(1 / 24);
        const t = g.getTrains().find((tr) => tr.id === trainId)!;
        const loaded = g.getTrainCars(trainId).reduce((s, c) => s + c.loadedUnits, 0);
        if (t.y === Y && t.x >= X0 + 4 && t.x <= X0 + 8 && loaded > 100 && t.status === "moving")
          return { loaded, x: t.x };
      }
      return null;
    },
    { ...ids, X0, Y },
  );
  expect(onRidge).not.toBeNull();
  expect(onRidge!.loaded).toBeGreaterThan(100);
  await page.evaluate(
    ({ trainId, Y }) => {
      const g = window.__game!;
      // the train panel covers the right 430 px: put the train in the middle of what is left
      const t = g.getTrains().find((tr) => tr.id === trainId)!;
      g.camera.setZoom(1.5);
      g.camera.setCenter((t.x + 0.5 + 4.2) * 32, (Y - 1) * 32);
      g.debugOpenTrain(trainId);
    },
    { ...ids, X0, Y },
  );
  await page.waitForTimeout(400);
  await page.screenshot({ path: "docs/screenshots/phase-57-coal-climb.png" });
});

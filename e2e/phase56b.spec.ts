import { expect, test, type Page } from "@playwright/test";
import "./gameWindow";

/** Phase 56B: diesels and electrics are priced by installed power, and the spec sheet's upkeep is in the same year's money as its price. */
test.use({ deviceScaleFactor: 2 });

/** "$45k" / "$1.2M" -> dollars. */
function dollars(text: string): number {
  const m = /\$([\d.]+)([kM]?)/.exec(text);
  if (!m) throw new Error(`no price in "${text}"`);
  return Number(m[1]) * (m[2] === "M" ? 1_000_000 : m[2] === "k" ? 1_000 : 1);
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
    const m = map as unknown as {
      terrain: Uint8Array;
      riverNext: Int32Array;
      riverFlow: Uint16Array;
      industryId: Int32Array;
    };
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

test("a Hudson's upkeep in 1945 is its table figure at 1945 prices, next to its price", async ({
  page,
}) => {
  await openBuyTrain(page, 1945);
  await page.getByTestId("engine-hudson-4-6-4").click();
  const row = page.locator(".eng-stats").getByText(/\/yr/).first();
  const shown = dollars(await row.innerText());
  const expected = 25_000 * (1 + (1945 - 1830) * 0.012);
  // formatMoney rounds to three figures
  expect(Math.abs(shown - expected) / expected).toBeLessThan(0.01);
});

test("1960: diesel and electric prices follow installed power, shown with their upkeep at 1960 prices", async ({
  page,
}) => {
  await openBuyTrain(page, 1960);
  const inflation = 1 + (1960 - 1830) * 0.012;
  const price = async (id: string): Promise<number> =>
    dollars(await page.getByTestId(`engine-${id}`).innerText());
  // power 24 x 200 kW x $60 = $288k at 1830 prices; power 16 x 100 hp x $60 = $96k
  const modern = await price("modern-electric");
  const cab = await price("cab-unit-diesel");
  expect(Math.abs(modern - 288_000 * inflation) / (288_000 * inflation)).toBeLessThan(0.02);
  expect(Math.abs(cab - 96_000 * inflation) / (96_000 * inflation)).toBeLessThan(0.02);
  expect(modern).toBeGreaterThan(2 * cab);
  await page.getByTestId("engine-modern-electric").click();
  const running = dollars(await page.locator(".eng-stats").getByText(/\/yr/).first().innerText());
  const expectedRunning = 4_500 * inflation;
  // formatMoney shows whole thousands from $10k
  expect(running).toBe(Math.round(expectedRunning / 1000) * 1000);
  await page.getByTestId("engine-modern-electric").scrollIntoViewIfNeeded();
  await page.screenshot({ path: "docs/screenshots/phase-56b-buy-train.png" });
});

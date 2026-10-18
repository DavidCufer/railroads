import { expect, test, type Page } from "@playwright/test";
import "./gameWindow";

/** Phase 56: an engine's price and upkeep follow its real weight, so the Buy Train list spreads wide. */
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

test("engine prices follow the engine's weight: a Hudson costs five Americans, an Articulated eleven", async ({
  page,
}) => {
  await openBuyTrain(page, 1945);
  const price = async (id: string): Promise<number> =>
    dollars(await page.getByTestId(`engine-${id}`).innerText());
  const grasshopper = await price("grasshopper-0-4-0");
  const american = await price("american-4-4-0");
  const hudson = await price("hudson-4-6-4");
  const articulated = await price("articulated-4-8-8-4");
  expect(grasshopper).toBeLessThan(american / 4);
  expect(hudson / american).toBeGreaterThan(4.5);
  expect(hudson / american).toBeLessThan(5.5);
  expect(articulated / american).toBeGreaterThan(9);
  // upkeep goes with weight too: the spec sheet of a Hudson shows several times an American's yearly running cost
  const running = async (id: string): Promise<number> => {
    await page.getByTestId(`engine-${id}`).click();
    const row = page.locator(".eng-stats").getByText(/\/yr/).first();
    return dollars(await row.innerText());
  };
  const runAmerican = await running("american-4-4-0");
  const runHudson = await running("hudson-4-6-4");
  expect(runHudson / runAmerican).toBeGreaterThan(4);
  await page.getByTestId("engine-hudson-4-6-4").scrollIntoViewIfNeeded();
  await page.screenshot({ path: "docs/screenshots/phase-56-buy-train.png" });
});

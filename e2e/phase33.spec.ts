import { expect, test, type Page } from "@playwright/test";
import "./gameWindow";

/** Phase 33: the steel chain is visible (processor books on the station panel, a warning when no stop accepts a
 * car's cargo) and an illegal connection gets the smallest legal one proposed in green. */
test.use({ deviceScaleFactor: 2 });

const PHONE_VIEWPORT = { width: 800, height: 360 };
const shot = (name: string): string => `docs/screenshots/phase-33-${name}.png`;
type P = [number, number];
const TILE_SIZE = 32;

function seg(a: P, b: P): P[] {
  const out: P[] = [];
  let [x, y] = a;
  while (x !== b[0] || y !== b[1]) {
    out.push([x, y]);
    x += Math.sign(b[0] - x);
    y += Math.sign(b[1] - y);
  }
  out.push(b);
  return out;
}

async function centerOn(page: Page, x: number, y: number, zoom: number): Promise<void> {
  await page.evaluate(
    ({ x, y, tileSize }) =>
      window.__game?.camera.setCenter((x + 0.5) * tileSize, (y + 0.5) * tileSize),
    { x, y, tileSize: TILE_SIZE },
  );
  await page.evaluate((z) => window.__game?.camera.setZoom(z), zoom);
  await page.waitForTimeout(300);
}

async function flatten(page: Page, x0: number, x1: number, y0: number, y1: number): Promise<void> {
  await page.evaluate(
    ({ x0, x1, y0, y1 }) => {
      const map = window.__game!.getMap() as unknown as {
        width: number;
        height: number;
        terrain: Uint8Array;
        riverNext: Int32Array;
        riverFlow: Uint16Array;
      };
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const idx = y * map.width + x;
          map.terrain[idx] = 0;
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
    return window.__game!.buildTrackPath(tiles.map(([x, y]) => y * w + x));
  }, tiles);
  if (!r.ok) throw new Error(`build failed: ${r.reason}`);
}

test.describe("Phase 33", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(PHONE_VIEWPORT);
    await page.goto("/?debug=1");
    await page.waitForFunction(() => window.__game !== undefined);
  });

  test("the steel chain is visible: processor books and the no-acceptor warning", async ({
    page,
  }) => {
    await page.evaluate(() =>
      window.__game?.regenerate({ seed: 1, region: "central-eu", startYear: 1840 }),
    );
    await page.evaluate(() => window.__game!.debugSetCash(5_000_000));
    await page.evaluate(() => window.__game!.setSpeed(0));
    await flatten(page, 148, 192, 200, 250);
    await build(page, [
      ...seg([176, 207], [187, 218]),
      ...seg([187, 219], [187, 233]),
      ...seg([186, 234], [174, 246]),
      ...seg([173, 246], [153, 246]),
    ]);
    const place = (x: number, y: number, type: string): Promise<void> =>
      page.evaluate(
        ({ x, y, type }) => {
          const w = window.__game!.getMap().width;
          const r = window.__game!.buildStation(y * w + x, type);
          if (!r.ok) throw new Error(`station failed: ${r.reason}`);
        },
        { x, y, type },
      );
    await place(176, 207, "depot");
    await place(187, 223, "depot");
    await place(153, 246, "station");
    await place(166, 246, "station"); // Trieste's streets, no Port in reach
    const stations = await page.evaluate(() => window.__game!.getStations());
    expect(stations).toHaveLength(4);
    const ids = stations.map((s) => s.id);
    const bought = await page.evaluate(
      ({ iron }) =>
        window.__game!.buyTrain(iron, "norris-4-2-0", [
          "ironOre",
          "ironOre",
          "coal",
          "coal",
          "steel",
        ]),
      { iron: ids[0]! },
    );
    expect(bought.ok).toBe(true);
    await page.evaluate(
      ({ ids, trainId }) =>
        window.__game!.setOrders(
          trainId,
          ids.map((stationId) => ({ stationId, rule: "auto" })),
        ),
      { ids, trainId: bought.trainId! },
    );
    await page.evaluate(() => window.__game!.runDays(300));

    await centerOn(page, 160, 246, 1.2);
    await page.evaluate((id) => window.__game!.debugOpenStation(id), ids[2]!);
    await page.waitForTimeout(400);
    await expect(page.locator(".processing-row").first()).toContainText(
      /Received .*(last month|months ago)/,
    );
    await page.screenshot({ path: shot("processing-books") });

    await page.evaluate((id) => window.__game!.debugOpenTrain(id), bought.trainId!);
    await page.waitForTimeout(400);
    await page.locator(".warn-fold-toggle").click();
    await expect(page.locator(".cargo-gap-line").first()).toContainText("Steel");
    await page.screenshot({ path: shot("steel-no-acceptor") });
  });

  test("an illegal connection gets the smallest legal one, drawn green, one tap builds it", async ({
    page,
  }) => {
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
    const X = 64;
    const Y = 140;
    await flatten(page, X - 14, X + 14, Y - 6, Y + 18);
    await build(page, seg([X - 12, Y], [X + 12, Y]));
    await build(page, seg([X, Y], [X + 5, Y + 5]));
    await centerOn(page, X + 2, Y + 4, 1.0);
    await page.getByRole("button", { name: "Track", exact: true }).click();

    const edgesBefore = (await page.evaluate(() => window.__game!.getTrackEdges())).length;
    const p1 = await page.evaluate(({ x, y }) => window.__game!.tileScreenPoint(x, y), {
      x: X + 1,
      y: Y,
    });
    const p2 = await page.evaluate(({ x, y }) => window.__game!.tileScreenPoint(x, y), {
      x: X + 1,
      y: Y + 9,
    });
    await page.mouse.move(p1.x, p1.y);
    await page.mouse.down();
    await page.mouse.move(p2.x, p2.y, { steps: 8 });
    await page.waitForTimeout(100);
    await page.screenshot({ path: shot("illegal-drag-red") });
    await page.mouse.up();
    await page.waitForTimeout(200);
    await expect(page.locator(".confirm-bar-title")).toContainText("Smallest legal connection");
    await page.screenshot({ path: shot("suggested-green") });
    await page.locator(".confirm-bar-build").click();
    await page.waitForTimeout(200);
    const edgesAfter = (await page.evaluate(() => window.__game!.getTrackEdges())).length;
    expect(edgesAfter).toBeGreaterThan(edgesBefore);
    await page.screenshot({ path: shot("suggested-built") });
  });
});

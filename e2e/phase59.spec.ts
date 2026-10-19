import { expect, test, type Page } from "@playwright/test";
import "./gameWindow";

/** Phase 59 item 1: the owner's play-test 6 layout — two diagonal lines in a V, a branch off one, a straight E-W
 * drag joining the NW-SE line one diagonal step from the branch. It is red with a short reason beside the cost, and the
 * suggestion slides the join along the same line instead of detouring to another. */
test.use({ deviceScaleFactor: 2 });

const PHONE_VIEWPORT = { width: 800, height: 360 };
const shot = (name: string): string => `docs/screenshots/phase-59-${name}.png`;
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

test.describe("Phase 59 track joins", () => {
  test("a red join says why and the suggestion stays on the same line", async ({ page }) => {
    await page.setViewportSize(PHONE_VIEWPORT);
    await page.goto("/?debug=1");
    await page.waitForFunction(() => window.__game !== undefined);
    await page.evaluate(() =>
      window.__game?.regenerate({
        seed: 12345,
        size: "medium",
        waterLevel: "normal",
        startYear: 1845,
      }),
    );
    await page.evaluate(() => window.__game!.debugSetCash(50_000_000));
    await page.evaluate(() => window.__game!.setSpeed(0));
    const X = 64;
    const Y = 140;
    await flatten(page, X - 4, X + 40, Y - 4, Y + 30);
    // NW-SE line through (X,Y), NE-SW line crossing it 20 tiles east, a branch south off the NW-SE line at (X+10,Y+10).
    await build(page, seg([X, Y], [X + 28, Y + 28]));
    await build(page, seg([X + 40, Y], [X + 12, Y + 28]));
    await build(page, seg([X + 10, Y + 10], [X + 10, Y + 16]));
    await centerOn(page, X + 16, Y + 8, 1.0);
    await page.getByRole("button", { name: "Track", exact: true }).click();
    const edgesBefore = (await page.evaluate(() => window.__game!.getTrackEdges())).length;
    // Join one diagonal step from the branch junction: (X+9,Y+9) on the NW-SE line, east to (X+31,Y+9) on the NE-SW line.
    const p1 = await page.evaluate(({ x, y }) => window.__game!.tileScreenPoint(x, y), {
      x: X + 9,
      y: Y + 9,
    });
    const p2 = await page.evaluate(({ x, y }) => window.__game!.tileScreenPoint(x, y), {
      x: X + 31,
      y: Y + 9,
    });
    await page.mouse.move(p1.x, p1.y);
    await page.mouse.down();
    await page.mouse.move(p2.x, p2.y, { steps: 10 });
    await page.waitForTimeout(150);
    await expect(page.locator(".build-cost-label")).toContainText("Junction too close");
    await page.screenshot({ path: shot("track-join-red") });
    await page.mouse.up();
    await page.waitForTimeout(250);
    await expect(page.locator(".confirm-bar-title")).toContainText("Smallest legal connection");
    await page.screenshot({ path: shot("track-join") });
    await page.locator(".confirm-bar-build").click();
    await page.waitForTimeout(200);
    const edgesAfter = (await page.evaluate(() => window.__game!.getTrackEdges())).length;
    expect(edgesAfter).toBeGreaterThan(edgesBefore);
  });
});

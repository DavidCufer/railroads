import { test, type Page } from "@playwright/test";
import "./gameWindow";

/** Phase 25B screenshots: zoomed-out markers, minimap terrain, smooth borders and water. */
test.use({ deviceScaleFactor: 1 });
const PREFIX = process.env["SHOT_PREFIX"] ?? "phase-25b";
const TILE = 32;

async function open(page: Page, opts: Record<string, unknown>): Promise<void> {
  await page.setViewportSize({ width: 800, height: 360 });
  await page.goto("/?debug=1");
  await page.waitForFunction(() => window.__game !== undefined);
  await page.evaluate((o) => window.__game?.regenerate(o as never), opts);
}

async function shot(page: Page, x: number, y: number, zoom: number, name: string): Promise<void> {
  await page.evaluate(
    ({ x, y }) => window.__game?.camera.setCenter((x + 0.5) * 32, (y + 0.5) * 32),
    { x, y },
  );
  await page.evaluate((z) => window.__game?.camera.setZoom(z), zoom);
  await page.waitForTimeout(600);
  await page.screenshot({ path: `docs/screenshots/${PREFIX}-${name}.png` });
}

test("central europe around Ljubljana", async ({ page }) => {
  await open(page, { seed: 1, region: "central-eu" });
  const c = await page.evaluate(() => window.__game!.getCities().map((c) => c.name));
  const at = await page.evaluate(() => {
    const city = window.__game!.getCities().find((c) => c.name === "Ljubljana");
    const p = city ? window.__game!.getCityWorldCenter(city.id) : null;
    return p;
  });
  console.log(c.slice(0, 40).join(","), JSON.stringify(at));
  const cx = at ? at.x / TILE : 70;
  const cy = at ? at.y / TILE : 70;
  for (const z of [0.35, 0.6, 1]) await shot(page, cx, cy, z, `ljubljana-z${z}`);
  await shot(page, cx, cy, 0.5, "ljubljana-z0.5");
});

test("random map", async ({ page }) => {
  await open(page, { seed: 777, size: "medium", waterLevel: "normal", startYear: 1848 });
  const [w, h] = await page.evaluate(() => [
    window.__game!.getMap().width,
    window.__game!.getMap().height,
  ]);
  for (const z of [0.35, 0.6, 1]) await shot(page, w / 2, h / 2, z, `random-z${z}`);
});

test.describe("minimap", () => {
  test.use({ deviceScaleFactor: 3 });
  test("minimap close-ups", async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 360 });
    for (const [name, opts] of [
      ["central-eu", { seed: 1, region: "central-eu" }],
      ["random", { seed: 777, size: "medium", waterLevel: "normal", startYear: 1848 }],
    ] as const) {
      await page.goto("/?debug=1");
      await page.waitForFunction(() => window.__game !== undefined);
      await page.evaluate((o) => window.__game?.regenerate(o as never), opts);
      // Hide the debug controls that sit over the minimap.
      await page.evaluate(() => {
        document.querySelector<HTMLElement>("#debug-overlay")?.style.setProperty("display", "none");
        document.querySelector("select")?.parentElement?.style.setProperty("display", "none");
      });
      await page.waitForTimeout(700);
      await page.screenshot({
        path: `docs/screenshots/${PREFIX}-minimap-${name}.png`,
        clip: { x: 60, y: 200, width: 150, height: 160 },
      });
    }
  });
});

import { expect, test } from "@playwright/test";
import "./gameWindow";

test.describe("Phase 1 — map rendering", () => {
  test("renders the terrain at zoom 1, 0.5 and 0.25 for seed 12345", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("pageerror", (err) => consoleErrors.push(err.message));

    await page.goto("/?debug=1");
    await page.waitForFunction(() => window.__game !== undefined);

    await page.evaluate(() => {
      window.__game?.regenerate({
        seed: 12345,
        size: "medium",
        waterLevel: "normal",
        roughness: "normal",
      });
    });

    for (const zoom of [1, 0.5, 0.25]) {
      await page.evaluate((z) => window.__game?.camera.setZoom(z), zoom);
      await page.waitForTimeout(350); // let the newly-visible chunks finish rasterizing
      await expect
        .poll(() => page.evaluate((z) => window.__game?.camera.getZoom() === z, zoom))
        .toBe(true);
      await page.screenshot({ path: `docs/screenshots/phase-1-zoom-${zoom}.png` });
    }

    expect(consoleErrors).toEqual([]);
  });

  test("closeup on a river mouth at zoom 2 (Phase 1.1 review)", async ({ page }) => {
    await page.goto("/?debug=1");
    await page.waitForFunction(() => window.__game !== undefined);

    await page.evaluate(() => {
      window.__game?.regenerate({
        seed: 12345,
        size: "medium",
        waterLevel: "normal",
        roughness: "normal",
      });
    });

    const mouth = await page.evaluate(() => window.__game?.findRiverMouth() ?? null);
    expect(mouth).not.toBeNull();
    if (!mouth) throw new Error("unreachable");

    await page.evaluate((m) => window.__game?.camera.setCenter(m.x, m.y), mouth);
    await page.evaluate(() => window.__game?.camera.setZoom(2));
    await page.waitForTimeout(350);
    await page.screenshot({ path: "docs/screenshots/phase-1.1-closeup-zoom2.png" });
  });

  test("60 fps pan/zoom target on a Large map in desktop Chromium", async ({ page }) => {
    await page.goto("/?debug=1");
    await page.waitForFunction(() => window.__game !== undefined);

    await page.evaluate(() => {
      window.__game?.regenerate({
        seed: 999,
        size: "large",
        waterLevel: "normal",
        roughness: "mountainous",
      });
    });
    const TILE_SIZE = 32; // matches src/render/camera.ts TILE_SIZE
    const box = { x: 200, y: 200, width: 800, height: 500 };
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);

    const start = Date.now();
    let i = 0;
    while (Date.now() - start < 1800) {
      if (i % 4 === 0) {
        // Jump to a fresh, unexplored area of the map so the render-budget path (cold chunk
        // rasterization) is exercised too, not just already-cached steady-state redraws.
        await page.evaluate(
          ({ seedOffset, tileSize }) => {
            const map = window.__game?.getMap();
            if (!map) return;
            const x = ((seedOffset * 977) % map.width) * tileSize;
            const y = ((seedOffset * 613) % map.height) * tileSize;
            window.__game?.camera.setCenter(x, y);
          },
          { seedOffset: i, tileSize: TILE_SIZE },
        );
      }
      const direction = i % 2 === 0 ? 1 : -1;
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 + 150 * direction, box.y + box.height / 2, {
        steps: 6,
      });
      await page.mouse.up();
      await page.mouse.wheel(0, direction * 60);
      i++;
    }

    // getAvgRenderMs is the CPU time inside the draw call itself, not the full rAF interval —
    // headless Chromium's rAF is vsync-capped at ~16.67ms even when idle, so the interval alone
    // can't distinguish a cheap frame from an expensive one.
    const avgRenderMs = await page.evaluate(() => window.__game?.getAvgRenderMs() ?? 0);
    console.log(`Large map pan/zoom average render time: ${avgRenderMs.toFixed(2)}ms`);
    expect(avgRenderMs).toBeLessThan(16);
  });
});

import { expect, test, type Page } from "@playwright/test";
import "./gameWindow";

/** Phone-sized viewport (SPEC §10.1: "~800×360 CSS px") — the drag-to-build UX is the core
 * touch interaction this phase adds, so every screenshot here is taken at that size. */
const PHONE_VIEWPORT = { width: 800, height: 360 };

interface RegenOptions {
  seed: number;
  size?: string;
  waterLevel?: string;
  roughness?: string;
  startYear?: number;
}

async function setup(page: Page, options: RegenOptions): Promise<void> {
  await page.setViewportSize(PHONE_VIEWPORT);
  await page.goto("/?debug=1");
  await page.waitForFunction(() => window.__game !== undefined);
  await page.evaluate((opts) => window.__game?.regenerate(opts), options);
}

async function centerOn(page: Page, x: number, y: number, zoom: number): Promise<void> {
  await page.evaluate(
    ({ x, y }) => {
      const TILE_SIZE = 32;
      window.__game?.camera.setCenter((x + 0.5) * TILE_SIZE, (y + 0.5) * TILE_SIZE);
    },
    { x, y },
  );
  await page.evaluate((z) => window.__game?.camera.setZoom(z), zoom);
  await page.waitForTimeout(300);
}

async function tileScreenPoint(
  page: Page,
  x: number,
  y: number,
): Promise<{ x: number; y: number }> {
  return page.evaluate(({ x, y }) => window.__game!.tileScreenPoint(x, y), { x, y });
}

async function selectTool(page: Page, name: "Track" | "Double" | "Bulldoze"): Promise<void> {
  await page.getByRole("button", { name, exact: true }).click();
}

/** Drags from tile (x1,y1) to (x2,y2) and releases — does not confirm. */
async function dragTo(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
): Promise<void> {
  const p1 = await tileScreenPoint(page, from.x, from.y);
  const p2 = await tileScreenPoint(page, to.x, to.y);
  await page.mouse.move(p1.x, p1.y);
  await page.mouse.down();
  await page.mouse.move(p2.x, p2.y, { steps: 6 });
  await page.waitForTimeout(80);
}

test.describe("Phase 4 — track building", () => {
  test("straight, diagonal and junction track, upgraded to double", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("pageerror", (err) => consoleErrors.push(err.message));

    await setup(page, { seed: 12345, size: "medium", waterLevel: "normal", roughness: "normal" });

    // A hand-picked flat, obstacle-free patch near the map center for seed 12345 (verified by a
    // throwaway search script against the deterministic generator — see PROGRESS.md).
    const ORIGIN = { x: 71, y: 47 };
    await centerOn(page, 73, 47, 1.5);

    const cashStart = await page.evaluate(() => window.__game!.getCash());

    // Straight (horizontal) segment.
    await selectTool(page, "Track");
    await dragTo(page, ORIGIN, { x: ORIGIN.x + 4, y: ORIGIN.y });
    await page.mouse.up();
    await page.waitForTimeout(100);
    await expect(page.locator(".confirm-bar-build")).toBeVisible();
    await page.locator(".confirm-bar-build").click();
    await page.waitForTimeout(100);
    await page.screenshot({ path: "docs/screenshots/phase-4-straight.png" });

    let edges = await page.evaluate(() => window.__game!.getTrackEdges());
    expect(edges.length).toBe(4);
    const cashAfterStraight = await page.evaluate(() => window.__game!.getCash());
    expect(cashAfterStraight).toBeLessThan(cashStart);

    // Diagonal segment continuing from the end of the straight run.
    await selectTool(page, "Track");
    await dragTo(page, { x: ORIGIN.x + 4, y: ORIGIN.y }, { x: ORIGIN.x + 7, y: ORIGIN.y + 3 });
    await page.mouse.up();
    await page.waitForTimeout(100);
    await page.locator(".confirm-bar-build").click();
    await page.waitForTimeout(100);
    await page.screenshot({ path: "docs/screenshots/phase-4-diagonal.png" });

    // Branch off the middle of the straight run, 90° from it, to create a visible junction (and
    // exercise the sharp-turn marker — SPEC §5.1: buildable, just not through-traversable).
    await selectTool(page, "Track");
    await dragTo(page, { x: ORIGIN.x + 2, y: ORIGIN.y }, { x: ORIGIN.x + 2, y: ORIGIN.y + 3 });
    await page.mouse.up();
    await page.waitForTimeout(100);
    await page.locator(".confirm-bar-build").click();
    await page.waitForTimeout(100);
    await page.screenshot({ path: "docs/screenshots/phase-4-junction.png" });

    edges = await page.evaluate(() => window.__game!.getTrackEdges());
    expect(edges.length).toBeGreaterThan(4);
    expect(edges.every((e) => !e.double)).toBe(true);

    // Double mode: upgrade the original straight run.
    await selectTool(page, "Double");
    await dragTo(page, ORIGIN, { x: ORIGIN.x + 4, y: ORIGIN.y });
    await page.mouse.up();
    await page.waitForTimeout(100);
    await expect(page.locator(".confirm-bar-build")).toBeVisible();
    await page.locator(".confirm-bar-build").click();
    await page.waitForTimeout(100);
    await page.screenshot({ path: "docs/screenshots/phase-4-double-track.png" });

    edges = await page.evaluate(() => window.__game!.getTrackEdges());
    const doubled = edges.filter((e) => e.double);
    expect(doubled.length).toBe(4);

    expect(consoleErrors).toEqual([]);
  });

  test("drag preview shows a ghost path and a cost label mid-drag", async ({ page }) => {
    await setup(page, { seed: 12345, size: "medium", waterLevel: "normal", roughness: "normal" });
    await centerOn(page, 73, 47, 1.5);

    await selectTool(page, "Track");
    await dragTo(page, { x: 71, y: 47 }, { x: 75, y: 47 });
    // Still holding the mouse down — this is the live drag preview, not the confirm bar.
    await expect(page.locator(".build-cost-label")).toBeVisible();
    await page.screenshot({ path: "docs/screenshots/phase-4-drag-preview.png" });
    await page.mouse.up();
  });

  test("water bridge auto-picks a valid type across a multi-tile crossing", async ({ page }) => {
    // Stone bridges (the type this crossing needs) unlock in 1840 — the game's own default start
    // year is 1830, so ask for a later start explicitly rather than relying on that default.
    await setup(page, {
      seed: 12345,
      size: "medium",
      waterLevel: "normal",
      roughness: "normal",
      startYear: 1870,
    });
    // A 3-tile-wide water crossing for seed 12345 with no cheaper land detour and no city/
    // industry nearby (found and verified against the real A* pathfinder — see PROGRESS.md).
    const FROM = { x: 58, y: 22 };
    const TO = { x: 54, y: 26 };
    await centerOn(page, 56, 24, 1.5);

    await selectTool(page, "Track");
    await dragTo(page, FROM, TO);
    await page.mouse.up();
    await page.waitForTimeout(100);
    await expect(page.locator(".confirm-bar-bridge")).toBeVisible();
    await page.screenshot({ path: "docs/screenshots/phase-4-water-bridge-confirm.png" });
    await page.locator(".confirm-bar-build").click();
    await page.waitForTimeout(100);
    await page.screenshot({ path: "docs/screenshots/phase-4-water-bridge.png" });

    const edges = await page.evaluate(() => window.__game!.getTrackEdges());
    const bridgeEdge = edges.find((e) => e.bridge !== null);
    expect(bridgeEdge?.bridge).toBe("stone");
  });

  test("each river bridge type, cycled via the confirm bar", async ({ page }) => {
    // Steel bridges need 1870+ (SPEC §5.3); the game's own default start year is 1830, so this
    // test asks for a later start explicitly rather than relying on (or changing) that default.
    await setup(page, {
      seed: 12345,
      size: "medium",
      waterLevel: "normal",
      roughness: "normal",
      startYear: 1870,
    });
    // A single-tile river crossing for seed 12345 with no cheaper land detour and no city/
    // industry nearby (found and verified against the real A* pathfinder — see PROGRESS.md).
    const FROM = { x: 103, y: 21 };
    const TO = { x: 105, y: 23 };
    await centerOn(page, 104, 22, 2);

    const bridgeShots: Array<{ type: string; file: string }> = [
      { type: "wood", file: "docs/screenshots/phase-4-bridge-wood.png" },
      { type: "stone", file: "docs/screenshots/phase-4-bridge-stone.png" },
      { type: "steel", file: "docs/screenshots/phase-4-bridge-steel.png" },
    ];

    for (let i = 0; i < bridgeShots.length; i++) {
      const shot = bridgeShots[i]!;
      await selectTool(page, "Track");
      await dragTo(page, FROM, TO);
      await page.mouse.up();
      await page.waitForTimeout(100);
      await expect(page.locator(".confirm-bar-bridge")).toBeVisible();
      for (let cycle = 0; cycle < i; cycle++) {
        await page.locator(".confirm-bar-bridge").click();
        await page.waitForTimeout(50);
      }
      await expect(page.locator(".confirm-bar-bridge")).toContainText(
        shot.type[0]!.toUpperCase() + shot.type.slice(1),
      );
      await page.locator(".confirm-bar-build").click();
      await page.waitForTimeout(100);
      await page.screenshot({ path: shot.file });

      const edges = await page.evaluate(() => window.__game!.getTrackEdges());
      const bridgeEdge = edges.find((e) => e.bridge !== null);
      expect(bridgeEdge?.bridge).toBe(shot.type);

      // Bulldoze it before building the next type at the same crossing.
      await selectTool(page, "Bulldoze");
      await dragTo(page, FROM, TO);
      await page.mouse.up();
      await page.waitForTimeout(100);
      await page.locator(".confirm-bar-build").click();
      await page.waitForTimeout(100);
    }
  });
});

import { expect, test } from "@playwright/test";
import "./gameWindow";
import { centerOn, clearArea, setup } from "./p30bHelpers";

const PHONE = { width: 800, height: 360 };

test.use({ deviceScaleFactor: 2 });

test.describe("Phase 49 — era makeover", () => {
  test("title screen: cartouche, ticket buttons, animated scene", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.setViewportSize(PHONE);
    await page.goto("/");
    await expect(page.locator(".title-cartouche")).toBeVisible();
    for (const name of ["New Game", "Scenarios", "Load Game", "Achievements", "Settings"]) {
      await expect(page.getByRole("button", { name })).toBeVisible();
    }
    // Everything fits the phone viewport.
    const box = await page.locator(".title-btn-grid").boundingBox();
    expect(box && box.y >= 0 && box.y + box.height <= PHONE.height).toBe(true);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: "docs/screenshots/phase-49-title.png" });
    expect(errors).toEqual([]);
  });

  test("new game, scenarios and achievements screens keep the era look", async ({ page }) => {
    await page.setViewportSize(PHONE);
    await page.goto("/");
    await page.getByRole("button", { name: "New Game" }).click();
    await expect(page.locator(".new-game-screen")).toBeVisible();
    await page.waitForTimeout(300);
    await page.screenshot({ path: "docs/screenshots/phase-49-new-game.png" });
    await page.getByRole("button", { name: "Back" }).click();
    await page.getByRole("button", { name: "Scenarios" }).click();
    await expect(page.locator(".scenario-card").first()).toBeVisible();
    await page.screenshot({ path: "docs/screenshots/phase-49-scenarios.png" });
  });

  test("zooming in and out never shows a blank or half-drawn map", async ({ page }) => {
    // The map is made all land around the camera, so the only way the sea colour can show is a chunk that was
    // not drawn that frame (the zoom flicker: terrain chunks over the per-frame bake budget left holes).
    await setup(page);
    await clearArea(page, 40, 110, 30, 70);
    await centerOn(page, 75, 50, 1);
    await page.evaluate(() => window.__game!.setSpeed(0));
    await page.waitForTimeout(500);

    const result = await page.evaluate(async () => {
      const canvas = document.getElementById("game-canvas") as HTMLCanvasElement;
      const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
      const SEA = [0x2e, 0x5e, 0x8c];
      const points: Array<[number, number]> = [];
      for (let gx = 1; gx < 20; gx++)
        for (let gy = 1; gy < 9; gy++)
          points.push([Math.floor((canvas.width * gx) / 20), Math.floor((canvas.height * gy) / 9)]);
      let frames = 0;
      let worst = 0;
      const orig = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = (cb: FrameRequestCallback): number =>
        orig((t) => {
          cb(t);
          frames++;
          let holes = 0;
          for (const [x, y] of points) {
            const d = ctx.getImageData(x, y, 1, 1).data;
            if (d[0] === SEA[0] && d[1] === SEA[1] && d[2] === SEA[2]) holes++;
          }
          if (holes > worst) worst = holes;
        });
      const game = window.__game!;
      // Rapid back-and-forth pinch at three speeds, sweeping every zoom bucket (0.5, 0.75, 1.4 boundaries).
      for (const periodMs of [350, 900, 2200]) {
        const start = performance.now();
        await new Promise<void>((resolve) => {
          const step = (): void => {
            const k = (performance.now() - start) / periodMs;
            game.camera.setZoom(
              1.25 + 0.75 * Math.sin(k * 2 * Math.PI - Math.PI / 2) * 0.95 - 0.05,
            );
            if (k < 4) orig(step);
            else resolve();
          };
          step();
        });
      }
      window.requestAnimationFrame = orig;
      return { frames, worst };
    });
    expect(result.frames).toBeGreaterThan(60);
    expect(result.worst, "sea-coloured samples seen in a frame over solid land").toBe(0);
  });

  test("engine sheet: every locomotive and a row of cars on print plates", async ({ page }) => {
    await page.setViewportSize({ width: 1000, height: 700 });
    await page.goto("/?debug=1&gallery=1&sheet=1&h=72");
    await page.waitForSelector("#gallery");
    await expect(page.locator("#gallery canvas")).toHaveCount(22 + 8);
    await page.locator("#gallery").screenshot({ path: "docs/screenshots/phase-49-engines.png" });
  });
});

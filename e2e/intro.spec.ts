import { expect, test } from "@playwright/test";

const SIZES = [
  { name: "phone", width: 800, height: 360 },
  { name: "tablet", width: 1280, height: 800 },
];

test.describe("Phase 85/86 — intro: 3D clip, then the crest", () => {
  for (const size of SIZES) {
    test(`first paint, clip mid-way, crest after it, then gone (${size.name})`, async ({
      page,
    }) => {
      const consoleErrors: string[] = [];
      page.on("console", (msg) => {
        if (msg.type() === "error") consoleErrors.push(msg.text());
      });
      page.on("pageerror", (err) => consoleErrors.push(err.message));

      await page.setViewportSize({ width: size.width, height: size.height });
      // introMs keeps the overlay up long enough to take the crest screenshot after the clip (about 4.8 s).
      await page.goto("/?introMs=9000", { waitUntil: "commit" });
      const intro = page.locator("#intro");
      await expect(intro).toBeVisible();
      await expect(intro.locator(".intro-title")).toHaveAttribute("aria-label", "Iron & Steam");
      await page.screenshot({ path: `docs/screenshots/phase-85-intro-${size.name}-first.png` });

      // The clip really plays: a frame mid-way (about 2.4 s into the clip).
      const video = page.locator("#intro-video");
      await expect(video).toHaveClass(/intro-playing/, { timeout: 5000 });
      await page.waitForFunction(
        () => {
          const v = document.getElementById("intro-video") as HTMLVideoElement | null;
          return v !== null && v.currentTime > 2.3 && !v.ended;
        },
        undefined,
        { timeout: 10000 },
      );
      await expect(page.locator("#intro-line")).not.toHaveText("");
      await expect(intro).not.toHaveClass(/intro-crest/);
      await page.screenshot({ path: `docs/screenshots/phase-85-intro-${size.name}-mid.png` });

      // After the clip: the crest.
      await expect(intro).toHaveClass(/intro-crest/, { timeout: 8000 });
      await expect(video).toHaveCSS("opacity", "0", { timeout: 3000 });
      await page.screenshot({ path: `docs/screenshots/phase-86-intro-${size.name}-crest.png` });

      await expect(page.locator(".title-screen")).toBeAttached();
      await expect(intro).toBeHidden({ timeout: 12000 });
      await expect(page.getByRole("button", { name: "New Game" })).toBeVisible();
      expect(consoleErrors).toEqual([]);
    });
  }

  test("a tap skips straight to the crest", async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 360 });
    await page.goto("/?introMs=9000", { waitUntil: "commit" });
    const intro = page.locator("#intro");
    await expect(page.locator("#intro-video")).toHaveClass(/intro-playing/, { timeout: 5000 });
    await expect(intro).not.toHaveClass(/intro-crest/);
    await page.mouse.click(400, 180);
    await expect(intro).toHaveClass(/intro-crest/);
    await expect(page.locator("#intro-video")).toHaveCSS("opacity", "0", { timeout: 3000 });
    await expect(intro).toBeHidden({ timeout: 12000 });
  });

  test("reduced motion shows the crest only (no clip)", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 800, height: 360 });
    await page.goto("/?introMs=2500", { waitUntil: "commit" });
    const intro = page.locator("#intro");
    await expect(intro).toBeVisible();
    await expect(intro).toHaveClass(/intro-crest/);
    await expect(page.locator("#intro-video")).toHaveCount(0);
    await page.screenshot({ path: "docs/screenshots/phase-86-intro-reduced-motion.png" });
    await expect(intro).toBeHidden({ timeout: 8000 });
    await expect(page.getByRole("button", { name: "New Game" })).toBeVisible();
  });

  test("a clip that can't load falls back to the crest at once", async ({ page }) => {
    await page.route("**/intro/arrival.webm", (route) => route.abort());
    await page.setViewportSize({ width: 800, height: 360 });
    await page.goto("/", { waitUntil: "commit" });
    const intro = page.locator("#intro");
    await expect(intro).toHaveClass(/intro-crest/, { timeout: 3000 });
    await expect(intro).toBeHidden({ timeout: 8000 });
    await expect(page.getByRole("button", { name: "New Game" })).toBeVisible();
  });

  test("debug pages have no intro", async ({ page }) => {
    await page.goto("/?debug=1");
    await page.waitForFunction(() => window.__game !== undefined);
    await expect(page.locator("#intro")).toHaveCount(0);
  });
});

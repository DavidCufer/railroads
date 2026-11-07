import { expect, test, type Page } from "@playwright/test";

const SIZES = [
  { name: "phone", width: 800, height: 360 },
  { name: "tablet", width: 1280, height: 800 },
];

/** Waits until the close has reached progress `p` (the `introFreeze` test hook holds it there). */
async function waitClose(page: Page, p: number): Promise<void> {
  await page.waitForFunction(
    (target) => Number(document.getElementById("intro")?.dataset["introP"] ?? "0") >= target,
    p,
    { timeout: 15000 },
  );
}

const endStateChecks = async (page: Page): Promise<void> => {
  const intro = page.locator("#intro");
  await expect(intro).toHaveClass(/intro-crest/);
  await expect(intro).toHaveClass(/intro-still/);
  // The clip is hidden (or gone, under reduced motion); the still shows.
  if ((await page.locator("#intro-video").count()) > 0)
    await expect(page.locator("#intro-video")).toHaveCSS("opacity", "0");
  await expect(page.locator("#intro-still")).toHaveCSS("opacity", "1");
  await expect(page.locator(".intro-frame-img")).toHaveCSS("opacity", "1", { timeout: 2000 });
  await expect(intro).toHaveAttribute("data-intro-p", "1.000");
};

test.describe("Phase 85-88 — intro: the train arrives, the green closes in as a shield, the crest settles", () => {
  for (const size of SIZES) {
    test(`first paint, clip, shield half closed, end state, then gone (${size.name})`, async ({
      page,
    }) => {
      const consoleErrors: string[] = [];
      page.on("console", (msg) => {
        if (msg.type() === "error") consoleErrors.push(msg.text());
      });
      page.on("pageerror", (err) => consoleErrors.push(err.message));

      await page.setViewportSize({ width: size.width, height: size.height });
      await page.goto("/?introMs=14000", { waitUntil: "commit" });
      const intro = page.locator("#intro");
      await expect(intro).toBeVisible();
      await expect(intro.locator(".intro-title")).toHaveAttribute("aria-label", "Iron & Steam");
      await page.screenshot({ path: `docs/screenshots/phase-88-intro-${size.name}-first.png` });

      // The clip really plays: a frame mid-way (about 2.4 s into the clip), no green yet.
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
      await expect(intro).toHaveAttribute("data-intro-phase", "clip");
      await page.screenshot({ path: `docs/screenshots/phase-88-intro-${size.name}-mid-clip.png` });

      // The train has arrived: the green closes in over ~1.2 s, then the crest frame settles.
      await expect(intro).toHaveAttribute("data-intro-phase", "close", { timeout: 8000 });
      await expect(intro).not.toHaveClass(/intro-crest/);
      await waitClose(page, 0.5);
      await page.screenshot({
        path: `docs/screenshots/phase-88-intro-${size.name}-closing-live.png`,
      });
      await expect(intro).toHaveClass(/intro-crest/, { timeout: 4000 });
      await expect(page.locator(".intro-frame-img")).toHaveCSS("opacity", "1", { timeout: 2000 });
      await page.waitForTimeout(1000); // the glint is done
      await page.screenshot({ path: `docs/screenshots/phase-88-intro-${size.name}-end.png` });
      await endStateChecks(page);

      await expect(page.locator(".title-screen")).toBeAttached();
      await expect(intro).toBeHidden({ timeout: 12000 });
      await expect(page.getByRole("button", { name: "New Game" })).toBeVisible();
      expect(consoleErrors).toEqual([]);
    });

    test(`the shield held half closed is centred on the engine (${size.name})`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: size.width, height: size.height });
      await page.goto("/?introFreeze=0.5", { waitUntil: "commit" });
      await expect(page.locator("#intro")).toHaveAttribute("data-intro-phase", "close", {
        timeout: 15000,
      });
      await waitClose(page, 0.5);
      await expect(page.locator("#intro")).not.toHaveClass(/intro-crest/);
      await page.screenshot({ path: `docs/screenshots/phase-88-intro-${size.name}-mid-close.png` });
    });
  }

  test("a tap jumps straight to the end state", async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 360 });
    await page.goto("/?introMs=9000", { waitUntil: "commit" });
    const intro = page.locator("#intro");
    await expect(page.locator("#intro-video")).toHaveClass(/intro-playing/, { timeout: 5000 });
    await expect(intro).not.toHaveClass(/intro-crest/);
    await page.mouse.click(400, 180);
    await endStateChecks(page);
    await expect(intro).toBeHidden({ timeout: 12000 });
  });

  test("reduced motion shows the end state only (no clip)", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 800, height: 360 });
    await page.goto("/?introMs=2500", { waitUntil: "commit" });
    const intro = page.locator("#intro");
    await expect(intro).toBeVisible();
    await expect(page.locator("#intro-video")).toHaveCount(0);
    await endStateChecks(page);
    await page.screenshot({ path: "docs/screenshots/phase-88-intro-reduced-motion.png" });
    await expect(intro).toBeHidden({ timeout: 8000 });
    await expect(page.getByRole("button", { name: "New Game" })).toBeVisible();
  });

  for (const size of SIZES) {
    test(`a clip that can't load shows the end state at once (${size.name})`, async ({ page }) => {
      await page.route("**/intro/arrival.webm", (route) => route.abort());
      await page.setViewportSize({ width: size.width, height: size.height });
      await page.goto("/?introMs=3500", { waitUntil: "commit" });
      const intro = page.locator("#intro");
      await expect(intro).toHaveClass(/intro-crest/, { timeout: 3000 });
      await endStateChecks(page);
      await page.screenshot({ path: `docs/screenshots/phase-88-intro-${size.name}-fallback.png` });
      await expect(intro).toBeHidden({ timeout: 8000 });
      await expect(page.getByRole("button", { name: "New Game" })).toBeVisible();
    });
  }

  test("debug pages have no intro", async ({ page }) => {
    await page.goto("/?debug=1");
    await page.waitForFunction(() => window.__game !== undefined);
    await expect(page.locator("#intro")).toHaveCount(0);
  });
});

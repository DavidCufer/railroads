/**
 * Play Store screenshots (Phase 71): `node tools/store/screenshots.mjs` against a running preview build
 * (npm run build && npm run preview -- --port 4173), after tools/store/make-save.sh. Phone: 960x540 CSS px at DPR 2
 * = 1920x1080; 10" tablet: 1280x800 at DPR 2 = 2560x1600. Real game UI, debug HUD hidden (`debugHud=0`).
 */
import fs from "node:fs";
import path from "node:path";
import { BASE, launch, openBusyGame, root } from "./lib.mjs";

const out = path.join(root, "docs/store/screenshots");
fs.mkdirSync(out, { recursive: true });

const DEVICES = [
  { name: "phone", viewport: { width: 960, height: 540 }, shots: 8 },
  { name: "tablet10", viewport: { width: 1280, height: 800 }, shots: 4 },
];

async function networkView(page, zoom, dx = 0, dy = 0) {
  // The loaded game opens on the middle of the network; keep that centre, change the zoom.
  await page.evaluate(
    ({ zoom, dx, dy }) => {
      const g = window.__game;
      const c = g.camera.getCenter();
      g.camera.setZoom(zoom);
      g.camera.setCenter(c.x + dx * 32, c.y + dy * 32);
    },
    { zoom, dx, dy },
  );
  await page.waitForTimeout(400);
}

async function closePanels(page) {
  for (let i = 0; i < 3; i++) {
    const close = page.locator('.panel-close, button[aria-label="Close"]').first();
    if (await close.count()) await close.click().catch(() => {});
    else break;
  }
}

for (const dev of DEVICES) {
  const browser = await launch();
  const { page } = await openBusyGame(browser, dev.viewport, 2);
  const shot = async (n, name) => {
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(out, `${dev.name}-${n}-${name}.png`) });
    console.log("wrote", dev.name, n, name);
  };
  const want = (n) => n <= dev.shots;

  // 1 — a goal moment: the Gold goal panel the loaded game opens with.
  if (want(7) || dev.name === "phone") {
    await shot(7, "goal-reached");
  }
  await page
    .getByRole("button", { name: "Continue" })
    .click()
    .catch(() => {});
  await page.waitForTimeout(300);

  await networkView(page, Number(process.env.ZOOM ?? 1));
  await page.evaluate(() => window.__game.setSpeed(2));
  await page.waitForTimeout(6000);
  await page.evaluate(() => window.__game.setSpeed(0));
  await page.waitForTimeout(3500); // the floating delivery labels fade
  await shot(1, "busy-network");

  const stationId = await page.evaluate(() => {
    const st = window.__game.getStations().filter((s) => s.hasEngineShed);
    return (st[0] ?? window.__game.getStations()[0]).id;
  });
  await page.evaluate((id) => window.__game.debugOpenStation(id), stationId);
  await shot(2, "station-panel");

  await page.getByRole("button", { name: "Buy Train" }).click();
  await shot(3, "buy-train");
  await page.locator(".wizard-close, .panel-close, button[aria-label='Close']").first().click();
  await page
    .getByRole("button", { name: "Close" })
    .first()
    .click()
    .catch(() => {});
  await closePanels(page);

  // 4 — finance
  await page.locator('button[aria-label*="inance" i]').first().click();
  await shot(4, "finance");

  // 5 — yearly report
  if (dev.name === "phone") {
    await page.getByRole("button", { name: "Yearly Report" }).click();
    await shot(5, "yearly-report");
  }
  await browser.close();

  // 6 — new game screen with the real-world maps (the real title flow, no debug)
  if (dev.name === "phone") {
    const b2 = await launch();
    const ctx = await b2.newContext({ viewport: dev.viewport, deviceScaleFactor: 2 });
    const p2 = await ctx.newPage();
    await p2.goto(`${BASE}/`);
    await p2.getByRole("button", { name: "New Game" }).click();
    await p2.waitForTimeout(600);
    await p2.screenshot({ path: path.join(out, "phone-6-new-game.png") });
    console.log("wrote phone 6 new-game");
    await b2.close();
  }
}

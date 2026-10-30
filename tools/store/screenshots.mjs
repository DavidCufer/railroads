/**
 * Play Store screenshots (Phase 71): `node tools/store/screenshots.mjs` against a running preview build
 * (npm run build && npm run preview -- --port 4173), after tools/store/make-saves.sh (Phase 72: five late-game saves, different eras and maps). Phone: 960x540 CSS px at DPR 2
 * = 1920x1080; 10" tablet: 1280x800 at DPR 2 = 2560x1600. Real game UI, debug HUD hidden (`debugHud=0`).
 */
import fs from "node:fs";
import path from "node:path";
import { BASE, launch, openBusyGame, root } from "./lib.mjs";

const out = path.join(root, "docs/store/screenshots");
fs.mkdirSync(out, { recursive: true });

const DEVICES = [
  { name: "phone", viewport: { width: 960, height: 540 } },
  { name: "tablet10", viewport: { width: 1280, height: 800 } },
];

/** Reading the news clears the unread badge. */
async function clearNews(page) {
  await page.locator(".news-button").click();
  await page.waitForTimeout(300);
  await page
    .locator('.panel-close, button[aria-label="Close"]')
    .first()
    .click()
    .catch(() => {});
  await page.waitForTimeout(300);
}

/** Opens one of the late-game saves, past the goal card, with the news badge cleared. */
async function openSave(browser, dev, save, electric = false) {
  const { page } = await openBusyGame(browser, dev.viewport, 2, "debug=1&debugHud=0", save);
  await page
    .getByRole("button", { name: "Continue" })
    .click()
    .catch(() => {});
  await page.waitForTimeout(300);
  await page.waitForTimeout(300);
  if (electric) await electrify(page);
  return page;
}

/** The 1950 saves run diesels (the bots never buy electrics): electrify the whole network and put four electric
 * trains on the same stops as four of the diesels, so the newest era shows too. */
async function electrify(page) {
  await page.evaluate(() => {
    const g = window.__game;
    g.debugSetCash(20_000_000);
    for (const e of [...g.getState().trackGraph.allEdges()]) g.electrifyTrackPath([e.a, e.b]);
    const donors = g
      .getState()
      .trains.filter((t) => t.orders.length >= 2)
      .slice(0, 4);
    for (const t of donors) {
      const bought = g.buyTrain(t.orders[0].stationId, "modern-electric", [
        "passengers",
        "passengers",
        "passengers",
        "mail",
      ]);
      if (bought.trainId !== undefined)
        g.setOrders(
          bought.trainId,
          t.orders.map((o) => ({ ...o })),
        );
    }
    g.debugSetCash(850_000);
  });
}

/** Runs a little so the trains are on the move and the delivery labels have faded, then frames the moving train
 * that is closest to a station (a town, platforms and a train in one picture) at `zoom`. */
async function frameTrainNearStation(page, zoom, locoPrefix = "") {
  await page.evaluate((fast) => window.__game.setSpeed(fast ? 4 : 2), locoPrefix !== "");
  await page.waitForTimeout(locoPrefix ? 9000 : 5000);
  await page.evaluate(() => window.__game.setSpeed(0));
  // Electrifying 120+ tiles completes a goal: dismiss its card.
  await page
    .getByRole("button", { name: "Continue" })
    .click({ timeout: 1000 })
    .catch(() => {});
  await page.waitForTimeout(3500); // the floating delivery labels fade
  await clearNews(page);
  await page.evaluate(
    ({ zoom, locoPrefix }) => {
      const g = window.__game;
      const stations = g.getStations();
      let best = null;
      for (const t of g.getTrains()) {
        if (t.speed <= 0 || !t.locoModelId.includes(locoPrefix)) continue;
        for (const st of stations) {
          const d = Math.hypot(t.renderX - st.x, t.renderY - st.y);
          if (d > 1.5 && (best === null || d < best.d)) best = { d, t, st };
        }
      }
      const pick = best?.t ?? g.getTrains()[0];
      g.camera.setZoom(zoom);
      g.camera.setCenter(pick.renderX * 32, pick.renderY * 32);
    },
    { zoom, locoPrefix },
  );
  await page.waitForTimeout(500);
}

async function closePanels(page) {
  for (let i = 0; i < 3; i++) {
    const close = page.locator('.panel-close, button[aria-label="Close"]').first();
    if (await close.count()) await close.click().catch(() => {});
    else break;
  }
}

for (const dev of DEVICES) {
  const phone = dev.name === "phone";
  const browser = await launch();
  const shot = async (page, n, name) => {
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(out, `${dev.name}-${n}-${name}.png`) });
    console.log("wrote", dev.name, n, name);
  };

  // The network in three eras and on two maps; the train art is what shows.
  const views = [
    ["busy", "steam-central-europe", false, ""],
    ["busy-useast", "steam-us-east", false, ""],
    ["rich-1950eu", "diesel-central-europe", false, ""],
    ["rich-1950us", "diesel-us-east", false, ""],
    ["rich-1950eu", "electric-central-europe", true, "electric"],
  ];
  const chosen = phone ? views : [views[0], views[4]];
  let n = 0;
  for (const [save, name, electric, locoPrefix] of chosen) {
    const page = await openSave(browser, dev, save, electric);
    await frameTrainNearStation(page, 2, locoPrefix);
    await shot(page, ++n, name);
    await page.context().close();
  }

  // station panel, buy train, finance: from the 1950 save (diesels in the shop)
  const page = await openSave(browser, dev, "rich-1950eu", true);
  await frameTrainNearStation(page, 1.6);
  const stationId = await page.evaluate(() => {
    const st = window.__game.getStations().filter((s) => s.hasEngineShed);
    return (st[0] ?? window.__game.getStations()[0]).id;
  });
  // Put the station in the left third, clear of the panel that opens on the right.
  await page.evaluate((id) => {
    const g = window.__game;
    const st = g.getStations().find((s) => s.id === id);
    const zoom = g.camera.getZoom();
    g.camera.setCenter(st.x * 32 + 32 * 0.5 + (window.innerWidth * 0.2) / zoom, st.y * 32 + 16);
    g.debugOpenStation(id);
  }, stationId);
  await page.waitForTimeout(500);
  await shot(page, ++n, "station-panel");
  await page.getByRole("button", { name: "Buy Train" }).click();
  await shot(page, ++n, "buy-train");
  await page.locator(".wizard-close, .panel-close, button[aria-label='Close']").first().click();
  await closePanels(page);
  if (phone) {
    await page.locator('button[aria-label*="inance" i]').first().click();
    await shot(page, ++n, "finance");
    await page.getByRole("button", { name: "Yearly Report" }).click();
    await shot(page, ++n, "yearly-report");
  }
  await browser.close();

  if (phone) {
    const b2 = await launch();
    const ctx = await b2.newContext({ viewport: dev.viewport, deviceScaleFactor: 2 });
    const p2 = await ctx.newPage();
    await p2.goto(`${BASE}/`);
    await p2.getByRole("button", { name: "New Game" }).click();
    await p2.waitForTimeout(600);
    await p2.screenshot({ path: path.join(out, `phone-${n + 1}-new-game.png`) });
    console.log("wrote phone", n + 1, "new-game");
    await b2.close();
  }
}

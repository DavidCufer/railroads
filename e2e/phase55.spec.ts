import { expect, test, type Page } from "@playwright/test";
import "./gameWindow";
import { addTowns } from "./addTowns";

/** Phase 55: overtaking at a passing loop, the Station / Passing loop choice, Info text that stays, the Main menu row. */
test.use({ deviceScaleFactor: 2 });

async function flatLine(page: Page): Promise<{ tiles: number[]; y: number }> {
  await page.setViewportSize({ width: 800, height: 420 });
  await page.goto("/?debug=1");
  await page.waitForFunction(() => window.__game !== undefined);
  await page.evaluate(() =>
    window.__game?.regenerate({ seed: 1, region: "central-eu", startYear: 1900 }),
  );
  await page.evaluate(() => window.__game!.setSpeed(0));
  return page.evaluate(() => {
    const game = window.__game!;
    const map = game.getMap();
    const m = map as unknown as {
      terrain: Uint8Array;
      riverNext: Int32Array;
      riverFlow: Uint16Array;
      industryId: Int32Array;
    };
    const y = Math.floor(map.height / 2);
    const tiles: number[] = [];
    for (let x = 30; x < 56; x++) {
      const idx = y * map.width + x;
      m.terrain[idx] = 0;
      m.riverNext[idx] = -1;
      m.riverFlow[idx] = 0;
      m.industryId[idx] = -1;
      tiles.push(idx);
    }
    game.debugSetCash(5_000_000);
    if (!game.buildTrackPath(tiles).ok) throw new Error("track");
    for (const t of [tiles[1]!, tiles[24]!])
      if (!game.buildStation(t, "station").ok) throw new Error("station");
    game.camera.setZoom(1.5);
    game.camera.setCenter(43 * 32, (y + 0.5) * 32);
    return { tiles, y };
  });
}

test("the Station tool offers a passing loop; an express passes a local held in it", async ({
  page,
}) => {
  const { tiles, y } = await flatLine(page);
  await page.getByRole("button", { name: "Station", exact: true }).click();
  const loopX = 42;
  const p = await page.evaluate(({ x, y }) => window.__game!.tileScreenPoint(x, y), {
    x: loopX,
    y,
  });
  await page.mouse.click(p.x, p.y);
  const items = page.locator(".chooser-item");
  await expect(items).toHaveCount(2);
  await expect(items.nth(0)).toContainText("Station");
  await expect(items.nth(1)).toContainText("Passing loop");
  await page.screenshot({ path: "docs/screenshots/phase-55-loop-choice.png" });
  await items.nth(1).click();
  await page.locator(".loop-build-btn").click();
  await expect(page.locator(".loop-build-btn")).toHaveCount(0);
  const stations = await page.evaluate(() => window.__game!.getStations().length);
  expect(stations).toBe(3);

  const ids = await page.evaluate(() => {
    const stationsNow = window.__game!.getStations();
    return stationsNow.filter((s) => !s.name.startsWith("Passing")).map((s) => s.id);
  });
  expect(ids).toHaveLength(2);
  const [a, b] = ids as [number, number];
  const trains = await page.evaluate(
    ({ a, b }) => {
      const game = window.__game!;
      const cars = ["passengers", "passengers"];
      const local = game.buyTrain(a, "ten-wheeler-4-6-0", cars);
      if (!local.ok) throw new Error("local");
      game.setOrders(local.trainId!, [
        { stationId: a, rule: "auto" },
        { stationId: b, rule: "auto" },
      ]);
      return local.trainId!;
    },
    { a, b },
  );
  await page.evaluate(() => window.__game!.runDays(2));
  const express = await page.evaluate(
    ({ a, b }) => {
      const game = window.__game!;
      const r = game.buyTrain(a, "atlantic-4-4-2", ["passengers", "passengers"]);
      if (!r.ok) throw new Error("express");
      game.setOrders(r.trainId!, [
        { stationId: a, rule: "auto" },
        { stationId: b, rule: "auto" },
      ]);
      return r.trainId!;
    },
    { a, b },
  );
  let held = false;
  for (let day = 0; day < 20 && !held; day++) {
    await page.evaluate(() => window.__game!.runDays(1));
    held = await page.evaluate((id) => {
      const t = (
        window.__game!.getState() as {
          trains: Array<{ id: number; waitingOn?: { kind: string } }>;
        }
      ).trains.find((x) => x.id === id);
      return t?.waitingOn?.kind === "overtake";
    }, trains);
  }
  expect(held).toBe(true);
  await page.evaluate((id) => window.__game!.debugOpenTrain(id), trains);
  await expect(page.locator(".train-status-text")).toContainText("to pass");
  await page.waitForTimeout(400);
  await page.screenshot({ path: "docs/screenshots/phase-55-overtake.png" });
  // The express goes through; the local follows and nobody is stuck.
  await page.evaluate(() => window.__game!.runDays(25));
  const states = await page.evaluate(() =>
    window.__game!.getTrains().map((t) => ({ id: t.id, status: t.status })),
  );
  for (const t of states) expect(t.status).not.toBe("stuck");
  expect(express).not.toBe(trains);
  expect(tiles.length).toBeGreaterThan(0);
});

test("Info text stays until tapped away, and news cannot push it out", async ({ page }) => {
  await flatLine(page);
  const ids = await page.evaluate(() => window.__game!.getStations().map((s) => s.id));
  await addTowns(page, ids, ["Venice", "Milan"], 40_000);
  await page.evaluate((id) => window.__game!.debugOpenStation(id), ids[0]!);
  await page.waitForTimeout(400);
  // A demand tile (what the station accepts): tapping it explains.
  const chip = page.locator(".panel .chip").last();
  await chip.click();
  const text = page.locator('[data-testid="explanation"]');
  await expect(text).toHaveCount(1);
  const message = (await text.textContent()) ?? "";
  expect(message.length).toBeGreaterThan(3);
  // Four news toasts later and well past the 3.5 s a toast lasts, it is still there.
  for (let i = 0; i < 4; i++) await page.evaluate((n) => window.__game!.debugToast(`News ${n}`), i);
  await expect(text).toHaveCount(1);
  await page.screenshot({ path: "docs/screenshots/phase-55-info-stays.png" });
  await page.waitForTimeout(5000);
  await expect(text).toHaveCount(1);
  await expect(text).toContainText(message);
  await text.click();
  await expect(text).toHaveCount(0);
  // And it goes with the panel.
  await chip.click();
  await expect(text).toHaveCount(1);
  await page.locator(".panel-close").first().click();
  await expect(text).toHaveCount(0);
});

test("the menu has a Main menu row: autosave, title screen, Continue returns to the same game", async ({
  page,
}) => {
  await page.setViewportSize({ width: 800, height: 420 });
  await page.goto("/");
  await page.getByRole("button", { name: "New Game" }).click();
  await page.getByText("American West").click();
  await page.getByRole("button", { name: "Start Game" }).click();
  await expect(page.locator(".top-bar")).toBeVisible();
  const before = await page.locator(".top-bar .date").textContent();
  await page.getByRole("button", { name: "Skip" }).click();
  await page.locator(".menu-btn").click();
  await expect(page.locator('[data-testid="menu-main"]')).toBeVisible();
  await page.screenshot({ path: "docs/screenshots/phase-55-main-menu-row.png" });
  await page.locator('[data-testid="menu-main"]').click();
  await expect(page.locator(".title-screen")).toBeVisible();
  const cont = page.getByRole("button", { name: "Continue" });
  await expect(cont).toBeVisible();
  await page.screenshot({ path: "docs/screenshots/phase-55-title-from-game.png" });
  await cont.click();
  await expect(page.locator(".title-screen")).toHaveCount(0);
  await expect(page.locator(".top-bar .date")).toContainText("1860");
  expect(before).toContain("1860");
});

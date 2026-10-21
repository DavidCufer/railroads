import { expect, test } from "@playwright/test";
import "./gameWindow";
import { lineWithTrain } from "./p30bHelpers";

/** Phase 66: lay a train up at a station and bring it back, with the real panel button. */
test.use({ deviceScaleFactor: 2 });

type S = { trains: Array<{ id: number; status: string; laidUp?: boolean }> };

test("a train is laid up from its panel, stays parked and greyed, and returns to service", async ({
  page,
}) => {
  const { trainId } = await lineWithTrain(page);
  await page.evaluate(() => window.__game!.setSpeed(0));
  // Step in single days until the train stands loading at a stop.
  for (let i = 0; i < 80; i++) {
    const at = await page.evaluate(
      (id) => (window.__game!.getState() as unknown as S).trains.find((t) => t.id === id)!.status,
      trainId,
    );
    if (at === "loading") break;
    await page.evaluate(() => window.__game!.runDays(1));
  }
  await page.evaluate((id) => window.__game!.debugOpenTrain(id), trainId);
  await page.locator(".train-layup-btn").click();
  await expect(page.locator(".train-layup-btn")).toHaveAttribute("aria-label", "Back in service");
  await page.evaluate(() => window.__game!.runDays(20));
  const parked = await page.evaluate(
    (id) => (window.__game!.getState() as unknown as S).trains.find((t) => t.id === id)!,
    trainId,
  );
  expect(parked.status).toBe("laidUp");
  // Close in on the parked train (left of the panel) so its greyed consist can be seen.
  await page.evaluate((id) => {
    const t = (
      window.__game!.getState() as unknown as {
        trains: Array<{ id: number; renderToX: number; renderToY: number }>;
      }
    ).trains.find((x) => x.id === id)!;
    window.__game!.camera.setZoom(3);
    window.__game!.camera.setCenter((t.renderToX + 2.2) * 32, t.renderToY * 32);
  }, trainId);
  await page.waitForTimeout(500);
  await page.screenshot({ path: "docs/screenshots/phase-66-laid-up.png" });

  await page.locator(".train-layup-btn").click();
  await page.evaluate(() => window.__game!.runDays(3));
  const back = await page.evaluate(
    (id) => (window.__game!.getState() as unknown as S).trains.find((t) => t.id === id)!,
    trainId,
  );
  expect(back.laidUp).toBeUndefined();
  expect(back.status).not.toBe("laidUp");
});

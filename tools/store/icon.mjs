/**
 * App icon (Phase 71): a brass steam locomotive on dark green, drawn with Canvas 2D in headless Chromium.
 * Writes every mipmap (legacy square + round), the adaptive-icon foreground (transparent, inside the 66% safe zone),
 * the adaptive background colour, and docs/store/icon-512.png.  Run: node tools/store/icon.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { launch, root } from "./lib.mjs";
import { drawLocoInPage } from "./draw.mjs";

const res = path.join(root, "android/app/src/main/res");
const LEGACY = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
const FG = { mdpi: 108, hdpi: 162, xhdpi: 216, xxhdpi: 324, xxxhdpi: 432 };
const BG = "#0E2C20";

const browser = await launch();
const page = await browser.newPage();
await page.addScriptTag({ content: `window.drawLoco = ${drawLocoInPage.toString()};` });

async function render(size, mode) {
  const url = await page.evaluate(
    ({ size, mode, BG }) => {
      const c = document.createElement("canvas");
      c.width = c.height = size;
      const ctx = c.getContext("2d");
      if (mode !== "fg") {
        if (mode === "round") {
          ctx.beginPath();
          ctx.arc(size / 2, size / 2, size / 2, 0, 7);
          ctx.clip();
        }
        const g = ctx.createRadialGradient(
          size * 0.5,
          size * 0.4,
          size * 0.1,
          size / 2,
          size / 2,
          size * 0.75,
        );
        g.addColorStop(0, "#1D4B35");
        g.addColorStop(1, BG);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, size, size);
      }
      // loco box is 100 wide, about 66 tall incl. steam; "fg" keeps to the 66% safe zone of the 108dp canvas.
      const w = size * (mode === "fg" ? 0.56 : 0.78);
      const s = w / 100;
      window.drawLoco(ctx, (size - w) / 2, size * 0.5 - 24 * s + (mode === "fg" ? 0 : s * 2), s);
      return c.toDataURL("image/png");
    },
    { size, mode, BG },
  );
  return Buffer.from(url.split(",")[1], "base64");
}

for (const [d, size] of Object.entries(LEGACY)) {
  fs.writeFileSync(path.join(res, `mipmap-${d}/ic_launcher.png`), await render(size, "square"));
  fs.writeFileSync(
    path.join(res, `mipmap-${d}/ic_launcher_round.png`),
    await render(size, "round"),
  );
}
for (const [d, size] of Object.entries(FG))
  fs.writeFileSync(
    path.join(res, `mipmap-${d}/ic_launcher_foreground.png`),
    await render(size, "fg"),
  );
fs.writeFileSync(
  path.join(res, "values/ic_launcher_background.xml"),
  `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${BG}</color>\n</resources>\n`,
);
fs.mkdirSync(path.join(root, "docs/store"), { recursive: true });
fs.writeFileSync(path.join(root, "docs/store/icon-512.png"), await render(512, "square"));
// a contact sheet to look at: 512, 192, 96, 48 side by side
fs.writeFileSync(path.join(root, "tools/store/.cache/icon-48.png"), await render(48, "square"));
await browser.close();

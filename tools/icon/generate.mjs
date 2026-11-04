/**
 * Phase 86: the app icon is the crest. Resizes the masters in `art/icon/` (headless Chromium + Canvas, no image
 * dependency) into every Android launcher PNG, the 512 store icon and the intro's crest.
 *   - legacy `ic_launcher` (square) and `ic_launcher_round` (circle mask) from `crest-1024.png`
 *   - adaptive foreground from `crest-foreground-1024.png`, scaled so the whole shield + banner (its box corners) fits
 *     the 66/108 safe-zone circle; the adaptive background is the crest's green
 *   - `docs/store/icon-512.png`, `public/intro/crest.png` (512 px, from the foreground master)
 * Run: node tools/icon/generate.mjs
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const res = path.join(root, "android/app/src/main/res");
const LEGACY = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
const FG = { mdpi: 108, hdpi: 162, xhdpi: 216, xxhdpi: 324, xxxhdpi: 432 };
/** The crest's field (a radial gradient from #144331 in the middle to #0c3223 at the corners); the adaptive
 * background is its mid tone. */
const BG = "#0F3828";
/** Box of the shield and banner in the foreground master (1024 px, shadow excluded). The adaptive safe zone is a
 * 66 dp circle, so the box's corners (the banner tips) must fit the circle, not just a 66 dp square. */
const FG_BOX = { x: 75, y: 60, w: 875, h: 860 };
const SAFE = 66 / 108;

const b64 = (p) => fs.readFileSync(path.join(root, p)).toString("base64");
const executablePath = fs.existsSync("/opt/pw-browsers/chromium-1194/chrome-linux/chrome")
  ? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"
  : undefined;
const browser = await chromium.launch({ executablePath });
const page = await browser.newPage();

/** Runs in the page: draws `src` (data URL) into a size x size canvas; `mode` is square | round | fg | crest. */
async function render(src, size, mode) {
  const url = await page.evaluate(
    async ({ src, size, mode, box, safe }) => {
      const img = new Image();
      img.src = src;
      await img.decode();
      const c = document.createElement("canvas");
      c.width = c.height = size;
      const ctx = c.getContext("2d");
      ctx.imageSmoothingQuality = "high";
      if (mode === "round") {
        ctx.beginPath();
        ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
        ctx.clip();
      }
      if (mode === "fg") {
        // Scale the master so its opaque box fits the safe zone, centred on the canvas.
        const k = (safe * size) / 2 / Math.hypot(box.w / 2, box.h / 2);
        const cx = box.x + box.w / 2;
        const cy = box.y + box.h / 2;
        ctx.drawImage(img, size / 2 - cx * k, size / 2 - cy * k, 1024 * k, 1024 * k);
      } else {
        ctx.drawImage(img, 0, 0, size, size);
      }
      return c.toDataURL("image/png");
    },
    { src, size, mode, box: FG_BOX, safe: SAFE },
  );
  return Buffer.from(url.split(",")[1], "base64");
}

const full = "data:image/png;base64," + b64("art/icon/crest-1024.png");
const fg = "data:image/png;base64," + b64("art/icon/crest-foreground-1024.png");
const write = (p, buf) => fs.writeFileSync(path.join(root, p), buf);

for (const [d, size] of Object.entries(LEGACY)) {
  write(`android/app/src/main/res/mipmap-${d}/ic_launcher.png`, await render(full, size, "square"));
  write(`android/app/src/main/res/mipmap-${d}/ic_launcher_round.png`, await render(full, size, "round"));
}
for (const [d, size] of Object.entries(FG))
  write(`android/app/src/main/res/mipmap-${d}/ic_launcher_foreground.png`, await render(fg, size, "fg"));
write(
  "android/app/src/main/res/values/ic_launcher_background.xml",
  `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${BG}</color>\n</resources>\n`,
);
fs.mkdirSync(path.join(root, "docs/store"), { recursive: true });
write("docs/store/icon-512.png", await render(full, 512, "square"));
fs.mkdirSync(path.join(root, "public/intro"), { recursive: true });
write("public/intro/crest.png", await render(fg, 512, "crest"));
console.log("wrote the crest icons, docs/store/icon-512.png, public/intro/crest.png");
await browser.close();

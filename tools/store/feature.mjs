/** Feature graphic 1024x500 (Phase 86): the night arrival still (art/intro/night-still-1024.png) with the crest
 * (art/icon/crest-foreground-1024.png) and the title (needs a running preview build for the game's fonts).
 * Run: node tools/store/feature.mjs */
import fs from "node:fs";
import path from "node:path";
import { BASE, launch, root } from "./lib.mjs";

const b64 = (p) => fs.readFileSync(path.join(root, p)).toString("base64");
const browser = await launch();
const page = await browser.newPage();
await page.goto(`${BASE}/?debug=1`);
const url = await page.evaluate(
  async ({ still, crest }) => {
    await document.fonts.load('700 80px "Playfair Display"');
    await document.fonts.load('400 24px "Playfair Display"');
    const load = async (b64) => {
      const img = new Image();
      img.src = "data:image/png;base64," + b64;
      await img.decode();
      return img;
    };
    const [bg, logo] = [await load(still), await load(crest)];
    const c = document.createElement("canvas");
    c.width = 1024;
    c.height = 500;
    const ctx = c.getContext("2d");
    ctx.drawImage(bg, 0, 262, 1024, 500, 0, 0, 1024, 500); // the engine, horizon glow and rails of the night still
    const g = ctx.createLinearGradient(0, 0, 1024, 0);
    g.addColorStop(0, "rgba(6,16,12,0.95)");
    g.addColorStop(0.5, "rgba(6,16,12,0.7)");
    g.addColorStop(1, "rgba(6,16,12,0.1)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 1024, 500);
    ctx.fillStyle = "#E2B24A";
    ctx.fillRect(48, 150, 6, 200);
    ctx.fillStyle = "#F3EBD3";
    ctx.font = '700 92px "Playfair Display"';
    ctx.fillText("Iron & Steam", 76, 248);
    ctx.fillStyle = "#E2B24A";
    ctx.font = '400 30px "Playfair Display"';
    ctx.fillText("Build the line. Move the world.", 80, 300);
    ctx.fillStyle = "rgba(243,235,211,0.75)";
    ctx.font = '400 20px "Playfair Display"';
    ctx.fillText("A railway tycoon, from steam to electric", 80, 340);
    ctx.drawImage(logo, 640, 20, 380, 380);
    return c.toDataURL("image/png");
  },
  {
    still: b64("art/intro/night-still-1024.png"),
    crest: b64("art/icon/crest-foreground-1024.png"),
  },
);
fs.writeFileSync(
  path.join(root, "docs/store/feature-graphic.png"),
  Buffer.from(url.split(",")[1], "base64"),
);
await browser.close();

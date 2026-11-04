import { createRequire } from "module";
import fs from "fs";
import path from "path";
const require = createRequire(
  path.join(path.dirname(new URL(import.meta.url).pathname), "../../package.json"),
);
const { chromium } = require("@playwright/test");
const ROOT = path.dirname(new URL(import.meta.url).pathname);
const [, , query, out] = process.argv;
const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium",
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
const p = await b.newPage({ viewport: { width: 1100, height: 1100 } });
p.on("pageerror", (e) => console.log("ERR", e.message));
await p.route("http://art.local/**", (r) => {
  const u = new URL(r.request().url());
  const f = path.join(ROOT, decodeURIComponent(u.pathname));
  if (!fs.existsSync(f)) return r.fulfill({ status: 404, body: "" });
  r.fulfill({
    status: 200,
    body: fs.readFileSync(f),
    contentType: f.endsWith(".js") ? "text/javascript" : "text/html",
  });
});
await p.goto("http://art.local/index.html?" + (query || ""));
await p.waitForFunction(() => window.done, null, { timeout: 170000 });
const url = await p.evaluate(() => window.done);
fs.writeFileSync(out, Buffer.from(url.split(",")[1], "base64"));
await b.close();

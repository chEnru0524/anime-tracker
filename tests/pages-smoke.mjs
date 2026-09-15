import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { chromium } from "@playwright/test";
// Emulate a Pages project site: no SPA fallback outside /anime-tracker/.
const root = resolve("dist");
const server = createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, "http://localhost").pathname;
    if (!pathname.startsWith("/anime-tracker/")) throw new Error("404");
    const relative =
      decodeURIComponent(pathname.slice("/anime-tracker/".length)) ||
      "index.html";
    const file = resolve(root, relative);
    if (!file.startsWith(root)) throw new Error("404");
    const data = await readFile(file);
    res.setHeader(
      "Content-Type",
      {
        ".html": "text/html",
        ".js": "text/javascript",
        ".css": "text/css",
        ".svg": "image/svg+xml",
      }[extname(file)] || "application/octet-stream",
    );
    res.end(data);
  } catch {
    res.statusCode = 404;
    res.end("Not found");
  }
});
await new Promise((r) => server.listen(4174, "127.0.0.1", r));
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("https://api.jikan.moe/**", (r) => r.abort());
  await page.route("https://api.bgm.tv/**", (r) => r.abort());
  for (const path of ["library", "backup", "stats"]) {
    await page.goto(`http://127.0.0.1:4174/anime-tracker/#/${path}`);
    await page.locator("main h1").waitFor();
    await page.reload();
    await page.locator("main h1").waitFor();
    for (const width of [390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      if (
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        )
      )
        throw new Error(`overflow ${path} ${width}`);
    }
    console.log("PASS production subpath and reload", path);
  }
  if (errors.length) throw new Error(errors.join("\n"));
  console.log("PASS no JavaScript runtime errors");
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
}

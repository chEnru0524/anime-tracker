import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
await mkdir("test-results/live", { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto("http://127.0.0.1:5173/#/search?q=Frieren");
await page.locator(".card-title").first().waitFor({ timeout: 90000 });
console.log("LIVE SEARCH", await page.locator(".card-title").allTextContents());
await page
  .getByRole("button", { name: "開始觀看", exact: true })
  .first()
  .click();
await page.locator(".toast").waitFor();
await page.locator(".card-title").first().click();
await page.getByRole("heading", { name: "我的觀看紀錄" }).waitFor();
await page.waitForTimeout(4000);
console.log("LIVE DETAIL", await page.locator(".detail-main h1").textContent());
await page.getByLabel("目前觀看集數", { exact: true }).fill("20");
await page.getByRole("button", { name: "儲存紀錄" }).click();
await page.goto("http://127.0.0.1:5173/");
await page.locator(".upcoming-card").first().waitFor({ timeout: 90000 });
await page.screenshot({
  path: "test-results/live/dashboard-desktop.png",
  fullPage: true,
});
console.log(
  "LIVE UPCOMING",
  await page.locator(".upcoming-card h3").allTextContents(),
);
await page.setViewportSize({ width: 390, height: 844 });
await page.screenshot({
  path: "test-results/live/dashboard-mobile.png",
  fullPage: true,
});
console.log(
  "MOBILE OVERFLOW",
  await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
);
await page.goto("http://127.0.0.1:5173/#/season");
await page.locator(".card-title").first().waitFor({ timeout: 90000 });
console.log("LIVE SEASON COUNT", await page.locator(".card-title").count());
console.log("PAGE ERRORS", errors);
await browser.close();

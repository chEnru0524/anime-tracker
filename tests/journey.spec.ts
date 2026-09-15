import { test, expect } from "@playwright/test";
const raw = {
  mal_id: 52991,
  title: "Sousou no Frieren",
  title_japanese: "葬送のフリーレン",
  titles: [{ title: "Frieren" }],
  images: { jpg: { large_image_url: "" } },
  synopsis: "A long journey.",
  episodes: 28,
  year: 2023,
  season: "fall",
  aired: { from: "2023-09-29T00:00:00+00:00", to: "2024-03-22T00:00:00+00:00" },
  status: "Finished Airing",
  type: "TV",
  genres: [{ name: "Fantasy" }],
  streaming: [{ name: "Netflix", url: "https://www.netflix.com/" }],
};
const bgm = {
  id: 400602,
  name: raw.title_japanese,
  name_cn: "葬送的芙莉莲",
  summary: "一段尋找人心的旅程。",
};
test.beforeEach(async ({ page }) => {
  await page.route("https://api.jikan.moe/**", (route) =>
    route.fulfill({
      json: route.request().url().includes("/full")
        ? { data: raw }
        : { data: [raw], pagination: { has_next_page: false } },
    }),
  );
  await page.route("https://api.bgm.tv/**", (route) =>
    route.fulfill({ json: { data: [bgm], total: 1 } }),
  );
});
test("search, collect, clamp, complete, rate, edit platforms, export and restore", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.getByRole("searchbox").count();
  await page
    .getByRole("textbox", { name: "搜尋動畫", exact: true })
    .fill("Frieren");
  await page.getByRole("button", { name: "搜尋", exact: true }).click();
  await expect(page.locator(".card-title").first()).toContainText(
    "葬送的芙莉蓮",
  );
  await page
    .getByRole("button", { name: "開始觀看", exact: true })
    .first()
    .click();
  await expect(page.locator(".toast")).toContainText("已儲存");
  await page.locator(".card-title").first().click();
  await expect(
    page.getByRole("heading", { name: "我的觀看紀錄" }),
  ).toBeVisible();
  await page.getByLabel("目前觀看集數", { exact: true }).fill("27");
  await page.getByLabel("個人評分（0–10）").fill("9");
  await page.getByLabel("個人備註").fill("想再看一次。");
  await page.getByRole("button", { name: "儲存紀錄" }).click();
  await expect(page.locator(".toast")).toContainText("已儲存");
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "葬送的芙莉蓮 增加一集" }).click();
  await expect(
    page.getByRole("combobox", { name: "觀看狀態", exact: true }),
  ).toHaveValue("completed");
  await expect(page.getByLabel("目前觀看集數", { exact: true })).toHaveValue(
    "28",
  );
  await expect(
    page.getByRole("button", { name: "葬送的芙莉蓮 增加一集" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "管理觀看平台" }).click();
  await page
    .getByLabel("平台名稱", { exact: true })
    .first()
    .fill("巴哈姆特動畫瘋");
  await page
    .getByLabel("觀看網址", { exact: true })
    .first()
    .fill("https://ani.gamer.com.tw/");
  await page.getByLabel("可觀看地區", { exact: true }).first().fill("台灣");
  await page.getByRole("button", { name: "儲存平台", exact: true }).click();
  await expect(page.locator(".platform-item").first()).toContainText(
    "巴哈姆特動畫瘋",
  );
  await page.goto("/#/backup");
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "下載備份檔" }).click();
  const download = await downloadEvent;
  const file = await download.path();
  expect(file).toBeTruthy();
  await page.getByLabel("選擇 JSON 備份").setInputFiles(file!);
  await expect(
    page.getByRole("heading", { name: "確認備份內容" }),
  ).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "確認還原並取代資料" }).click();
  await expect(
    page.getByText("還原完成，觀看紀錄與設定已更新。"),
  ).toBeVisible();
  await page.goto("/#/stats");
  await expect(page.locator(".stats-overview")).toContainText("28");
  await expect(page.locator(".stats-overview")).toContainText("9.0");
  expect(errors).toEqual([]);
});
test("offline library, bad backup protection and responsive layouts", async ({
  page,
}) => {
  await page.goto("/#/search?q=Frieren");
  await page.getByRole("button", { name: "開始觀看", exact: true }).click();
  await expect(page.locator(".toast")).toContainText("已儲存");
  await page.unroute("https://api.jikan.moe/**");
  await page.unroute("https://api.bgm.tv/**");
  await page.route("https://api.jikan.moe/**", (r) => r.abort());
  await page.route("https://api.bgm.tv/**", (r) => r.abort());
  await page.goto("/#/library");
  await expect(page.locator(".card-title")).toContainText("葬送的芙莉蓮");
  await page.getByRole("button", { name: "葬送的芙莉蓮 增加一集" }).click();
  await page.reload();
  await expect(page.locator(".progress-caption")).toContainText("1 / 28");
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBeTruthy();
  }
  await page.goto("/#/backup");
  await page
    .getByLabel("選擇 JSON 備份")
    .setInputFiles({
      name: "bad.json",
      mimeType: "application/json",
      buffer: Buffer.from('{"app":"evil"}'),
    });
  await expect(page.getByRole("alert")).toContainText("原有資料未變更");
  await page.goto("/#/library");
  await expect(page.locator(".card-title")).toHaveCount(1);
});

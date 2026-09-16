import { test, expect } from "@playwright/test";
test("batch collect and remove, with cancellation and responsive layout", async ({
  page,
}) => {
  await page.route("https://api.jikan.moe/**", (r) =>
    r.fulfill({
      json: {
        data: [1, 2].map((id) => ({
          mal_id: id,
          title: `Anime ${id}`,
          episodes: 12,
        })),
        pagination: { has_next_page: false },
      },
    }),
  );
  await page.route("https://api.bgm.tv/**", (r) =>
    r.fulfill({ json: { data: [], total: 0 } }),
  );
  await page.goto("/#/season");
  await page.getByRole("button", { name: "選取本頁未收藏" }).click();
  await page.getByRole("button", { name: "批次加入想看" }).click();
  await expect(page.locator(".in-library")).toHaveCount(2);
  await expect(
    page.getByRole("button", { name: "選取本頁未收藏" }),
  ).toBeDisabled();
  await page.goto("/#/library");
  await page.getByRole("button", { name: "選取篩選結果" }).click();
  page.once("dialog", (d) => d.dismiss());
  await page.getByRole("button", { name: "移除選取動畫" }).click();
  await expect(page.locator(".library-card")).toHaveCount(2);
  for (const width of [360, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "移除選取動畫" }).click();
  await expect(page.locator(".library-card")).toHaveCount(0);
});

test("history batch directly creates Bahamut collection and opens offline details", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("https://api.jikan.moe/**", (r) => r.abort());
  await page.route("https://api.bgm.tv/**", (r) => r.abort());
  await page.goto("/#/backup");
  const at = new Date().toISOString();
  await page
    .getByLabel("選擇 JSON 備份")
    .setInputFiles({
      name: "fixture.json",
      mimeType: "application/json",
      buffer: Buffer.from(
        JSON.stringify({
          app: "yoru",
          version: 1,
          exportedAt: at,
          records: [],
          settings: { region: "台灣" },
          bahamut: {
            bindings: [],
            applied: [],
            pending: [1, 2].map((id) => ({
              id: `history:${id}`,
              kind: "history",
              seriesId: String(id),
              videoId: String(id + 100),
              title: `巴哈作品${id}`,
              episode: 8,
              episodeLabel: "8",
              watchedAt: at,
              capturedAt: at,
              ratio: 1,
              threshold: 80,
              evidence: "site-history",
            })),
          },
        }),
      ),
    });
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "確認還原並取代資料" }).click();
  await page.goto("/#/sync");
  await page.getByRole("button", { name: "選取可直接匯入紀錄" }).click();
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "批次加入我的動畫（2）", exact: true })
    .click();
  await expect(page.locator(".sync-event")).toHaveCount(0);
  await page.goto("/#/library");
  await expect(page.locator(".library-card")).toHaveCount(2);
  await expect(page.locator(".library-card").first()).toContainText(
    "巴哈姆特動畫瘋",
  );
  await expect(page.locator(".progress-caption").first()).toContainText(
    "8 / 未定",
  );
  await page.locator(".card-title").first().click();
  await expect(
    page.getByRole("heading", { name: "我的觀看紀錄" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "我的觀看紀錄" }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

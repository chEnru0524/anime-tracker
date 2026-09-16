import { test, expect } from "@playwright/test";

test("archive defaults to previous quarter, sorts whole season, filters and preserves collection", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date(2026, 0, 15));
  const requests: string[] = [],
    errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("https://api.bgm.tv/**", (r) =>
    r.fulfill({ json: { data: [], total: 0 } }),
  );
  await page.route("https://api.jikan.moe/**", async (r) => {
    const u = new URL(r.request().url());
    requests.push(u.pathname);
    if (u.pathname === "/v4/seasons")
      return r.fulfill({ json: { data: [{ year: 1917 }, { year: 2025 }] } });
    const n = Number(u.searchParams.get("page") || 1);
    const data = Array.from({ length: n === 1 ? 25 : 1 }, (_, i) => ({
      mal_id: n === 1 ? i + 1 : 26,
      title: n === 2 ? "A highest" : `Z ${i}`,
      members: n === 2 ? 9999 : i,
      score: n === 2 ? 10 : i / 10,
      episodes: 12,
      year: 2025,
      season: "fall",
      type: "TV",
      genres: [{ mal_id: 10, name: "Fantasy" }],
    }));
    return r.fulfill({
      json: { data, pagination: { has_next_page: n === 1 } },
    });
  });
  await page.goto("/#/archive");
  await expect(
    page.getByRole("heading", { name: "歷年動畫", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("播出年份")).toHaveValue("2025");
  await expect(page.getByLabel("季度", { exact: true })).toHaveValue("fall");
  await expect(page.getByLabel("目前頁碼")).toHaveText("第 1 / 2 頁");
  await expect(page.locator(".card-title").first()).toHaveText("A highest");
  await page
    .locator(".anime-card")
    .first()
    .getByRole("button", { name: "開始觀看" })
    .click();
  await expect(page.locator(".anime-card").first()).toContainText(
    "已加入收藏 · 觀看中 · 0 / 12 集",
  );
  await expect(
    page
      .locator(".anime-card")
      .first()
      .getByRole("button", { name: "開始觀看" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "末頁", exact: true }).click();
  await expect(page.getByLabel("目前頁碼")).toHaveText("第 2 / 2 頁");
  await page.getByLabel("排序", { exact: true }).selectOption("score");
  await expect(page.getByLabel("目前頁碼")).toHaveText("第 1 / 2 頁");
  await expect(page.locator(".card-title").first()).toHaveText("A highest");
  await page.getByLabel("排序", { exact: true }).selectOption("title");
  await expect(page.locator(".card-title").first()).toHaveText("A highest");
  await page.getByLabel("播出年份").fill("1917");
  await page.getByRole("button", { name: "查詢年份" }).click();
  await page.getByLabel("季度", { exact: true }).selectOption("winter");
  await expect
    .poll(() => requests.includes("/v4/seasons/1917/winter"))
    .toBe(true);
  await expect(page.getByLabel("目前頁碼")).toHaveText("第 1 / 2 頁");
  for (const width of [360, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await expect(
      page.getByRole("link", { name: "歷年動畫", exact: true }),
    ).toBeVisible();
  }
  await page.getByLabel("題材類型").selectOption("horror");
  await expect(
    page.getByText("目前沒有符合條件的動畫", { exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("archive fallback sorts Bangumi, and errors can retry", async ({
  page,
}) => {
  let fail = true;
  const offsets: number[] = [];
  await page.route("https://api.jikan.moe/**", (r) => r.abort());
  await page.route("https://api.bgm.tv/**", (r) => {
    if (fail) return r.abort();
    const offset = Number(
      new URL(r.request().url()).searchParams.get("offset"),
    );
    offsets.push(offset);
    return r.fulfill({
      json: {
        total: 21,
        data:
          offset === 0
            ? Array.from({ length: 20 }, (_, i) => ({
                id: i + 1,
                name: "Z" + i,
                collection: { wish: 1, collect: 1 },
                rating: { score: 9 },
              }))
            : [
                {
                  id: 21,
                  name: "A",
                  collection: { wish: 20, collect: 10 },
                  rating: { score: 7 },
                },
              ],
      },
    });
  });
  await page.goto("/#/archive");
  await expect(page.getByRole("alert")).toBeVisible();
  fail = false;
  await page.getByRole("button", { name: "重新嘗試" }).click();
  await expect(page.locator(".card-title").first()).toHaveText("A");
  expect(offsets).toEqual([0, 20]);
  await page.getByLabel("排序", { exact: true }).selectOption("score");
  await expect(page.locator(".card-title").first()).toHaveText("Z0");
  await page.getByLabel("排序", { exact: true }).selectOption("title");
  await expect(page.locator(".card-title").first()).toHaveText("A");
});

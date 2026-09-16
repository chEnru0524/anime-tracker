import { test, expect } from "@playwright/test";
test("total pages, direct jump, filters reset pagination and empty results", async ({
  page,
}) => {
  const errors: string[] = [];
  const requests: URL[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("https://api.bgm.tv/**", (r) =>
    r.fulfill({ json: { data: [], total: 0 } }),
  );
  await page.route("https://api.jikan.moe/**", (r) => {
    const url = new URL(r.request().url());
    requests.push(url);
    const empty = url.searchParams.get("genres") === "14";
    const filtered =
      url.searchParams.has("type") || url.searchParams.has("filter");
    const n = Number(url.searchParams.get("page") || 1);
    return r.fulfill({
      json: {
        data: empty
          ? []
          : [{ mal_id: n, title: "Anime " + n, type: "TV", genres: [] }],
        pagination: {
          last_visible_page: empty ? 1 : filtered ? 2 : 3,
          items: { total: empty ? 0 : filtered ? 25 : 49 },
        },
      },
    });
  });
  await page.goto("/#/upcoming");
  await expect(page.getByLabel("目前頁碼")).toHaveText("第 1 / 3 頁");
  await page.getByLabel("跳轉頁碼").fill("3");
  await page.getByRole("button", { name: "前往", exact: true }).click();
  await expect(page.getByLabel("目前頁碼")).toHaveText("第 3 / 3 頁");
  await expect(
    page.getByRole("button", { name: "下一頁", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("播出形式").selectOption("tv");
  await expect(page.getByLabel("目前頁碼")).toHaveText("第 1 / 2 頁");
  await page.getByLabel("題材類型").selectOption("fantasy");
  await expect(page.getByLabel("目前頁碼")).toHaveText("第 1 / 2 頁");
  expect(requests.at(-1)?.searchParams.get("genres")).toBe("10");
  expect(requests.at(-1)?.searchParams.get("type")).toBe("tv");
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.getByLabel("題材類型").selectOption("horror");
  await expect(page.getByLabel("目前頁碼")).toHaveText("共 0 頁");
  await expect(page.getByLabel("跳轉頁碼")).toBeDisabled();
  expect(errors).toEqual([]);
});
test("Bangumi fallback total and jump use twenty-item offsets", async ({
  page,
}) => {
  const offsets: number[] = [];
  await page.route("https://api.jikan.moe/**", (r) => r.abort());
  await page.route("https://api.bgm.tv/**", (r) => {
    if (r.request().url().includes("calendar")) return r.fulfill({ json: [] });
    const u = new URL(r.request().url());
    offsets.push(Number(u.searchParams.get("offset")));
    return r.fulfill({
      json: {
        data: [
          { id: 123, name: "測試動畫", name_cn: "測試動畫", platform: "TV" },
        ],
        total: 41,
        limit: 20,
      },
    });
  });
  await page.goto("/#/season");
  await expect(page.getByLabel("目前頁碼")).toHaveText("第 1 / 3 頁");
  await page.getByRole("button", { name: "末頁", exact: true }).click();
  await expect(page.getByLabel("目前頁碼")).toHaveText("第 3 / 3 頁");
  expect(offsets).toEqual([0, 40]);
});

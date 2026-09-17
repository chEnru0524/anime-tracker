import { test, expect } from "@playwright/test";
test("organize older anime in batches while protecting this season, future and unknown records", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date(2026, 8, 17, 12));
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("https://api.jikan.moe/**", (r) => r.abort());
  await page.route("https://api.bgm.tv/**", (r) => r.abort());
  const at = "2020-01-01T00:00:00.000Z";
  const dates = [
    [2025, "summer"],
    [2026, "spring"],
    [2026, "summer"],
    [2027, "winter"],
    [null, null],
  ];
  const records = dates.map(([year, season], i) => ({
    anime: {
      id: i + 1,
      title: `Anime ${i + 1}`,
      zh: "",
      ja: "",
      aliases: [],
      cover: "",
      summary: "",
      genres: [],
      episodes: i === 1 ? null : 12,
      year,
      season,
      start: null,
      end: null,
      airing: "unknown",
      format: "TV",
      platforms: [],
      detail: true,
    },
    status: "watching",
    progress: 3,
    rating: 8,
    notes: "keep",
    addedAt: at,
    lastWatched: at,
    completedAt: null,
    customPlatforms: null,
  }));
  await page.goto("/#/backup");
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
          records,
          settings: { region: "台灣" },
        }),
      ),
    });
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "確認還原並取代資料" }).click();
  await page.goto("/#/library");
  await page.getByLabel("新舊番範圍").selectOption("older-season");
  await expect(page.locator(".library-card")).toHaveCount(2);
  await page.getByRole("button", { name: "選取篩選結果" }).click();
  page.once("dialog", (d) => d.dismiss());
  await page.getByRole("button", { name: "套用觀看狀態" }).click();
  await expect(page.locator(".library-status").first()).toContainText("觀看中");
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "套用觀看狀態" }).click();
  await expect(page.locator(".library-status").first()).toContainText("已看完");
  await expect(page.locator(".progress-caption").first()).toContainText(
    "12 / 12",
  );
  await expect(page.locator(".progress-caption").nth(1)).toContainText(
    "3 / 未定",
  );
  await page.reload();
  await expect(page.getByLabel("新舊番範圍")).toHaveValue("older-season");
  await page.getByRole("button", { name: "選取篩選結果" }).click();
  await page.getByLabel("批次觀看狀態").selectOption("planned");
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "套用觀看狀態" }).click();
  await expect(page.locator(".library-status").first()).toContainText("想看");
  await expect(page.locator(".progress-caption").first()).toContainText(
    "12 / 12",
  );
  await page.getByLabel("新舊番範圍").selectOption("current");
  await expect(page.locator(".library-card")).toHaveCount(1);
  await expect(page.locator(".library-card")).toContainText("Anime 3");
  await expect(page.locator(".library-card")).toContainText("觀看中");
  await page.getByRole("button", { name: "選取篩選結果" }).click();
  await page.getByLabel("新舊番範圍").selectOption("not-year");
  await expect(
    page.getByRole("button", { name: "套用觀看狀態" }),
  ).toBeDisabled();
  await expect(page.locator(".library-card")).toHaveCount(2);
  await page.getByLabel("新舊番範圍").selectOption("not-season");
  await expect(page.locator(".library-card")).toHaveCount(3);
  await page.getByLabel("新舊番範圍").selectOption("unknown");
  await expect(page.locator(".library-card")).toHaveCount(1);
  for (const width of [360, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  expect(errors).toEqual([]);
});

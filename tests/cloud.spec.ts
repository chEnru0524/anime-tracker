import { test, expect } from "@playwright/test";

test("email login, cloud preview, restore, conflict protection and responsive account UI", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const user = {
    id: "00000000-0000-0000-0000-000000000001",
    email: "fixture@example.com",
    aud: "authenticated",
    role: "authenticated",
    created_at: "2026-01-01T00:00:00Z",
  };
  const backup = {
    app: "yoru",
    version: 1,
    exportedAt: "2026-01-01T00:00:00.000Z",
    records: [],
    settings: { region: "台灣" },
  };
  let uploads = 0;
  await page.route("https://api.jikan.moe/**", (r) => r.abort());
  await page.route("https://api.bgm.tv/**", (r) => r.abort());
  await page.route("https://fixture.supabase.co/**", async (route) => {
    const url = route.request().url();
    if (url.includes("/auth/v1/otp")) return route.fulfill({ json: {} });
    if (url.includes("/auth/v1/verify"))
      return route.fulfill({
        json: {
          access_token: "fixture-token",
          refresh_token: "fixture-refresh",
          token_type: "bearer",
          expires_in: 3600,
          user,
        },
      });
    if (url.includes("/auth/v1/user")) return route.fulfill({ json: user });
    if (url.includes("/auth/v1/logout")) return route.fulfill({ status: 204 });
    if (url.includes("/rest/v1/yoru_backups"))
      return route.fulfill({
        json: { revision: 1, payload: backup, updated_at: backup.exportedAt },
      });
    if (url.includes("/rpc/save_yoru_backup")) {
      uploads++;
      expect(route.request().postDataJSON().expected_revision).toBe(1);
      return route.fulfill({
        status: 400,
        json: { message: "revision_conflict" },
      });
    }
    return route.abort();
  });
  await page.goto("/#/account");
  await page
    .getByLabel("Project URL", { exact: true })
    .fill("https://fixture.supabase.co");
  await page
    .getByLabel("Publishable key", { exact: true })
    .fill("sb_publishable_fixture");
  await page.getByRole("button", { name: "儲存連線設定" }).click();
  await page.getByLabel("Email", { exact: true }).fill(user.email);
  await page.getByRole("button", { name: "寄送登入驗證碼" }).click();
  await expect(page.getByRole("status")).toContainText("驗證郵件已寄出");
  await page.getByLabel("驗證碼", { exact: true }).fill("123456");
  await page.getByRole("button", { name: "驗證並登入" }).click();
  await page.getByRole("button", { name: "讀取雲端摘要" }).click();
  await expect(page.getByText(/版本 1/)).toBeVisible();
  expect(uploads).toBe(0);
  await page.getByRole("button", { name: "載入雲端紀錄" }).click();
  await expect(page.getByRole("heading", { name: "還原預覽" })).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "確認還原", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("已載入雲端紀錄");
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "上傳本機紀錄" }).click();
  await expect(page.getByRole("status")).toContainText("另一台裝置");
  expect(uploads).toBe(1);
  for (const width of [360, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.getByRole("button", { name: "登出", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "寄送登入驗證碼" }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

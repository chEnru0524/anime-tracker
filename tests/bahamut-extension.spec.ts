import { test, expect, chromium } from "@playwright/test";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { resolve, extname, join } from "node:path";
import { tmpdir } from "node:os";
const fixtureAnime = {
  id: 1,
  title: "Fixture",
  zh: "測試動畫",
  ja: "テスト",
  aliases: [],
  cover: "",
  summary: "",
  genres: [],
  episodes: 12,
  year: 2026,
  season: "summer",
  start: null,
  end: null,
  airing: "unknown",
  format: "TV",
  platforms: [],
  detail: true,
};
const base = "https://chenru0524.github.io/anime-tracker/";
const history = `<!doctype html><meta charset="utf-8"><h1>觀看紀錄</h1><div class="history-wrapper"><div class="user-watch-list"><div class="anime-card"><p class="history-anime-title">測試動畫</p><span class="user-lastwatch">8</span><div class="progress-bar"><div class="progress" style="width:100%"></div></div><div data-anime-sn="123"></div><a class="play-btn" href="https://ani.gamer.com.tw/animeVideo.php?sn=456">播放</a></div></div></div><div class="user-watchTime-list" data-anime-sn="123"><a href="https://ani.gamer.com.tw/animeVideo.php?sn=456"><div class="date">2026.09.01 20:15</div></a></div>`;
const playback = `<!doctype html><meta charset="utf-8"><div class="anime_name"><h1>測試動畫 [8]</h1><button onclick="animefun.toggleGather(999,123)">訂閱</button></div><section class="season"><li class="playing"><a data-ani-video-sn="456" href="?sn=456">8</a></li></section><div id="ani_video"><video id="ani_video_html5_api"></video></div>`;
test("real unpacked extension: capture history, durable queue, confirmed mapping, automatic progress and origin isolation", async () => {
  test.setTimeout(120000);
  test.skip(
    process.env.RUN_NATIVE_EXTENSION !== "1",
    "Native Chromium extension runner enabled in CI",
  );
  const profile = await mkdtemp(join(tmpdir(), "yoru-extension-test-"));
  const extension = resolve("extension-dist");
  const context = await chromium.launchPersistentContext(profile, {
    channel: "chromium",
    headless: true,
    ignoreDefaultArgs: ["--disable-extensions"],
    args: [
      `--disable-extensions-except=${extension}`,
      `--load-extension=${extension}`,
    ],
  });
  try {
    // Every network response in this isolated profile is a local fixture. No user session or real API is accessed.
    await context.route("**/*", async (route) => {
      const u = new URL(route.request().url());
      if (u.protocol === "chrome-extension:") return route.continue();
      if (
        u.origin === "https://chenru0524.github.io" &&
        u.pathname.startsWith("/anime-tracker/")
      ) {
        const file = resolve(
          "dist",
          u.pathname.slice("/anime-tracker/".length) || "index.html",
        );
        if (!file.startsWith(resolve("dist"))) return route.abort();
        return route.fulfill({
          body: await readFile(file),
          contentType:
            (
              {
                ".js": "application/javascript",
                ".css": "text/css",
                ".html": "text/html",
              } as Record<string, string>
            )[extname(file)] ?? "application/octet-stream",
        });
      }
      if (u.origin === "https://ani.gamer.com.tw")
        return route.fulfill({
          contentType: "text/html",
          body: u.pathname === "/viewList.php" ? history : playback,
        });
      if (u.origin === "https://chenru0524.github.io")
        return route.fulfill({
          contentType: "text/html",
          body: "<h1>Other project fixture</h1>",
        });
      return route.abort();
    });
    const worker =
      context.serviceWorkers()[0] ??
      (await context.waitForEvent("serviceworker"));
    const id = new URL(worker.url()).host;
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${id}/popup.html`);
    await popup.getByLabel("啟用偵測與同步").check();
    await popup.getByRole("button", { name: "儲存設定" }).click();
    await expect(popup.getByText("設定已儲存；10 秒內套用")).toBeVisible();
    const ani = await context.newPage();
    await ani.goto("https://ani.gamer.com.tw/viewList.php?u=fixture");
    await ani.bringToFront();
    await expect
      .poll(() =>
        worker.evaluate(async () => {
          try {
            const [t] = await chrome.tabs.query({
              active: true,
              currentWindow: true,
            });
            return (
              await chrome.tabs.sendMessage(t.id!, { type: "PAGE_STATUS" })
            ).ok;
          } catch {
            return false;
          }
        }),
      )
      .toBe(true);
    // Send the same internal message as the popup; content runs in the real isolated extension world.
    const imported = await worker.evaluate(async () => {
      const tabs = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      const tab = tabs[0];
      return chrome.tabs.sendMessage(tab!.id!, { type: "IMPORT_HISTORY" });
    });
    expect(imported).toMatchObject({ ok: true, count: 1 });
    let app = await context.newPage();
    const errors: string[] = [];
    app.on("pageerror", (e) => errors.push(e.message));
    await app.goto(base + "#/backup");
    await app.getByLabel("選擇 JSON 備份").setInputFiles({
      name: "fixture.json",
      mimeType: "application/json",
      buffer: Buffer.from(
        JSON.stringify({
          app: "yoru",
          version: 1,
          exportedAt: new Date().toISOString(),
          records: [
            {
              anime: fixtureAnime,
              status: "watching",
              progress: 5,
              rating: 9,
              notes: "keep",
              addedAt: new Date().toISOString(),
              lastWatched: null,
              completedAt: null,
              customPlatforms: null,
            },
          ],
          settings: { region: "台灣" },
        }),
      ),
    });
    app.once("dialog", (d) => d.accept());
    await app.getByRole("button", { name: "確認還原並取代資料" }).click();
    await app.goto(base + "#/sync");
    await app.getByLabel("擴充功能 ID", { exact: true }).fill(id);
    await app.getByRole("button", { name: "連接並啟用自動同步" }).click();
    await expect(app.locator(".sync-event")).toHaveCount(1);
    await app.goto(base + "#/library");
    await expect(app.locator(".progress-caption")).toContainText("5 / 12");
    await app.goto(base + "#/sync");
    await app.locator(".sync-event select").selectOption("1");
    await app.getByText("設定這部作品日後自動同步", { exact: true }).click();
    await app.getByRole("button", { name: "確認配對並啟用此作品同步" }).click();
    await expect(app.locator(".sync-binding")).toHaveCount(1);
    app.once("dialog", (d) => d.accept());
    await app.getByRole("button", { name: "確認匯入此筆" }).click();
    await expect(app.locator(".sync-event")).toHaveCount(0);
    await app.goto(base + "#/library");
    await expect(app.locator(".progress-caption")).toContainText("8 / 12");
    // Real media properties are shared across Chrome's isolated worlds; JS property overrides are not.
    await app.close();
    await ani.goto("https://ani.gamer.com.tw/animeVideo.php?sn=456");
    const wav = Buffer.alloc(44 + 8000 * 2 * 12);
    wav.write("RIFF", 0);
    wav.writeUInt32LE(wav.length - 8, 4);
    wav.write("WAVEfmt ", 8);
    wav.writeUInt32LE(16, 16);
    wav.writeUInt16LE(1, 20);
    wav.writeUInt16LE(1, 22);
    wav.writeUInt32LE(8000, 24);
    wav.writeUInt32LE(16000, 28);
    wav.writeUInt16LE(2, 32);
    wav.writeUInt16LE(16, 34);
    wav.write("data", 36);
    wav.writeUInt32LE(wav.length - 44, 40);
    await ani.evaluate((data) => {
      const v = document.querySelector("video")!;
      v.src = `data:audio/wav;base64,${data}`;
      v.muted = true;
      v.addEventListener("timeupdate", () =>
        localStorage.setItem(
          "ANIME_BP",
          JSON.stringify({ videoSn: 456, breakPoint: v.currentTime }),
        ),
      );
    }, wav.toString("base64"));
    await expect
      .poll(() =>
        ani.evaluate(() => document.querySelector("video")!.readyState),
      )
      .toBe(4);
    await ani.waitForTimeout(1200);
    await ani.evaluate(() => {
      const v = document.querySelector("video")!;
      v.currentTime = 11;
      return v.play();
    });
    await ani.waitForTimeout(1300);
    await ani.evaluate(() => {
      document.getElementById("ani_video")!.classList.add("vjs-ad-playing");
      const v = document.querySelector("video")!;
      v.currentTime = 0;
      return v.play();
    });
    await ani.waitForTimeout(1500);
    expect(
      await worker.evaluate(
        async () =>
          (await chrome.storage.local.get("state")).state.queue.length,
      ),
    ).toBe(0);
    await ani.evaluate(() => {
      document.getElementById("ani_video")!.classList.remove("vjs-ad-playing");
      const v = document.querySelector("video")!;
      v.currentTime = 0;
      return v.play();
    });
    await expect
      .poll(
        () =>
          worker.evaluate(
            async () =>
              (await chrome.storage.local.get("state")).state.queue.filter(
                (x: any) => x.kind === "live",
              ).length,
          ),
        { timeout: 20000 },
      )
      .toBeGreaterThan(0);
    // Site closed scenario leaves data queued. Opening sync commits and acknowledges it.
    app = await context.newPage();
    app.on("pageerror", (e) => errors.push(e.message));
    await app.goto(base + "#/sync");
    await app.getByRole("button", { name: "立即同步", exact: true }).click();
    await expect
      .poll(() =>
        worker.evaluate(
          async () =>
            (await chrome.storage.local.get("state")).state.queue.length,
        ),
      )
      .toBe(0);
    await app.goto(base + "#/library");
    await expect(app.locator(".progress-caption")).toContainText("8 / 12");
    const other = await context.newPage();
    await other.goto("https://chenru0524.github.io/other/");
    const denied = await other.evaluate(
      (id) =>
        new Promise((resolve) =>
          chrome.runtime.sendMessage(
            id,
            { protocol: "yoru-bahamut-v1", type: "PULL" },
            resolve,
          ),
        ),
      id,
    );
    expect(denied).toMatchObject({ ok: false });
    for (const width of [390, 768, 1440]) {
      await app.setViewportSize({ width, height: 900 });
      await app.goto(base + "#/sync");
      expect(
        await app.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
    expect(errors).toEqual([]);
  } finally {
    await context.close();
    if (profile.startsWith(join(tmpdir(), "yoru-extension-test-")))
      await rm(profile, { recursive: true, force: true });
  }
});

import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
test("sync settings are accessible on mobile and reject an invalid extension ID", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/#/sync");
  await expect(
    page.getByRole("heading", { name: "動畫瘋同步", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "連接並啟用自動同步" }).click();
  await expect(page.getByRole("alert")).toContainText("ID 格式不正確");
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  expect(errors).toEqual([]);
});
const fixture = `<!doctype html><div class="anime_name"><h1>測試 [8]</h1><button onclick="animefun.toggleGather(99,123)">訂閱</button></div><section class="season"><li class="playing"><a data-ani-video-sn="456" href="?sn=456">8</a></li></section><div id="ani_video"><video></video></div>`;
test("actual detector excludes advertisements and seeking; tracks unique played segments", async ({
  page,
}) => {
  await page.route("**/*", (r) =>
    r.fulfill({ contentType: "text/html", body: fixture }),
  );
  await page.clock.install();
  await page.goto("https://ani.gamer.com.tw/animeVideo.php?sn=456");
  await page.evaluate(() => {
    (window as any).captured = [];
    (window as any).chrome = {
      runtime: {
        id: "fixture",
        onMessage: { addListener: () => {} },
        sendMessage: async (m: any) => {
          if (m.type === "STATUS")
            return { ok: true, enabled: true, threshold: 80 };
          if (m.type === "ENQUEUE") (window as any).captured.push(...m.events);
          return { ok: true, progress: null };
        },
      },
    };
    const v = document.querySelector("video")!;
    for (const [key, value] of Object.entries({
      duration: 10,
      readyState: 4,
      paused: false,
      seeking: false,
      currentTime: 0,
    }))
      Object.defineProperty(v, key, {
        value,
        writable: true,
        configurable: true,
      });
  });
  await page.addScriptTag({
    content: await readFile("extension-dist/content.js", "utf8"),
  });
  await page.clock.runFor(1100);
  async function tick(time: number, ad = false) {
    await page.clock.runFor(1000);
    await page.evaluate(
      ({ time, ad }) => {
        const v = document.querySelector("video")!;
        (v as any).currentTime = time;
        document
          .getElementById("ani_video")!
          .classList.toggle("vjs-ad-playing", ad);
        localStorage.setItem(
          "ANIME_BP",
          JSON.stringify({ videoSn: 456, breakPoint: time }),
        );
        v.dispatchEvent(new Event("timeupdate"));
      },
      { time, ad },
    );
  }
  await tick(0);
  await tick(0);
  await tick(9);
  await tick(0, true);
  await tick(9, true);
  expect(await page.evaluate(() => (window as any).captured)).toEqual([]);
  for (let i = 0; i <= 8; i++) await tick(i);
  await expect
    .poll(() => page.evaluate(() => (window as any).captured.length))
    .toBe(1);
  expect(await page.evaluate(() => (window as any).captured[0])).toMatchObject({
    kind: "live",
    seriesId: "123",
    videoId: "456",
    episode: 8,
    ratio: 0.8,
  });
});
test("history DOM import stages genuine fields and loads more before returning", async ({
  page,
}) => {
  const card = (id: number) =>
    `<div class="user-watch-list"><div class="anime-card"><div class="history-anime-title">Fixture ${id}</div><div data-anime-sn="${id}"></div><span class="user-lastwatch">8</span><div class="progress-bar"><div class="progress" style="width:50%"></div></div><a class="play-btn" href="https://ani.gamer.com.tw/animeVideo.php?sn=${id}"></a></div></div>`;
  await page.route("**/*", (r) =>
    r.fulfill({
      contentType: "text/html",
      body: `<div class="history-wrapper">${card(123)}<button class="anime-btn-show-more">更多</button></div><div class="user-watchTime-list" data-anime-sn="123"><a href="https://ani.gamer.com.tw/animeVideo.php?sn=123"><span class="date">2026.09.01 20:15</span></a></div>`,
    }),
  );
  await page.goto("https://ani.gamer.com.tw/viewList.php?u=fixture");
  await page.evaluate((extra) => {
    (window as any).captured = [];
    (window as any).chrome = {
      runtime: {
        id: "fixture",
        onMessage: {
          addListener: (fn: any) => ((window as any).listener = fn),
        },
        sendMessage: async (m: any) => {
          if (m.type === "STATUS")
            return { ok: true, enabled: true, threshold: 80 };
          (window as any).captured.push(...m.events);
          return { ok: true };
        },
      },
    };
    document.querySelector("button")!.onclick = () => {
      document
        .querySelector(".history-wrapper")!
        .insertAdjacentHTML("beforeend", extra);
      document.querySelector("button")!.remove();
    };
  }, card(124));
  await page.addScriptTag({
    content: await readFile("extension-dist/content.js", "utf8"),
  });
  expect(
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          (window as any).listener(
            { type: "IMPORT_HISTORY" },
            { id: "fixture" },
            resolve,
          ),
        ),
    ),
  ).toEqual({ ok: true, count: 2 });
  const events = await page.evaluate(() => (window as any).captured);
  expect(events[0]).toMatchObject({
    kind: "history",
    seriesId: "123",
    episode: 8,
    ratio: 0.5,
    evidence: "site-history",
  });
  expect(events[0].watchedAt).not.toBeNull();
  expect(events[1].watchedAt).toBeNull();
});

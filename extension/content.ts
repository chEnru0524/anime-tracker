import {
  playbackIdentity,
  watchedRatio,
  historyEvents,
  mergeRanges,
} from "../src/bahamut-dom";
let settings = { enabled: false, threshold: 80 };
let notice = "等待正片播放";
async function status() {
  try {
    const r = await chrome.runtime.sendMessage({ type: "STATUS" });
    if (r.ok) settings = { enabled: r.enabled, threshold: r.threshold };
  } catch {
    notice = "擴充功能已更新，請重新整理動畫瘋";
  }
}
void status();
setInterval(() => void status(), 10000);
let key = "",
  ranges: Array<[number, number]> = [],
  previous: { time: number; clock: number } | null = null,
  lastSend = 0,
  sending = false;
let video: HTMLVideoElement | null = null;
const discontinuity = () => {
  previous = null;
};
let loadedKey = "",
  loadingKey = "",
  lastCheckpoint = 0,
  savedDuration = 0;
function reset() {
  ranges = [];
  previous = null;
  lastSend = 0;
}
async function sample() {
  if (!video || !settings.enabled) {
    previous = null;
    return;
  }
  const identity = playbackIdentity(document, location.href);
  if (!identity) {
    notice = "無法識別單集，暫停記錄";
    previous = null;
    return;
  }
  if (identity.videoId !== key) {
    key = identity.videoId;
    reset();
    loadedKey = "";
    savedDuration = 0;
  }
  if (loadedKey !== key) {
    if (loadingKey === key) return;
    const capturedKey = key;
    loadingKey = key;
    try {
      const r = await chrome.runtime.sendMessage({
        type: "LOAD_PROGRESS",
        videoId: key,
      });
      if (key !== capturedKey) return;
      if (r.ok && r.progress) {
        ranges = r.progress.ranges;
        savedDuration = r.progress.duration;
      }
      loadedKey = key;
    } catch {
      notice = "無法讀取本機播放紀錄，將重試";
    } finally {
      loadingKey = "";
    }
    return;
  }
  const player = video.closest("#ani_video");
  const ad = player?.matches(
    ".vjs-ad-playing,.vjs-anigamer-ad-playing,.vjs-ad-loading,.vjs-ad-loading-overlay",
  );
  // ANIME_BP is the site's non-secret resume record. Read only these two known fields.
  let main = false;
  try {
    const bp = JSON.parse(localStorage.getItem("ANIME_BP") ?? "null");
    main =
      String(bp?.videoSn) === key &&
      Math.abs(Number(bp.breakPoint) - video.currentTime) < 12;
  } catch {}
  if (
    ad ||
    !main ||
    video.seeking ||
    (video.paused && !video.ended) ||
    video.readyState < 2 ||
    !Number.isFinite(video.duration) ||
    video.duration <= 0
  ) {
    previous = null;
    notice = ad ? "廣告播放中，不列入進度" : "等待可辨識的正片播放";
    return;
  }
  if (savedDuration && Math.abs(savedDuration - video.duration) >= 1) reset();
  savedDuration = video.duration;
  const now = performance.now(),
    time = video.currentTime;
  if (previous) {
    const delta = time - previous.time,
      wall = (now - previous.clock) / 1000;
    if (
      delta > 0 &&
      delta <= wall * Math.max(1, video.playbackRate) + 0.75 &&
      wall < 10
    )
      ranges.push([previous.time, time]);
  }
  previous = { time, clock: now };
  // Coalesce intervals to keep memory bounded during long episodes and rewinds.
  ranges = mergeRanges(ranges);
  if (Date.now() - lastCheckpoint > 15000) {
    lastCheckpoint = Date.now();
    void chrome.runtime
      .sendMessage({
        type: "SAVE_PROGRESS",
        videoId: key,
        progress: { duration: video.duration, ranges },
      })
      .then((r) => {
        if (!r.ok) notice = r.error;
      })
      .catch(() => {
        notice = "播放片段暫存失敗";
      });
  }
  const ratio = watchedRatio(ranges, video.duration);
  notice = `正片實際播放 ${Math.floor(ratio * 100)}%／門檻 ${settings.threshold}%`;
  if (
    ratio * 100 + 0.001 < settings.threshold ||
    Date.now() - lastSend < 60000 ||
    sending
  )
    return;
  sending = true;
  try {
    const at = new Date().toISOString();
    const r = await chrome.runtime.sendMessage({
      type: "ENQUEUE",
      events: [
        {
          ...identity,
          id: `live:${key}:${Math.floor(Date.now() / 60000)}`,
          kind: "live",
          watchedAt: at,
          capturedAt: at,
          ratio,
          threshold: settings.threshold,
          evidence: "played-ranges",
        },
      ],
    });
    if (!r.ok) throw new Error(r.error);
    lastSend = Date.now();
    notice = "已達門檻，已加入本機同步佇列";
  } catch (e) {
    notice = e instanceof Error ? e.message : "暫存失敗，稍後重試";
  } finally {
    sending = false;
  }
}
setInterval(() => {
  const found = document.querySelector<HTMLVideoElement>(
    "#ani_video video,video#ani_video_html5_api",
  );
  if (found !== video) {
    video?.removeEventListener("timeupdate", sample);
    video?.removeEventListener("seeking", discontinuity);
    video?.removeEventListener("loadstart", discontinuity);
    video = found;
    reset();
    loadedKey = "";
    savedDuration = 0;
    video?.addEventListener("timeupdate", sample);
    video?.addEventListener("seeking", discontinuity);
    video?.addEventListener("loadstart", discontinuity);
  }
}, 1000);
let importing = false;
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (sender.id !== chrome.runtime.id) return;
  if (message.type === "PAGE_STATUS") {
    reply({ ok: true, notice });
    return;
  }
  if (message.type !== "IMPORT_HISTORY") return;
  if (importing) {
    reply({ ok: false, error: "正在匯入，請稍候" });
    return;
  }
  importing = true;
  void (async () => {
    await status();
    if (!settings.enabled) throw new Error("請先啟用擴充功能同步");
    if (
      location.pathname !== "/viewList.php" ||
      !document.querySelector(".history-wrapper")
    )
      throw new Error("請先登入動畫瘋並開啟觀看紀錄頁");
    let pages = 0;
    // Use the site's own button and authenticated request. Never read cookies or fetch credentials.
    while (pages < 100) {
      const button = document.querySelector<HTMLElement>(
        ".history-wrapper .anime-btn-show-more",
      );
      if (!button) break;
      const before = document.querySelectorAll(
        ".history-wrapper .anime-card",
      ).length;
      button.click();
      pages++;
      let loaded = false;
      for (let i = 0; i < 40; i++) {
        await new Promise((r) => setTimeout(r, 250));
        if (
          document.querySelectorAll(".history-wrapper .anime-card").length >
          before
        ) {
          loaded = true;
          break;
        }
      }
      if (!loaded)
        throw new Error("載入更多紀錄失敗，請在動畫瘋確認頁面後重新匯入");
    }
    if (document.querySelector(".anime-btn-show-more"))
      throw new Error("紀錄超過一次匯入上限，請先處理目前資料");
    const events = historyEvents(document, settings.threshold);
    if (!events.length)
      throw new Error("目前沒有可識別的觀看紀錄；請確認已登入且頁面載入完成");
    for (let i = 0; i < events.length; i += 100) {
      const r = await chrome.runtime.sendMessage({
        type: "ENQUEUE",
        events: events.slice(i, i + 100),
      });
      if (!r.ok) throw new Error(r.error);
    }
    return { ok: true, count: events.length };
  })()
    .then(reply, (e: Error) => reply({ ok: false, error: e.message }))
    .finally(() => {
      importing = false;
    });
  return true;
});

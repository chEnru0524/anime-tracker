import { z } from "zod";
import {
  trustedTracker,
  aniVideoId,
  watchEventSchema,
  type WatchEvent,
} from "../src/bahamut-schema";
import { mergeRanges } from "../src/bahamut-dom";
type State = {
  enabled: boolean;
  threshold: number;
  queue: WatchEvent[];
  lastError: string;
  lastCapture: string | null;
};
const defaults: State = {
  enabled: false,
  threshold: 80,
  queue: [],
  lastError: "",
  lastCapture: null,
};
let jobs = Promise.resolve();
chrome.storage.local
  .setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" })
  .catch(() => {});
async function state(): Promise<State> {
  return {
    ...defaults,
    ...((await chrome.storage.local.get("state")).state as
      Partial<State> | undefined),
  };
}
function serialized<T>(fn: () => Promise<T>) {
  const result = jobs.then(fn);
  jobs = result.then(
    () => {},
    () => {},
  );
  return result;
}
function contentSender(sender: chrome.runtime.MessageSender) {
  try {
    const u = new URL(sender.url ?? "");
    return (
      sender.id === chrome.runtime.id &&
      sender.frameId === 0 &&
      u.origin === "https://ani.gamer.com.tw" &&
      ["/animeVideo.php", "/viewList.php"].includes(u.pathname)
    );
  } catch {
    return false;
  }
}
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  const popup =
    sender.id === chrome.runtime.id &&
    sender.url === chrome.runtime.getURL("popup.html");
  if (!popup && !contentSender(sender)) {
    reply({ ok: false, error: "來源不允許" });
    return;
  }
  void serialized(async () => {
    const s = await state();
    if (message?.type === "STATUS")
      return {
        ok: true,
        enabled: s.enabled,
        threshold: s.threshold,
        count: s.queue.length,
        lastError: s.lastError,
        lastCapture: s.lastCapture,
      };
    if (["LOAD_PROGRESS", "SAVE_PROGRESS"].includes(message?.type) && !popup) {
      const videoId = aniVideoId(sender.url!);
      if (!videoId || message.videoId !== videoId)
        throw new Error("單集來源不符");
      const data = ((await chrome.storage.local.get("progress")).progress ??
        {}) as Record<
        string,
        { duration: number; ranges: Array<[number, number]>; at: number }
      >;
      if (message.type === "LOAD_PROGRESS")
        return { ok: true, progress: data[videoId] ?? null };
      if (!s.enabled) throw new Error("同步已暫停");
      const p = z
        .object({
          duration: z.number().positive().max(86400),
          ranges: z
            .array(
              z.tuple([
                z.number().min(0).max(86400),
                z.number().min(0).max(86400),
              ]),
            )
            .max(5000),
        })
        .parse(message.progress);
      const old = data[videoId];
      data[videoId] = {
        duration: p.duration,
        ranges: mergeRanges([
          ...(old && Math.abs(old.duration - p.duration) < 1 ? old.ranges : []),
          ...p.ranges,
        ]),
        at: Date.now(),
      };
      const keys = Object.keys(data).sort((a, b) => data[b].at - data[a].at);
      for (const k of keys.slice(500)) delete data[k];
      await chrome.storage.local.set({ progress: data });
      return { ok: true };
    }
    if (message?.type === "CONFIG" && popup) {
      const v = z
        .object({
          enabled: z.boolean(),
          threshold: z.number().int().min(1).max(100),
        })
        .parse(message.value);
      await chrome.storage.local.set({ state: { ...s, ...v } });
      return { ok: true };
    }
    if (message?.type === "ENQUEUE" && !popup) {
      if (!s.enabled) throw new Error("同步已暫停");
      const events = z.array(watchEventSchema).max(2000).parse(message.events);
      const path = new URL(sender.url!).pathname;
      for (const e of events) {
        if (
          (e.kind === "live" &&
            (path !== "/animeVideo.php" ||
              aniVideoId(sender.url!) !== e.videoId)) ||
          (e.kind === "history" && path !== "/viewList.php")
        )
          throw new Error("事件來源不符");
        if (e.kind === "live" && (e.ratio ?? 0) * 100 + 0.001 < s.threshold)
          continue;
        if (!s.queue.some((x) => x.id === e.id))
          s.queue.push({ ...e, threshold: s.threshold });
      }
      if (s.queue.length > 5000)
        throw new Error("佇列已滿；請開啟夜番接收資料後重試。");
      s.lastCapture = new Date().toISOString();
      s.lastError = "";
      await chrome.storage.local.set({ state: s });
      return { ok: true, count: s.queue.length };
    }
    throw new Error("不支援的訊息");
  }).then(reply, async (e: Error) => {
    reply({ ok: false, error: e.message });
  });
  return true;
});
chrome.runtime.onMessageExternal.addListener((message, sender, reply) => {
  // Manifest match patterns cannot isolate a GitHub Pages project; enforce its path here.
  if (sender.id || !trustedTracker(sender.url ?? "")) {
    reply({ ok: false, error: "来源不允許" });
    return;
  }
  void serialized(async () => {
    const s = await state();
    if (message?.protocol !== "yoru-bahamut-v1") throw new Error("協定不符");
    if (message.type === "PING")
      return {
        ok: true,
        enabled: s.enabled,
        threshold: s.threshold,
        count: s.queue.length,
      };
    if (!s.enabled) throw new Error("請在擴充功能中啟用同步");
    if (message.type === "PULL")
      return { ok: true, events: s.queue.slice(0, 100), count: s.queue.length };
    if (message.type === "ACK") {
      const ids = z
        .array(z.string().min(1).max(180))
        .max(100)
        .parse(message.ids);
      s.queue = s.queue.filter((e) => !ids.includes(e.id));
      await chrome.storage.local.set({ state: s });
      return { ok: true };
    }
    throw new Error("不支援的訊息");
  }).then(reply, (e: Error) => reply({ ok: false, error: e.message }));
  return true;
});

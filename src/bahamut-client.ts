import { useEffect } from "react";
import { receiveEvents, applyMappedLive } from "./bahamut-db";
import { useStore } from "./store";
let running = false;
export let connectionStatus = "尚未連接擴充功能";
function report(message: string) {
  connectionStatus = message;
  window.dispatchEvent(new Event("yoru-sync-status"));
}
export function extensionRequest(
  id: string,
  type: "PING" | "PULL" | "ACK",
  ids?: string[],
): Promise<any> {
  return new Promise((resolve, reject) => {
    if (!/^[a-p]{32}$/.test(id)) {
      reject(new Error("擴充功能 ID 格式不正確"));
      return;
    }
    if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) {
      reject(new Error("請在安裝擴充功能的 Chrome／Edge 開啟正式夜番網站"));
      return;
    }
    const timeout = setTimeout(
      () => reject(new Error("擴充功能連線逾時，待同步資料仍保留")),
      12000,
    );
    try {
      chrome.runtime.sendMessage(
        id,
        { protocol: "yoru-bahamut-v1", type, ids },
        (r) => {
          clearTimeout(timeout);
          if (chrome.runtime.lastError) {
            reject(
              new Error("找不到擴充功能，請確認 ID、安裝狀態與使用同一瀏覽器"),
            );
            return;
          }
          if (!r?.ok) {
            reject(new Error(r?.error || "擴充功能回應不正確"));
            return;
          }
          resolve(r);
        },
      );
    } catch {
      clearTimeout(timeout);
      reject(new Error("此瀏覽器無法連接擴充功能"));
    }
  });
}
export async function syncNow(id: string) {
  if (running) return;
  running = true;
  try {
    let received = 0;
    for (let i = 0; i < 50; i++) {
      const response = await extensionRequest(id, "PULL");
      if (!Array.isArray(response.events))
        throw new Error("同步資料格式不正確");
      if (!response.events.length) break;
      const ids = await receiveEvents(response.events);
      // Acknowledge only after both inbox and collection have durably committed.
      await extensionRequest(id, "ACK", ids);
      received += ids.length;
    }
    await applyMappedLive();
    report(
      `已連接 · ${new Date().toLocaleTimeString("zh-TW")} · 本次接收 ${received} 筆`,
    );
  } catch (e) {
    report(e instanceof Error ? e.message : "同步失敗，稍後重試");
    throw e;
  } finally {
    running = false;
  }
}
export function BahamutSync() {
  const s = useStore(),
    config = s.settings.bahamut;
  useEffect(() => {
    const reload = () => void s.reload();
    window.addEventListener("yoru-bahamut", reload);
    return () => window.removeEventListener("yoru-bahamut", reload);
  }, []);
  useEffect(() => {
    if (!s.ready || !config?.enabled) return;
    const run = () => void syncNow(config.extensionId).catch(() => {});
    run();
    const timer = setInterval(run, 15000);
    window.addEventListener("focus", run);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", run);
    };
  }, [s.ready, config?.enabled, config?.extensionId]);
  return null;
}

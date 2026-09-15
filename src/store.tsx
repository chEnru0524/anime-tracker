import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import * as db from "./db";
import {
  clampProgress,
  newRecord,
  recordSchema,
  type Anime,
  type RecordEntry,
  type Settings,
  type Status,
} from "./model";
type Store = {
  records: RecordEntry[];
  settings: Settings;
  ready: boolean;
  error: string;
  busy: boolean;
  notice: string;
  clearNotice: () => void;
  reload: () => Promise<void>;
  add: (a: Anime, s: Status) => Promise<void>;
  save: (r: RecordEntry) => Promise<boolean>;
  remove: (id: number) => Promise<void>;
  adjust: (id: number, delta: number) => Promise<void>;
  setSettings: (s: Settings) => Promise<void>;
};
const Context = createContext<Store>(null!);
export function StoreProvider({ children }: { children: ReactNode }) {
  const [records, setRecords] = useState<RecordEntry[]>([]),
    [settings, changeSettings] = useState<Settings>({ region: "台灣" }),
    [ready, setReady] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const current = useRef(records);
  current.current = records;
  const lock = useRef(false);
  async function reload() {
    try {
      const [r, s] = await Promise.all([db.readLibrary(), db.readSettings()]);
      setRecords(r);
      current.current = r;
      changeSettings(s);
      setError("");
    } catch {
      setError("無法開啟本機資料庫。請允許瀏覽器儲存資料，再重新整理。");
    } finally {
      setReady(true);
    }
  }
  useEffect(() => {
    void reload();
    const channel =
      typeof BroadcastChannel !== "undefined"
        ? new BroadcastChannel("yoru")
        : null;
    if (channel) channel.onmessage = () => void reload();
    return () => channel?.close();
  }, []);
  useEffect(() => {
    if (notice) {
      const t = setTimeout(() => setNotice(""), 4000);
      return () => clearTimeout(t);
    }
  }, [notice]);
  async function mutate(fn: () => Promise<void>, message: string) {
    if (lock.current) return false;
    lock.current = true;
    setBusy(true);
    try {
      await fn();
      await reload();
      setNotice(message);
      if (typeof BroadcastChannel !== "undefined") {
        const c = new BroadcastChannel("yoru");
        c.postMessage("changed");
        c.close();
      }
      return true;
    } catch {
      setNotice("儲存失敗，請檢查瀏覽器儲存空間。變更尚未保存。");
      return false;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function save(r: RecordEntry) {
    return mutate(
      () => db.saveRecord(recordSchema.parse(r)).then(() => undefined),
      "已儲存觀看紀錄",
    );
  }
  async function add(a: Anime, s: Status) {
    const existing = current.current.find(
      (r) =>
        r.anime.id === a.id ||
        (a.ja && r.anime.ja === a.ja && r.anime.year === a.year),
    );
    if (existing) {
      setNotice("這部動畫已在你的收藏中");
      return;
    }
    await save(newRecord(a, s));
  }
  async function adjust(id: number, delta: number) {
    const r = current.current.find((x) => x.anime.id === id);
    if (!r) return;
    const progress = clampProgress(r.progress + delta, r.anime.episodes);
    if (progress === r.progress) return;
    let status = r.status,
      completedAt = r.completedAt;
    if (
      r.anime.episodes !== null &&
      progress === r.anime.episodes &&
      delta > 0 &&
      window.confirm("已達總集數，要將這部動畫標記為「已看完」嗎？")
    ) {
      status = "completed";
      completedAt = new Date().toISOString();
    }
    if (
      status === "completed" &&
      r.anime.episodes !== null &&
      progress < r.anime.episodes
    ) {
      status = "watching";
      completedAt = null;
    }
    await save({
      ...r,
      progress,
      status,
      completedAt,
      lastWatched: new Date().toISOString(),
    });
  }
  return (
    <Context.Provider
      value={{
        records,
        settings,
        ready,
        error,
        busy,
        notice,
        clearNotice: () => setNotice(""),
        reload,
        add,
        save,
        adjust,
        remove: async (id) => {
          await mutate(() => db.deleteRecord(id), "已移除收藏");
        },
        setSettings: async (s) => {
          await mutate(
            () => db.saveSettings(s).then(() => undefined),
            "設定已儲存",
          );
        },
      }}
    >
      {children}
    </Context.Provider>
  );
}
export const useStore = () => useContext(Context);

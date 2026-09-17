import { useEffect, useMemo, useRef, useState } from "react";
import { openDB } from "idb";
import { type User } from "@supabase/supabase-js";
import {
  cloudClient,
  configSchema,
  readCloudConfig,
  readCloud,
  writeCloud,
  type CloudRow,
} from "./cloud";
import { makeBackup, restoreBackup } from "./db";
import { useStore } from "./store";
import { type Backup } from "./model";

export function CloudPage() {
  const store = useStore();
  const [config, setConfig] = useState(readCloudConfig);
  const [url, setUrl] = useState(config?.url ?? ""),
    [key, setKey] = useState(config?.key ?? "");
  const client = useMemo(() => (config ? cloudClient(config) : null), [config]);
  const [user, setUser] = useState<User | null>(null),
    [email, setEmail] = useState(""),
    [code, setCode] = useState("");
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const [remote, setRemote] = useState<CloudRow | null | undefined>(undefined);
  const [preview, setPreview] = useState<Backup | null>(null);
  const lock = useRef(false);
  useEffect(() => {
    setRemote(undefined);
    setPreview(null);
    setUser(null);
    if (!client) return;
    const { data } = client.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setRemote(undefined);
      setPreview(null);
    });
    return () => {
      data.subscription.unsubscribe();
      client.auth.stopAutoRefresh();
    };
  }, [client]);
  async function run(fn: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setMessage("");
    try {
      await fn();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "操作失敗，本機資料仍保留。",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function inspect() {
    setPreview(null);
    setRemote(await readCloud(client!));
    setMessage("已讀取雲端摘要，尚未更動本機或雲端收藏。");
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">YOUR LIBRARY, EVERYWHERE</p>
          <h1>帳號與雲端紀錄</h1>
          <p className="subtitle">
            用相同 Email 登入，存取自己的收藏、進度與備註。
          </p>
        </div>
      </div>
      <section className="panel cloud-panel">
        <p>
          本機紀錄照常離線使用。編輯完成後按「上傳本機紀錄」；換裝置登入後按「載入雲端紀錄」。目前採手動同步，避免多台裝置互相覆蓋。
        </p>
        {!config ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                const c = configSchema.parse({
                  url: url.trim(),
                  key: key.trim(),
                });
                localStorage.setItem("yoru-cloud-config", JSON.stringify(c));
                setConfig(c);
              });
            }}
          >
            <h2>首次連接雲端</h2>
            <p>
              先依專案 README 的雲端設定步驟建立 Supabase 專案並執行
              supabase.sql。所有裝置使用相同專案設定。
            </p>
            <label>
              Project URL
              <input
                required
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://專案編號.supabase.co"
              />
            </label>
            <label>
              Publishable key
              <input
                required
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder="sb_publishable_…"
              />
            </label>
            <p className="muted">
              這是可公開的專案識別設定。請勿輸入 secret、service_role key
              或資料庫密碼。
            </p>
            <button disabled={busy}>儲存連線設定</button>
          </form>
        ) : !user ? (
          <>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void run(async () => {
                  const { error } = await client!.auth.signInWithOtp({
                    email: email.trim(),
                  });
                  if (error)
                    throw new Error(
                      "無法寄出驗證碼，請稍後再試，並確認 Email 與郵件服務設定。",
                    );
                  setMessage(
                    "驗證郵件已寄出。請輸入信中的驗證碼；若收到連結，管理者需依 README 調整郵件範本。",
                  );
                });
              }}
            >
              <label>
                Email
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setCode("");
                  }}
                />
              </label>
              <button disabled={busy}>寄送登入驗證碼</button>
            </form>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void run(async () => {
                  const { error } = await client!.auth.verifyOtp({
                    email: email.trim(),
                    token: code.trim(),
                    type: "email",
                  });
                  if (error)
                    throw new Error("驗證碼無效或已過期，請重新取得。");
                  setCode("");
                  setMessage("登入成功，請讀取雲端摘要。");
                });
              }}
            >
              <label>
                驗證碼
                <input
                  required
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                />
              </label>
              <button disabled={busy || !email}>驗證並登入</button>
            </form>
            <button
              disabled={busy}
              onClick={() => {
                localStorage.removeItem("yoru-cloud-config");
                setConfig(null);
              }}
            >
              更換專案設定
            </button>
          </>
        ) : (
          <>
            <p>
              已登入：<strong>{user.email}</strong>
            </p>
            <p className="muted">
              登入狀態會儲存在此瀏覽器。共用裝置使用完畢請登出；登出仍保留本機收藏。
            </p>
            <div className="bulk-actions">
              <button disabled={busy} onClick={() => void run(inspect)}>
                讀取雲端摘要
              </button>
              <button
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    const { error } = await client!.auth.signOut({
                      scope: "local",
                    });
                    if (error) throw error;
                    setMessage("已登出。本機收藏仍保留，可從備份頁管理。");
                  })
                }
              >
                登出
              </button>
            </div>
            {remote !== undefined && (
              <>
                <p>
                  本機 {store.records.length} 部 · 雲端{" "}
                  {remote?.payload.records.length ?? 0} 部
                  {remote &&
                    ` · 版本 ${remote.revision} · ${new Date(remote.updated_at).toLocaleString()}`}
                </p>
                <div className="bulk-actions">
                  <button
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        const backup = await makeBackup();
                        if (
                          !window.confirm(
                            `將本機 ${backup.records.length} 部收藏與個人備註上傳至 ${user.email} 的 Supabase 雲端，取代目前雲端 ${remote?.payload.records.length ?? 0} 部紀錄？此動作也同步移除項目。`,
                          )
                        )
                          return;
                        await writeCloud(
                          client!,
                          backup,
                          remote?.revision ?? 0,
                        );
                        await inspect();
                        setMessage("已上傳。其他裝置可登入同一帳號載入。");
                      })
                    }
                  >
                    上傳本機紀錄
                  </button>
                  <button
                    disabled={busy || !remote}
                    onClick={() => setPreview(remote!.payload)}
                  >
                    載入雲端紀錄
                  </button>
                </div>
              </>
            )}
            {preview && (
              <div className="warning">
                <h3>還原預覽</h3>
                <p>
                  將以雲端 {preview.records.length} 部動畫取代此裝置的{" "}
                  {store.records.length}{" "}
                  部；包含觀看進度、評分、備註、平台與動畫瘋配對。擴充功能需在本機重新啟用。
                </p>
                <button
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      if (
                        !window.confirm(
                          "確定以預覽的雲端版本取代本機紀錄？目前資料會先保存在本機還原點。",
                        )
                      )
                        return;
                      const recovery = await openDB("yoru-cloud-recovery", 1, {
                        upgrade(db) {
                          db.createObjectStore("backup");
                        },
                      });
                      await recovery.put(
                        "backup",
                        await makeBackup(),
                        "before-restore",
                      );
                      recovery.close();
                      await restoreBackup(preview);
                      await store.reload();
                      setPreview(null);
                      setMessage("已載入雲端紀錄。");
                    })
                  }
                >
                  確認還原
                </button>
                <button disabled={busy} onClick={() => setPreview(null)}>
                  取消
                </button>
              </div>
            )}
          </>
        )}
        <p role="status">{message}</p>
        <button
          disabled={busy}
          onClick={() =>
            void run(async () => {
              const recovery = await openDB("yoru-cloud-recovery", 1, {
                upgrade(db) {
                  db.createObjectStore("backup");
                },
              });
              const data = await recovery.get("backup", "before-restore");
              recovery.close();
              if (!data) throw new Error("目前沒有雲端還原前的本機還原點。");
              const link = document.createElement("a");
              link.href = URL.createObjectURL(
                new Blob([JSON.stringify(data)], { type: "application/json" }),
              );
              link.download = "yoru-before-cloud-restore.json";
              link.click();
              setTimeout(() => URL.revokeObjectURL(link.href), 1000);
              setMessage("已下載還原點，可至備份頁匯入。");
            })
          }
        >
          下載上次還原前的本機備份
        </button>
      </section>
    </>
  );
}

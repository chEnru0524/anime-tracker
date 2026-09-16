import { useRef, useState } from "react";
import { Download, Upload, Database, Check, BarChart3 } from "lucide-react";
import { useStore } from "./store";
import { backupSchema, statuses, type Backup } from "./model";
import { makeBackup, restoreBackup } from "./db";
export function Stats() {
  const s = useStore(),
    ratings = s.records.filter((r) => r.rating !== null),
    total = s.records.reduce((sum, r) => sum + r.progress, 0);
  const years: Record<string, number> = {};
  s.records
    .filter((r) => r.status === "completed" && r.completedAt)
    .forEach((r) => {
      const y = new Date(r.completedAt!).getFullYear();
      years[y] = (years[y] ?? 0) + 1;
    });
  const max = Math.max(1, ...Object.values(years));
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">EVERY EPISODE COUNTS</p>
          <h1>我的動漫足跡</h1>
          <p className="subtitle">那些度過的時光，都在這裡。</p>
        </div>
      </div>
      <div className="stats-overview">
        <div>
          <Database size={23} />
          <span>收藏動畫總數</span>
          <strong>
            {s.records.length}
            <small> 部</small>
          </strong>
        </div>
        <div>
          <Check size={23} />
          <span>已觀看總集數</span>
          <strong>
            {total}
            <small> 集</small>
          </strong>
        </div>
        <div>
          <BarChart3 size={23} />
          <span>個人平均評分</span>
          <strong>
            {ratings.length
              ? (
                  ratings.reduce((sum, r) => sum + r.rating!, 0) /
                  ratings.length
                ).toFixed(1)
              : "—"}
            <small> / 10</small>
          </strong>
        </div>
      </div>
      <div className="stats-layout">
        <section className="panel">
          <h2>觀看狀態分布</h2>
          <p className="muted">共 {s.records.length} 部收藏</p>
          <div className="status-chart">
            {Object.entries(statuses).map(([k, label]) => {
              const count = s.records.filter((r) => r.status === k).length;
              return (
                <div key={k}>
                  <span>{label}</span>
                  <div>
                    <i
                      style={{
                        width: `${s.records.length ? (count / s.records.length) * 100 : 0}%`,
                      }}
                    />
                  </div>
                  <b>{count}</b>
                </div>
              );
            })}
          </div>
        </section>
        <section className="panel">
          <h2>每年完成動畫數</h2>
          <p className="muted">依標記「已看完」的日期計算</p>
          {Object.keys(years).length ? (
            <div className="year-chart">
              {Object.entries(years)
                .sort()
                .map(([y, n]) => (
                  <div key={y}>
                    <span>{n} 部</span>
                    <div>
                      <i style={{ height: `${(n / max) * 100}%` }} />
                    </div>
                    <b>{y}</b>
                  </div>
                ))}
            </div>
          ) : (
            <div className="stats-empty">
              看完一部動畫後，
              <br />
              這裡就會留下你的第一個足跡。
            </div>
          )}
        </section>
      </div>
    </>
  );
}
export function BackupPage() {
  const s = useStore(),
    [pending, setPending] = useState<Backup | null>(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    input = useRef<HTMLInputElement>(null);
  async function exportData() {
    try {
      const data = await makeBackup(),
        blob = new Blob([JSON.stringify(data, null, 2)], {
          type: "application/json",
        }),
        url = URL.createObjectURL(blob),
        a = document.createElement("a");
      a.href = url;
      a.download = `yoru-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage("備份已下載。請妥善保存 JSON 檔案。");
    } catch {
      setError("匯出失敗，無法讀取本機資料。");
    }
  }
  async function select(file?: File) {
    setError("");
    setPending(null);
    if (!file) return;
    if (file.size > 30 * 1024 * 1024) {
      setError("檔案超過 30 MB，請選擇夜番匯出的 JSON 備份。");
      return;
    }
    try {
      const result = backupSchema.safeParse(JSON.parse(await file.text()));
      if (!result.success) {
        setError("備份格式不正確或版本不支援。原有資料未變更。");
        return;
      }
      setPending(result.data);
    } catch {
      setError("無法讀取 JSON 檔案。原有資料未變更。");
    } finally {
      if (input.current) input.current.value = "";
    }
  }
  async function restore() {
    if (!pending) return;
    if (
      !window.confirm(
        `即將以備份的 ${pending.records.length} 部動畫取代目前 ${s.records.length} 部收藏與設定。確定還原嗎？`,
      )
    )
      return;
    setBusy(true);
    try {
      await restoreBackup(pending);
      await s.reload();
      setPending(null);
      setMessage("還原完成，觀看紀錄與設定已更新。");
    } catch {
      setError("還原失敗，原有資料未被覆蓋。");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">KEEP YOUR STORIES SAFE</p>
          <h1>資料與備份</h1>
          <p className="subtitle">把珍藏的觀看紀錄，安心帶著走。</p>
        </div>
      </div>
      <div className="storage-info">
        <Database size={28} />
        <div>
          <h3>你的資料，保存在這台裝置</h3>
          <p>
            目前收藏 {s.records.length}{" "}
            部動畫。瀏覽器清除網站資料、無痕模式結束，或更換裝置都可能失去紀錄，請定期匯出備份。
          </p>
        </div>
      </div>
      <div className="backup-grid">
        <section className="panel">
          <Download size={26} />
          <h2>匯出資料</h2>
          <p>
            將收藏、進度、評分、備註、自訂平台與個人設定，儲存成一份 JSON 檔案。
          </p>
          <button className="primary" onClick={() => void exportData()}>
            <Download size={16} />
            下載備份檔
          </button>
        </section>
        <section className="panel">
          <Upload size={26} />
          <h2>匯入資料</h2>
          <p>選擇之前匯出的備份。確認摘要後，才會取代目前的收藏與設定。</p>
          <input
            ref={input}
            type="file"
            accept="application/json,.json"
            aria-label="選擇 JSON 備份"
            onChange={(e) => void select(e.target.files?.[0])}
          />
        </section>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="success" role="status">
          {message}
        </p>
      )}
      {pending && (
        <section className="panel import-summary">
          <h2>確認備份內容</h2>
          <p>
            匯出時間：{new Date(pending.exportedAt).toLocaleString("zh-TW")}
          </p>
          <p>
            備份版本：{pending.version} · 收藏：{pending.records.length} 部 ·
            總觀看：{pending.records.reduce((n, r) => n + r.progress, 0)} 集
          </p>
          <p>
            {Object.entries(statuses)
              .map(
                ([k, v]) =>
                  `${v} ${pending.records.filter((r) => r.status === k).length} 部`,
              )
              .join(" ｜ ")}
          </p>
          <p>
            優先地區：{pending.settings.region} · 自訂平台：
            {pending.records.reduce(
              (n, r) => n + (r.customPlatforms?.length ?? 0),
              0,
            )}{" "}
            個
          </p>
          <p className="warning">
            還原會取代目前的 {s.records.length} 部收藏。建議先下載目前的備份。
          </p>
          <div className="action-row">
            <button
              className="primary"
              disabled={busy}
              onClick={() => void restore()}
            >
              確認還原並取代資料
            </button>
            <button disabled={busy} onClick={() => setPending(null)}>
              取消
            </button>
          </div>
        </section>
      )}
      <section className="panel preferences">
        <h2>個人設定</h2>
        <label>
          優先顯示的觀看地區
          <select
            aria-label="優先觀看地區"
            value={s.settings.region}
            onChange={(e) =>
              void s.setSettings({ ...s.settings, region: e.target.value })
            }
          >
            <option>台灣</option>
            <option>香港</option>
            <option>日本</option>
            <option>其他地區</option>
          </select>
        </label>
        <p>平台排序會優先顯示此地區；地區未知的平台不會被推定為可觀看。</p>
      </section>
    </>
  );
}

import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ExternalLink,
  Plus,
  Save,
  Trash2,
  Star,
} from "lucide-react";
import { provider } from "./api";
import { useStore } from "./store";
import { AddButtons, Cover, Loading, Progress, dateLabel } from "./components";
import {
  airingLabels,
  clampProgress,
  platforms,
  platformSchema,
  seasons,
  statuses,
  title,
  type Anime,
  type RecordEntry,
  type Platform,
} from "./model";
export function Detail() {
  const { id } = useParams(),
    location = useLocation(),
    s = useStore(),
    record = s.records.find((r) => r.anime.id === Number(id));
  const [anime, setAnime] = useState<Anime | undefined>(
      record?.anime ?? location.state?.anime,
    ),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setAnime(record?.anime ?? location.state?.anime);
    setLoading(true);
    setError("");
    if (record?.anime.bahamutSeriesId) {
      setLoading(false);
      return;
    }
    if (!/^\d+$/.test(id ?? "") || Number(id) <= 0) {
      setError("無效的動畫編號");
      setLoading(false);
      return;
    }
    provider
      .detail(Number(id))
      .then((r) => {
        if (active) {
          setAnime(r.anime);
          setError(r.warning ?? "");
        }
      })
      .catch((e) => active && setError(e.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [id, retry]);
  if (!anime)
    return (
      <>
        {loading ? (
          <Loading />
        ) : (
          <div className="error">
            {error}
            <button onClick={() => setRetry((x) => x + 1)}>重試</button>
          </div>
        )}
        <Link to="/library">回到我的動畫</Link>
      </>
    );
  const a = anime;
  const known = platforms(a, record, s.settings.region);
  return (
    <>
      <Link className="back-link" to="/library">
        <ArrowLeft size={16} />
        我的動畫
      </Link>
      {error && (
        <div className="warning">
          {error} {record && "已保留本機收藏資料。"}
          <button onClick={() => setRetry((x) => x + 1)}>重試</button>
        </div>
      )}
      <div className="detail-layout">
        <aside className="detail-poster">
          <Cover anime={a} />
          <a
            className="source-link"
            href={
              a.bahamutSeriesId
                ? known[0]?.url || "https://ani.gamer.com.tw/"
                : `${a.id >= 1000000000 ? "https://bgm.tv/subject/" + (a.id - 1000000000) : "https://myanimelist.net/anime/" + a.id}`
            }
            target="_blank"
            rel="noreferrer"
          >
            {a.bahamutSeriesId
              ? "巴哈姆特動畫瘋"
              : a.id >= 1000000000
                ? "Bangumi"
                : "MyAnimeList"}{" "}
            <ExternalLink size={14} />
          </a>
        </aside>
        <div className="detail-main">
          <div className="detail-badges">
            <span>{a.format}</span>
            <span>{airingLabels[a.airing]}</span>
            <span>
              {a.year ?? "年份未定"} {a.season ? seasons[a.season] : "季度未定"}
            </span>
          </div>
          <h1>{title(a)}</h1>
          <p className="detail-ja">{a.ja || a.title}</p>
          {!a.zh && <p className="muted">中文名稱尚未提供</p>}
          <div className="tags">
            {a.genres.map((g) => (
              <span key={g}>{g}</span>
            ))}
          </div>
          {!record && (
            <div className="detail-add">
              <AddButtons anime={a} />
            </div>
          )}
          <div className="detail-facts">
            <div>
              <span>總集數</span>
              <b>{a.episodes ?? "未定"}</b>
            </div>
            <div>
              <span>首播日期</span>
              <b>{dateLabel(a.start)}</b>
            </div>
            <div>
              <span>完結日期</span>
              <b>{dateLabel(a.end)}</b>
            </div>
          </div>
          <section className="detail-section">
            <h2>關於這部動畫</h2>
            <p className="synopsis">{a.summary || "目前尚無簡介。"}</p>
            {a.aliases.length > 0 && (
              <details>
                <summary>其他名稱</summary>
                <p className="muted">{a.aliases.join(" / ")}</p>
              </details>
            )}
          </section>
          {record && <PersonalEditor key={a.id} anime={a} record={record} />}
          <section className="detail-section">
            <h2>在哪裡看</h2>
            <p className="muted">
              優先顯示 {s.settings.region}
              。台灣標記依據播放資料來源，可能因授權到期而異動；請以平台實際播放結果為準。手動設定優先。
              台灣平台補充來源：
              <a
                href="https://github.com/bangumi-data/bangumi-data"
                target="_blank"
                rel="noreferrer"
              >
                bangumi-data（CC BY 4.0）
              </a>
              。未標示地區的平台不代表台灣可播。
            </p>
            <div className="platform-list">
              {known.map((p, i) => (
                <div className="platform-item" key={p.name + i}>
                  <span className="platform-logo">{p.name.slice(0, 1)}</span>
                  <div>
                    <b>{p.name}</b>
                    <span>
                      {p.region || "地區未確認"} ·{" "}
                      {p.source === "manual" ? "個人設定" : "API 資料"}
                    </span>
                  </div>
                  {p.url ? (
                    <a href={p.url} target="_blank" rel="noopener noreferrer">
                      前往觀看 <ExternalLink size={15} />
                    </a>
                  ) : (
                    <span className="muted">尚無網址</span>
                  )}
                </div>
              ))}
            </div>
            {!known.length && (
              <p className="muted platform-empty">
                目前沒有平台資訊。
                {record
                  ? "可在下方新增自己的觀看平台。"
                  : "加入收藏後，即可新增正版觀看平台。"}
              </p>
            )}
            {record && <PlatformEditor anime={a} record={record} />}
          </section>
          {loading && <p className="muted">正在更新動畫詳細資料…</p>}
        </div>
      </div>
    </>
  );
}
function PersonalEditor({
  anime,
  record,
}: {
  anime: Anime;
  record: RecordEntry;
}) {
  const s = useStore(),
    [draft, setDraft] = useState(record),
    [dirty, setDirty] = useState(false),
    [message, setMessage] = useState("");
  useEffect(() => {
    if (!dirty) setDraft(record);
  }, [record, dirty]);
  function update(p: Partial<RecordEntry>) {
    setDraft((d) => ({ ...d, ...p }));
    setDirty(true);
  }
  async function submit() {
    let status = draft.status;
    const progress = clampProgress(draft.progress, anime.episodes);
    if (progress !== draft.progress) {
      setMessage("觀看集數必須介於 0 與總集數之間。");
      return;
    }
    if (
      status !== "completed" &&
      anime.episodes &&
      progress === anime.episodes &&
      record.progress !== progress &&
      window.confirm("已達總集數，要標記為「已看完」嗎？")
    )
      status = "completed";
    const saved = await s.save({
      ...record,
      ...draft,
      customPlatforms: record.customPlatforms,
      anime,
      status,
      lastWatched:
        progress !== record.progress
          ? new Date().toISOString()
          : draft.lastWatched,
      completedAt:
        status === "completed"
          ? (record.completedAt ?? new Date().toISOString())
          : null,
    });
    if (saved) {
      setDirty(false);
      setMessage("");
    }
  }
  return (
    <section className="personal-panel">
      <div className="section-heading">
        <h2>我的觀看紀錄</h2>
        <Star size={18} />
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="form-grid">
          <label>
            觀看狀態
            <select
              value={draft.status}
              onChange={(e) =>
                update({ status: e.target.value as RecordEntry["status"] })
              }
            >
              {Object.entries(statuses).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label>
            目前觀看集數
            <input
              type="number"
              min="0"
              max={anime.episodes ?? 100000}
              step="1"
              required
              value={draft.progress}
              onChange={(e) => update({ progress: Number(e.target.value) })}
            />
          </label>
          <label>
            個人評分（0–10）
            <input
              type="number"
              min="0"
              max="10"
              step="0.5"
              value={draft.rating ?? ""}
              placeholder="尚未評分"
              onChange={(e) =>
                update({
                  rating: e.target.value === "" ? null : Number(e.target.value),
                })
              }
            />
          </label>
          <label>
            最近觀看日期
            <input
              type="date"
              value={draft.lastWatched?.slice(0, 10) ?? ""}
              onChange={(e) =>
                update({
                  lastWatched: e.target.value
                    ? new Date(e.target.value + "T12:00:00").toISOString()
                    : null,
                })
              }
            />
          </label>
        </div>
        <label className="notes-field">
          個人備註
          <textarea
            rows={4}
            maxLength={20000}
            placeholder="記下喜歡的角色、難忘的一集…"
            value={draft.notes}
            onChange={(e) => update({ notes: e.target.value })}
          />
        </label>
        {message && <p className="warning">{message}</p>}
        <div className="form-actions">
          <span>加入於 {dateLabel(record.addedAt)}</span>
          <button className="primary" disabled={s.busy}>
            <Save size={15} />
            儲存紀錄
          </button>
        </div>
      </form>
      {!dirty && <Progress record={record} />}
      <button
        className="danger-link"
        disabled={s.busy}
        onClick={() => {
          if (window.confirm(`移除「${title(anime)}」及其觀看紀錄？`))
            void s.remove(anime.id);
        }}
      >
        <Trash2 size={14} />
        移除收藏
      </button>
    </section>
  );
}
function PlatformEditor({
  anime,
  record,
}: {
  anime: Anime;
  record: RecordEntry;
}) {
  const s = useStore(),
    [editing, setEditing] = useState(false),
    [rows, setRows] = useState<Platform[]>([]),
    [error, setError] = useState("");
  function start() {
    setRows(
      (record.customPlatforms ?? anime.platforms).map((p) => ({
        ...p,
        source: "manual",
      })),
    );
    setEditing(true);
    setError("");
  }
  function update(i: number, p: Partial<Platform>) {
    setRows((r) => r.map((x, n) => (n === i ? { ...x, ...p } : x)));
  }
  async function save() {
    const parsed = platformSchema.array().max(100).safeParse(rows);
    if (!parsed.success) {
      setError("請填寫平台名稱，網址只能使用有效的 http 或 https 網址。");
      return;
    }
    const saved = await s.save({
      ...record,
      anime,
      customPlatforms: parsed.data,
    });
    if (saved) setEditing(false);
  }
  return editing ? (
    <div className="platform-editor">
      <h3>自訂觀看平台</h3>
      <p className="muted">
        這份清單會優先取代 API 平台。刪除全部平台也會保留你的選擇。
      </p>
      {rows.map((r, i) => (
        <div className="platform-form" key={i}>
          <label>
            平台名稱
            <input
              list="platform-options"
              value={r.name}
              maxLength={100}
              onChange={(e) => update(i, { name: e.target.value })}
            />
          </label>
          <label>
            觀看網址
            <input
              placeholder="https://…"
              type="url"
              value={r.url}
              onChange={(e) => update(i, { url: e.target.value })}
            />
          </label>
          <label>
            可觀看地區
            <input
              value={r.region}
              maxLength={100}
              onChange={(e) => update(i, { region: e.target.value })}
            />
          </label>
          <button
            aria-label={`刪除平台 ${i + 1}`}
            onClick={() => setRows((rs) => rs.filter((_, n) => n !== i))}
          >
            <Trash2 size={15} />
          </button>
        </div>
      ))}
      <datalist id="platform-options">
        {[
          "巴哈姆特動畫瘋",
          "Netflix",
          "Disney+",
          "Crunchyroll",
          "YouTube",
          "其他平台",
        ].map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>
      {error && <p className="error">{error}</p>}
      <div className="action-row">
        <button
          onClick={() =>
            setRows((r) => [
              ...r,
              {
                name: "",
                url: "",
                region: s.settings.region,
                source: "manual",
              },
            ])
          }
        >
          <Plus size={15} />
          新增平台
        </button>
        <button
          className="primary"
          disabled={s.busy}
          onClick={() => void save()}
        >
          儲存平台
        </button>
        <button onClick={() => setEditing(false)}>取消</button>
      </div>
    </div>
  ) : (
    <div className="action-row">
      <button onClick={start}>
        <Plus size={15} />
        管理觀看平台
      </button>
      {record.customPlatforms !== null && (
        <button
          disabled={s.busy}
          onClick={() => {
            if (window.confirm("捨棄自訂平台，恢復 API 提供的平台嗎？"))
              void s.save({ ...record, anime, customPlatforms: null });
          }}
        >
          恢復 API 平台
        </button>
      )}
    </div>
  );
}

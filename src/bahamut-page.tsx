import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useStore } from "./store";
import { title, seasons } from "./model";
import {
  readSync,
  saveBinding,
  removeBinding,
  reviewEvent,
  applyMappedLive,
} from "./bahamut-db";
import {
  type WatchEvent,
  type SyncState,
  emptySyncState,
} from "./bahamut-schema";
import { matchingBinding } from "./bahamut-merge";
import { connectionStatus, extensionRequest, syncNow } from "./bahamut-client";
import "./bahamut.css";
export function BahamutPage() {
  const [selectedEvents, setSelectedEvents] = useState<string[]>([]);
  const s = useStore();
  const [id, setId] = useState(s.settings.bahamut?.extensionId ?? ""),
    [state, setState] = useState<SyncState>(emptySyncState),
    [status, setStatus] = useState(connectionStatus),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function refresh() {
    setState(await readSync());
    setStatus(connectionStatus);
  }
  useEffect(() => {
    const listener = () =>
      void refresh().catch(() => setError("無法讀取同步資料"));
    listener();
    window.addEventListener("yoru-bahamut", listener);
    window.addEventListener("yoru-sync-status", listener);
    return () => {
      window.removeEventListener("yoru-bahamut", listener);
      window.removeEventListener("yoru-sync-status", listener);
    };
  }, []);
  async function run(job: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await job();
      await refresh();
      await s.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "操作失敗，資料仍保留");
    } finally {
      setBusy(false);
    }
  }
  const eligible = state.pending.filter(
    (e) =>
      e.kind === "history" &&
      e.episode !== null &&
      e.ratio !== null &&
      e.ratio * 100 >= e.threshold &&
      matchingBinding(e, state.bindings),
  );
  return (
    <div className="bahamut-sync">
      <div className="page-heading">
        <div>
          <p className="eyebrow">WATCH. CONNECT. CONTINUE.</p>
          <h1>動畫瘋同步</h1>
          <p className="subtitle">在動畫瘋看完，夜番替你記住進度。</p>
        </div>
      </div>
      <section className="panel">
        <h2>連接 Chrome／Edge 擴充功能</h2>
        <p>
          先安裝擴充功能並啟用同步，再貼上它顯示的
          ID。請在同一個瀏覽器使用兩個網站。
        </p>
        <p>
          <a
            href="https://github.com/chEnru0524/anime-tracker/blob/main/extension/README.md"
            target="_blank"
            rel="noreferrer"
          >
            安裝與使用說明
          </a>
          {" · "}
          <a href="./yoru-bahamut-extension.zip" download>
            下載 Chrome／Edge 擴充功能
          </a>
        </p>
        <label>
          擴充功能 ID
          <input
            aria-label="擴充功能 ID"
            value={id}
            onChange={(e) => setId(e.target.value.trim())}
            placeholder="32 個英文字母"
            maxLength={32}
          />
        </label>
        <div className="action-row">
          <button
            disabled={busy}
            className="primary"
            onClick={() =>
              void run(async () => {
                const r = await extensionRequest(id, "PING");
                if (!r.enabled) throw new Error("請先在擴充功能勾選啟用同步");
                await s.setSettings({
                  ...s.settings,
                  bahamut: { extensionId: id, enabled: true },
                });
                await syncNow(id);
              })
            }
          >
            連接並啟用自動同步
          </button>
          <button
            disabled={busy || !s.settings.bahamut}
            onClick={() =>
              void run(() =>
                s.setSettings({
                  ...s.settings,
                  bahamut: { ...s.settings.bahamut!, enabled: false },
                }),
              )
            }
          >
            暫停接收
          </button>
          <button
            disabled={busy || !s.settings.bahamut?.enabled}
            onClick={() =>
              void run(() => syncNow(s.settings.bahamut!.extensionId))
            }
          >
            立即同步
          </button>
        </div>
        <p role="status">
          {s.settings.bahamut?.enabled ? "自動接收已啟用" : "自動接收未啟用"} ·{" "}
          {status}
        </p>
        <p className="muted">
          網站開啟時每 15 秒接收。關閉時先保存在擴充功能，下次開啟補送。門檻預設
          80%，在擴充功能調整。達總集數後保留目前狀態，由你決定是否標記已看完。
        </p>
      </section>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <section className="panel">
        <h2>首次匯入與待確認紀錄（{state.pending.length}）</h2>
        <p>
          日後達標觀看會依動畫瘋作品 ID
          自動加入我的動畫，觀看平台設為巴哈姆特動畫瘋。首次匯入可勾選多筆確認加入，不必先建立收藏。已有季度配對則沿用配對；未配對作品先保留巴哈原始資料，不依名稱猜測季度。
        </p>
        <p>
          首次匯入是網站目前保留的最近觀看快照，不是完整終身紀錄；「觀看結束」沿用動畫瘋判定。未達門檻、特別篇與跨季連續編號需你確認。觀看時間不明時保留原時間。
        </p>
        {!!eligible.length && (
          <button
            disabled={busy}
            onClick={() => {
              if (
                window.confirm(
                  `將匯入 ${eligible.length} 筆已配對且達門檻的紀錄；進度只會增加。確定嗎？`,
                )
              )
                void run(async () => {
                  for (const e of eligible) await reviewEvent(e.id, "apply");
                });
            }}
          >
            匯入已配對且達門檻的 {eligible.length} 筆紀錄
          </button>
        )}
        <div className="bulk-bar">
          <button
            disabled={busy}
            onClick={() =>
              setSelectedEvents(
                state.pending
                  .filter(
                    (e) =>
                      e.episode !== null &&
                      e.ratio !== null &&
                      e.ratio * 100 >= e.threshold &&
                      (matchingBinding(e, state.bindings) ||
                        !state.bindings.some((b) => b.seriesId === e.seriesId)),
                  )
                  .map((e) => e.id),
              )
            }
          >
            選取可直接匯入紀錄
          </button>
          <button onClick={() => setSelectedEvents([])}>取消選取</button>
          <button
            disabled={
              busy || !state.pending.some((e) => selectedEvents.includes(e.id))
            }
            onClick={() => {
              const events = state.pending.filter((e) =>
                selectedEvents.includes(e.id),
              );
              if (
                window.confirm(
                  `確認加入／更新 ${events.length} 筆紀錄？未配對作品依巴哈作品 ID 建立收藏，觀看平台設定為巴哈。`,
                )
              )
                void run(async () => {
                  for (const e of events)
                    await reviewEvent(
                      e.id,
                      "apply",
                      undefined,
                      undefined,
                      true,
                    );
                  setSelectedEvents([]);
                });
            }}
          >
            批次加入我的動畫（
            {state.pending.filter((e) => selectedEvents.includes(e.id)).length}
            ）
          </button>
        </div>
        {!state.pending.length && (
          <p className="muted">
            目前沒有待處理紀錄。已配對的日後觀看會自動更新。
          </p>
        )}
        {state.pending.slice(0, 100).map((e) => (
          <div key={e.id}>
            <label className="bulk-choice">
              <input
                type="checkbox"
                aria-label={`選取紀錄 ${e.title} ${e.episodeLabel}`}
                disabled={
                  busy ||
                  e.episode === null ||
                  e.ratio === null ||
                  e.ratio * 100 < e.threshold ||
                  (!matchingBinding(e, state.bindings) &&
                    state.bindings.some((b) => b.seriesId === e.seriesId))
                }
                checked={selectedEvents.includes(e.id)}
                onChange={(ev) =>
                  setSelectedEvents(
                    ev.target.checked
                      ? [...selectedEvents, e.id]
                      : selectedEvents.filter((id) => id !== e.id),
                  )
                }
              />
              選取匯入
            </label>
            <EventRow event={e} state={state} busy={busy} run={run} />
          </div>
        ))}
        {state.pending.length > 100 && (
          <p>先顯示前 100 筆，處理後會顯示下一批。</p>
        )}
      </section>
      <section className="panel">
        <h2>已確認的作品配對</h2>
        <p>
          以動畫瘋作品 ID 與集數範圍保存。跨季例：動畫瘋 73–96 集 → 夜番 1–24
          集，偏移填 -72。請以實際季度與總集數確認。
        </p>
        {state.bindings.map((b, i) => (
          <div className="sync-binding" key={`${b.seriesId}:${b.from}`}>
            <span>
              動畫瘋 #{b.seriesId} · {b.from}–{b.to} 集 →{" "}
              {s.records.find((r) => r.anime.id === b.animeId)
                ? title(s.records.find((r) => r.anime.id === b.animeId)!.anime)
                : "收藏已移除"}{" "}
              · 偏移 {b.offset}
            </span>
            <button
              disabled={busy}
              onClick={() => void run(() => removeBinding(i))}
            >
              移除配對
            </button>
          </div>
        ))}
        {!state.bindings.length && (
          <p className="muted">
            從待確認紀錄建立一次配對後，之後即可自動同步。
          </p>
        )}
        <p>
          配對與待確認紀錄會包含在<Link to="/backup">JSON 備份</Link>
          。更換瀏覽器後須重新安裝及連接擴充功能。
        </p>
      </section>
    </div>
  );
}
function EventRow({
  event: e,
  state,
  busy,
  run,
}: {
  event: WatchEvent;
  state: SyncState;
  busy: boolean;
  run: (job: () => Promise<unknown>) => Promise<void>;
}) {
  const { records } = useStore(),
    binding = matchingBinding(e, state.bindings);
  const [selected, setSelected] = useState(String(binding?.animeId ?? "")),
    [from, setFrom] = useState(String(binding?.from ?? 1)),
    [to, setTo] = useState(String(binding?.to ?? e.episode ?? 1)),
    [offset, setOffset] = useState(String(binding?.offset ?? 0)),
    [episode, setEpisode] = useState(
      String(e.episode === null ? "" : e.episode + (binding?.offset ?? 0)),
    ),
    [confirmed, setConfirmed] = useState(false);
  const uncertain =
    e.episode === null || e.ratio === null || e.ratio * 100 < e.threshold;
  useEffect(() => {
    if (binding) {
      setSelected(String(binding.animeId));
      setEpisode(String((e.episode ?? 0) + binding.offset));
    }
  }, [binding?.animeId, binding?.offset]);
  const target = records.find((r) => r.anime.id === Number(selected));
  return (
    <article className="sync-event">
      <h3>
        {e.title} [{e.episodeLabel}]
      </h3>
      <p>
        動畫瘋作品 #{e.seriesId} ·{" "}
        {e.kind === "history" ? "首次匯入" : "實際觀看"} ·{" "}
        {e.ratio === null ? "完成比例未定" : `${Math.round(e.ratio * 100)}%`} ·{" "}
        {e.watchedAt
          ? new Date(e.watchedAt).toLocaleString("zh-TW")
          : "觀看時間未定"}
      </p>
      {e.videoId && (
        <a
          href={`https://ani.gamer.com.tw/animeVideo.php?sn=${e.videoId}`}
          target="_blank"
          rel="noreferrer"
        >
          檢查動畫瘋原始單集
        </a>
      )}
      {" · "}
      <Link to={`/search?q=${encodeURIComponent(e.title)}`}>
        搜尋並加入作品
      </Link>
      <div className="sync-fields">
        <label>
          對應我的動畫
          <select
            aria-label={`對應作品 ${e.id}`}
            value={selected}
            onChange={(ev) => {
              setSelected(ev.target.value);
              const r = records.find(
                (r) => r.anime.id === Number(ev.target.value),
              );
              if (r?.anime.episodes)
                setTo(String(Number(from) + r.anime.episodes - 1));
              else setTo("100000");
            }}
          >
            <option value="">請確認季度後選擇</option>
            {records.map((r) => (
              <option key={r.anime.id} value={r.anime.id}>
                {title(r.anime)} · {r.anime.ja} · {r.anime.year ?? "未定"}{" "}
                {r.anime.season ? seasons[r.anime.season] : ""} ·{" "}
                {r.anime.episodes ?? "?"} 集 · #{r.anime.id}
              </option>
            ))}
          </select>
        </label>
        <label>
          本筆對應集數
          <input
            aria-label={`對應集數 ${e.id}`}
            type="number"
            min="1"
            max={target?.anime.episodes ?? 100000}
            value={episode}
            onChange={(ev) => setEpisode(ev.target.value)}
          />
        </label>
      </div>
      {target && (
        <p>
          進度預覽：{target.progress} →{" "}
          {Math.max(target.progress, Number(episode) || 0)} /{" "}
          {target.anime.episodes ?? "未定"} 集；保留評分與備註。
        </p>
      )}
      {uncertain && (
        <label>
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(ev) => setConfirmed(ev.target.checked)}
          />{" "}
          此筆未達門檻或集數不明，我已確認要將上述集數視為看完
        </label>
      )}
      <div className="action-row">
        {!binding && !state.bindings.some((b) => b.seriesId === e.seriesId) && (
          <button
            disabled={busy || !episode || (uncertain && !confirmed)}
            onClick={() => {
              if (
                e.kind === "history" &&
                !window.confirm("確認依巴哈作品 ID 新增收藏並匯入此筆紀錄？")
              )
                return;
              void run(() =>
                reviewEvent(e.id, "apply", undefined, Number(episode), true),
              );
            }}
          >
            直接加入我的動畫
          </button>
        )}
        <button
          disabled={busy || !selected || !episode || (uncertain && !confirmed)}
          onClick={() => {
            if (
              e.kind === "history" &&
              !window.confirm("確認將此筆觀看紀錄匯入選定作品？")
            )
              return;
            void run(() =>
              reviewEvent(e.id, "apply", Number(selected), Number(episode)),
            );
          }}
        >
          確認匯入此筆
        </button>
        <button
          disabled={busy}
          onClick={() => void run(() => reviewEvent(e.id, "dismiss"))}
        >
          略過此筆
        </button>
      </div>
      {!binding && e.episode !== null && (
        <details>
          <summary>設定這部作品日後自動同步</summary>
          <p>
            請確認動畫瘋集數範圍與夜番季度一致。儲存後，同範圍的日後紀錄會自動套用。
          </p>
          <div className="sync-fields">
            <label>
              動畫瘋起始集
              <input
                type="number"
                min="1"
                value={from}
                onChange={(ev) => setFrom(ev.target.value)}
              />
            </label>
            <label>
              動畫瘋結束集
              <input
                type="number"
                min="1"
                value={to}
                onChange={(ev) => setTo(ev.target.value)}
              />
            </label>
            <label>
              集數偏移
              <input
                type="number"
                value={offset}
                onChange={(ev) => setOffset(ev.target.value)}
              />
            </label>
          </div>
          <p>
            動畫瘋 {e.episode} → 夜番 {e.episode + Number(offset)} 集
          </p>
          <button
            disabled={busy || !selected}
            onClick={() =>
              void run(async () => {
                await saveBinding({
                  seriesId: e.seriesId,
                  animeId: Number(selected),
                  from: Number(from),
                  to: Number(to),
                  offset: Number(offset),
                });
                await applyMappedLive();
              })
            }
          >
            確認配對並啟用此作品同步
          </button>
        </details>
      )}
    </article>
  );
}

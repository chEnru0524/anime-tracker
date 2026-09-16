import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  Check,
  Plus,
  Minus,
  Play,
  Bookmark,
  ImageOff,
  LoaderCircle,
} from "lucide-react";
import { useState } from "react";
import { useStore } from "./store";
import {
  title,
  platforms,
  seasons,
  airingLabels,
  statuses,
  type Anime,
  type RecordEntry,
} from "./model";
export const dateLabel = (date: string | null) =>
  date ? new Date(date).toLocaleDateString("zh-TW") : "未定";
export function Cover({ anime }: { anime: Anime }) {
  const [broken, setBroken] = useState(false);
  return anime.cover && !broken ? (
    <img
      src={anime.cover}
      alt={title(anime)}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setBroken(true)}
    />
  ) : (
    <div className="cover-fallback">
      <ImageOff size={32} />
      <span>{title(anime)}</span>
    </div>
  );
}
export function Loading() {
  return (
    <div className="loading" role="status">
      <LoaderCircle className="spin" size={22} />
      正在尋找下一個好故事…
    </div>
  );
}
export function Empty({
  heading = "還沒有動畫",
  message = "試試其他搜尋條件，或探索本季新番。",
  action = true,
}: {
  heading?: string;
  message?: string;
  action?: boolean;
}) {
  return (
    <div className="empty">
      <Bookmark size={34} />
      <h3>{heading}</h3>
      <p>{message}</p>
      {action && (
        <Link className="button primary" to="/season">
          探索本季新番 <ArrowUpRight size={16} />
        </Link>
      )}
    </div>
  );
}
export function AddButtons({ anime }: { anime: Anime }) {
  const s = useStore(),
    r = s.records.find(
      (x) =>
        x.anime.id === anime.id ||
        (anime.ja && x.anime.ja === anime.ja && x.anime.year === anime.year),
    );
  return r ? (
    <Link
      className="in-library"
      to={`/anime/${r.anime.id}`}
      state={{ anime: r.anime }}
    >
      <Check size={15} /> 已加入收藏 · {statuses[r.status]} · {r.progress} /{" "}
      {r.anime.episodes ?? "未定"} 集
    </Link>
  ) : (
    <div className="add-buttons">
      <button disabled={s.busy} onClick={() => void s.add(anime, "planned")}>
        <Plus size={15} /> 想看
      </button>
      <button
        disabled={s.busy}
        className="watch-button"
        onClick={() => void s.add(anime, "watching")}
      >
        <Play size={14} /> 開始觀看
      </button>
    </div>
  );
}
export function Progress({ record }: { record: RecordEntry }) {
  const s = useStore(),
    a = record.anime;
  return (
    <div className="progress-block">
      <div className="progress-caption">
        <span>觀看進度</span>
        <span>
          <b>{record.progress}</b> / {a.episodes ?? "未定"} 集
        </span>
      </div>
      <div
        className="progress-track"
        role="progressbar"
        aria-label={`${title(a)}觀看進度`}
        aria-valuenow={record.progress}
        aria-valuemin={0}
        aria-valuemax={a.episodes ?? undefined}
      >
        <i
          style={{
            width: a.episodes
              ? `${(record.progress / a.episodes) * 100}%`
              : "0%",
          }}
        />
      </div>
      <div className="progress-actions">
        <span>
          {record.lastWatched
            ? `${dateLabel(record.lastWatched)} 觀看`
            : "尚未開始觀看"}
        </span>
        <div>
          <button
            className="icon-button"
            aria-label={`${title(a)} 減少一集`}
            disabled={s.busy || record.progress === 0}
            onClick={() => void s.adjust(a.id, -1)}
          >
            <Minus size={14} />
          </button>
          <button
            className="increment"
            disabled={
              s.busy || (a.episodes !== null && record.progress >= a.episodes)
            }
            onClick={() => void s.adjust(a.id, 1)}
            aria-label={`${title(a)} 增加一集`}
          >
            <Plus size={14} />1 集
          </button>
        </div>
      </div>
    </div>
  );
}
export function AnimeCard({
  anime,
  record,
}: {
  anime: Anime;
  record?: RecordEntry;
}) {
  const s = useStore();
  const known = platforms(anime, record, s.settings.region);
  return (
    <article className="anime-card">
      <Link className="poster" to={`/anime/${anime.id}`} state={{ anime }}>
        <Cover anime={anime} />
        <span
          className={`poster-badge ${anime.airing === "airing" ? "live" : ""}`}
        >
          {airingLabels[anime.airing]}
        </span>
        <span className="poster-type">{anime.format}</span>
        <span className="poster-hover">
          查看動畫 <ArrowUpRight size={16} />
        </span>
      </Link>
      <div className="card-body">
        <Link
          to={`/anime/${anime.id}`}
          state={{ anime }}
          className="card-title"
          title={title(anime)}
        >
          {title(anime)}
        </Link>
        <p className="japanese" title={anime.ja || anime.title}>
          {anime.ja || anime.title}
        </p>
        {!anime.zh && <span className="missing-zh">中文名稱待補</span>}
        {record ? (
          <>
            <div className="platform-line">
              {known.length
                ? known
                    .slice(0, 2)
                    .map((p) => p.name)
                    .join(" · ")
                : "觀看平台未設定"}
            </div>
            <Progress record={record} />
          </>
        ) : (
          <>
            <p className="card-meta">
              {anime.year ?? "年份未定"}
              {anime.season ? ` ${seasons[anime.season]}` : ""}
              <span>·</span>
              {anime.episodes ? `${anime.episodes} 集` : "集數未定"}
            </p>
            <p className="genre-line">
              {anime.genres.slice(0, 2).join(" / ") || "類型未定"}
            </p>
            <p className="premiere">首播 {dateLabel(anime.start)}</p>
            <div className="platform-line">
              {known.length
                ? known
                    .slice(0, 2)
                    .map((p) => p.name)
                    .join(" · ")
                : "平台未定"}
            </div>
            <AddButtons anime={anime} />
          </>
        )}
      </div>
    </article>
  );
}

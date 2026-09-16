import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Search, SlidersHorizontal } from "lucide-react";
import { provider, type CatalogResult } from "./api";
import { AnimeCard, Empty, Loading } from "./components";
import {
  currentSeason,
  nextSeason,
  seasons,
  statuses,
  title,
  type Season,
} from "./model";
import { useStore } from "./store";
import { formats, genres, validPage, type CatalogFilters } from "./catalog";
export { Detail } from "./detail";
export { Stats, BackupPage } from "./settings";
export function Catalog({ mode }: { mode: "season" | "upcoming" | "search" }) {
  const [params] = useSearchParams(),
    query = params.get("q") ?? "",
    now = currentSeason(),
    next = nextSeason();
  const [future, setFuture] = useState("next"),
    [year, setYear] = useState(String(next.year)),
    [season, setSeason] = useState<Season>(next.season),
    [format, setFormat] = useState<CatalogFilters["format"]>(""),
    [genre, setGenre] = useState<CatalogFilters["genre"]>(""),
    [pageState, setPageState] = useState({ key: "", value: 1 }),
    [data, setData] = useState<CatalogResult>({ items: [], hasNext: false }),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0);
  const filterKey = JSON.stringify([
    mode,
    query,
    future,
    year,
    season,
    format,
    genre,
  ]);
  const page = pageState.key === filterKey ? pageState.value : 1;
  const setPage = (value: number) => setPageState({ key: filterKey, value });
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setData({ items: [], hasNext: false });
    const job =
      mode === "search"
        ? provider.search(query, page)
        : mode === "season"
          ? provider.season(now.year, now.season, page, { format, genre })
          : future === "next"
            ? provider.season(next.year, next.season, page, {
                format,
                genre,
                upcomingOnly: true,
              })
            : future === "quarter"
              ? provider.season(Number(year), season, page, {
                  format,
                  genre,
                  upcomingOnly: true,
                })
              : provider.upcoming(
                  page,
                  year === "all" ? undefined : Number(year),
                  { format, genre },
                );
    job
      .then((r) => {
        if (!active) return;
        if (r.totalPages !== undefined && page > Math.max(1, r.totalPages)) {
          setPageState({ key: filterKey, value: Math.max(1, r.totalPages) });
          return;
        }
        setData(r);
      })
      .catch((e) => active && setError(e.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [
    mode,
    query,
    future,
    year,
    season,
    page,
    format,
    genre,
    filterKey,
    retry,
    now.year,
    now.season,
    next.year,
    next.season,
  ]);
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">
            {mode === "search"
              ? "FIND YOUR NEXT STORY"
              : "THE SEASONAL COLLECTION"}
          </p>
          <h1>
            {mode === "season"
              ? "本季新番"
              : mode === "upcoming"
                ? "未來新番"
                : `搜尋「${query}」`}
          </h1>
          <p className="subtitle">
            {mode === "season"
              ? `${now.year} ${seasons[now.season]} · 新作與本季動畫，一次探索。`
              : mode === "upcoming"
                ? "新的世界，正在路上。"
                : "找到喜歡的動畫，加入你的觀看清單。"}
          </p>
        </div>
      </div>
      {mode !== "search" && (
        <div className="filters">
          {mode === "upcoming" && (
            <>
              <label>
                範圍
                <select
                  value={future}
                  onChange={(e) => {
                    setFuture(e.target.value);
                    if (e.target.value === "quarter" && year === "all")
                      setYear(String(next.year));
                  }}
                >
                  <option value="next">下一季度</option>
                  <option value="quarter">指定未來季度</option>
                  <option value="all">所有未來動畫</option>
                </select>
              </label>
              {future !== "next" && (
                <label>
                  播出年份
                  <select
                    value={year}
                    onChange={(e) => setYear(e.target.value)}
                  >
                    {future === "all" && (
                      <option value="all">所有年份（含日期未定）</option>
                    )}
                    {Array.from({ length: 6 }, (_, i) => now.year + i).map(
                      (y) => (
                        <option key={y}>{y}</option>
                      ),
                    )}
                  </select>
                </label>
              )}
              {future === "quarter" && (
                <label>
                  季度
                  <select
                    value={season}
                    onChange={(e) => setSeason(e.target.value as Season)}
                  >
                    {Object.entries(seasons).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </>
          )}
          <label>
            播出形式
            <select
              aria-label="播出形式"
              value={format}
              onChange={(e) =>
                setFormat(e.target.value as CatalogFilters["format"])
              }
            >
              <option value="">全部形式</option>
              {Object.entries(formats).map(([key, f]) => (
                <option key={key} value={key}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            題材類型
            <select
              aria-label="題材類型"
              value={genre}
              onChange={(e) =>
                setGenre(e.target.value as CatalogFilters["genre"])
              }
            >
              <option value="">全部題材</option>
              {Object.entries(genres).map(([key, g]) => (
                <option key={key} value={key}>
                  {g.label}
                </option>
              ))}
            </select>
          </label>
          {(format || genre) && (
            <button
              onClick={() => {
                setFormat("");
                setGenre("");
              }}
            >
              清除類型篩選
            </button>
          )}
        </div>
      )}
      {data.warning && (
        <p className="warning">
          {data.warning}
          {data.cachedAt &&
            `（${new Date(data.cachedAt).toLocaleString("zh-TW")}）`}
        </p>
      )}
      {error && (
        <div className="error" role="alert">
          {error}{" "}
          <button onClick={() => setRetry((x) => x + 1)}>重新嘗試</button>
        </div>
      )}
      {!loading && !error && (
        <div className="results-heading">
          <span>
            {data.totalPages === 0
              ? "共 0 頁"
              : `第 ${page} / ${data.totalPages ?? "未定"} 頁`}
            {data.totalItems !== undefined
              ? ` · 共 ${data.totalItems} 部動畫`
              : ` · 本頁 ${data.items.length} 部動畫`}
          </span>
          <span>中文名稱由 Bangumi 補充</span>
        </div>
      )}
      {loading ? (
        <Loading />
      ) : data.items.length ? (
        <>
          <div className="anime-grid">
            {data.items.map((a) => (
              <AnimeCard key={a.id} anime={a} />
            ))}
          </div>
        </>
      ) : (
        !error && <Empty heading="目前沒有符合條件的動畫" action={false} />
      )}
      <Pagination
        key={filterKey}
        page={page}
        totalPages={data.totalPages}
        hasNext={data.hasNext}
        disabled={loading || !!error}
        onPage={(value) => {
          setPage(value);
          window.scrollTo(0, 0);
        }}
      />
    </>
  );
}
function Pagination({
  page,
  totalPages,
  hasNext,
  disabled,
  onPage,
}: {
  page: number;
  totalPages?: number;
  hasNext: boolean;
  disabled: boolean;
  onPage: (page: number) => void;
}) {
  const [target, setTarget] = useState(String(page)),
    [error, setError] = useState("");
  useEffect(() => {
    setTarget(String(page));
    setError("");
  }, [page]);
  const empty = totalPages === 0;
  return (
    <nav className="pagination" aria-label="動畫分頁">
      <div className="pagination-buttons">
        <button
          disabled={disabled || empty || page === 1}
          onClick={() => onPage(1)}
        >
          首頁
        </button>
        <button
          disabled={disabled || empty || page === 1}
          onClick={() => onPage(page - 1)}
        >
          上一頁
        </button>
        <span role="status" aria-label="目前頁碼">
          {disabled
            ? "載入中…"
            : empty
              ? "共 0 頁"
              : `第 ${page} / ${totalPages ?? "未定"} 頁`}
        </span>
        <button
          disabled={disabled || !hasNext}
          onClick={() => onPage(page + 1)}
        >
          下一頁
        </button>
        <button
          disabled={
            disabled || empty || totalPages === undefined || page >= totalPages
          }
          onClick={() => totalPages && onPage(totalPages)}
        >
          末頁
        </button>
      </div>
      <form
        className="page-jump"
        onSubmit={(e) => {
          e.preventDefault();
          const value = validPage(target, totalPages);
          if (value === null) {
            setError(
              `請輸入 1${totalPages === undefined ? "" : `–${totalPages}`} 的整數頁碼`,
            );
            return;
          }
          setError("");
          onPage(value);
        }}
      >
        <label htmlFor="jump-page">跳至</label>
        <input
          id="jump-page"
          aria-label="跳轉頁碼"
          type="number"
          inputMode="numeric"
          min={1}
          max={totalPages || undefined}
          step={1}
          required
          value={target}
          disabled={disabled || empty}
          onChange={(e) => setTarget(e.target.value)}
        />
        <span>頁</span>
        <button type="submit" disabled={disabled || empty}>
          前往
        </button>
      </form>
      {error && (
        <p role="alert" className="page-error">
          {error}
        </p>
      )}
    </nav>
  );
}
export function LibraryPage() {
  const s = useStore(),
    [params, setParams] = useSearchParams(),
    [q, setQ] = useState(""),
    [platform, setPlatform] = useState(""),
    [sort, setSort] = useState("recent");
  const status = params.get("status") ?? "",
    year = params.get("year") ?? "",
    season = params.get("season") ?? "";
  function filter(k: string, v: string) {
    const p = new URLSearchParams(params);
    v ? p.set(k, v) : p.delete(k);
    setParams(p);
  }
  const platformNames = [
    ...new Set(
      s.records.flatMap((r) =>
        (r.customPlatforms ?? r.anime.platforms).map((p) => p.name),
      ),
    ),
  ];
  const filtered = s.records
    .filter(
      (r) =>
        (!status || r.status === status) &&
        (!year || String(r.anime.year) === year) &&
        (!season || r.anime.season === season) &&
        (!q ||
          [title(r.anime), r.anime.ja, r.anime.title, ...r.anime.aliases]
            .join(" ")
            .toLowerCase()
            .includes(q.toLowerCase())) &&
        (!platform ||
          (r.customPlatforms ?? r.anime.platforms).some(
            (p) => p.name === platform,
          )),
    )
    .sort((a, b) =>
      sort === "rating"
        ? (b.rating ?? -1) - (a.rating ?? -1)
        : (b.lastWatched ?? b.addedAt).localeCompare(
            a.lastWatched ?? a.addedAt,
          ),
    );
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">A COLLECTION OF YOUR STORIES</p>
          <h1>
            我的動畫 <span className="heading-count">{s.records.length}</span>
          </h1>
          <p className="subtitle">想看的、正在看的，還有那些忘不了的。</p>
        </div>
      </div>
      <div className="tabs">
        <button
          className={!status ? "active" : ""}
          onClick={() => filter("status", "")}
        >
          全部 <span>{s.records.length}</span>
        </button>
        {Object.entries(statuses).map(([k, v]) => (
          <button
            className={status === k ? "active" : ""}
            key={k}
            onClick={() => filter("status", k)}
          >
            {v} <span>{s.records.filter((r) => r.status === k).length}</span>
          </button>
        ))}
      </div>
      <div className="filters">
        <label className="filter-search">
          <Search size={17} />
          <input
            aria-label="搜尋我的動畫"
            placeholder="搜尋我的動畫…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
        <label>
          年份
          <select value={year} onChange={(e) => filter("year", e.target.value)}>
            <option value="">所有年份</option>
            {[...new Set(s.records.map((r) => r.anime.year).filter(Boolean))]
              .sort((a, b) => b! - a!)
              .map((y) => (
                <option key={y!}>{y}</option>
              ))}
          </select>
        </label>
        <label>
          季度
          <select
            value={season}
            onChange={(e) => filter("season", e.target.value)}
          >
            <option value="">所有季度</option>
            {Object.entries(seasons).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label>
          平台
          <select
            value={platform}
            onChange={(e) => setPlatform(e.target.value)}
          >
            <option value="">所有平台</option>
            {platformNames.map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </label>
        <label>
          <SlidersHorizontal size={14} />
          排序
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="recent">最近觀看</option>
            <option value="rating">個人評分</option>
          </select>
        </label>
      </div>
      <p className="results-heading">共 {filtered.length} 部動畫</p>
      {filtered.length ? (
        <div className="anime-grid">
          {filtered.map((r) => (
            <div key={r.anime.id} className="library-card">
              <AnimeCard anime={r.anime} record={r} />
              <div className="library-status">
                <span>{statuses[r.status]}</span>
                <span>
                  {r.rating === null ? "尚未評分" : `★ ${r.rating.toFixed(1)}`}
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <Empty
          heading={
            s.records.length ? "沒有符合條件的收藏" : "收藏你的第一部動畫"
          }
          message={
            s.records.length
              ? "調整篩選條件，再找一次。"
              : "從本季新番或上方搜尋開始，打造自己的動畫清單。"
          }
        />
      )}
    </>
  );
}

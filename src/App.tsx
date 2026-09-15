import { registerLibraryTool } from "./webmcp";
import { useEffect, useState } from "react";
import {
  NavLink,
  Link,
  Route,
  Routes,
  useNavigate,
  useLocation,
} from "react-router-dom";
import {
  Moon,
  Search,
  House,
  Library,
  CalendarDays,
  CalendarClock,
  ChartNoAxesCombined,
  Database,
  ArrowRight,
  Play,
  Bookmark,
  CheckCheck,
  Sparkles,
  X,
} from "lucide-react";
import { useStore } from "./store";
import { currentSeason, nextSeason, seasons, type Anime } from "./model";
import { provider } from "./api";
import { AnimeCard, Cover, Empty, Loading, dateLabel } from "./components";
import { Catalog, LibraryPage, Detail, Stats, BackupPage } from "./pages";
const nav = [
  { to: "/", label: "首頁", icon: House },
  { to: "/library", label: "我的動畫", icon: Library },
  { to: "/season", label: "本季新番", icon: CalendarDays },
  { to: "/upcoming", label: "未來新番", icon: CalendarClock },
  { to: "/stats", label: "統計", icon: ChartNoAxesCombined },
];
export default function App() {
  useEffect(registerLibraryTool, []);
  const s = useStore(),
    [query, setQuery] = useState(""),
    navigate = useNavigate(),
    location = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);
  return (
    <div className="app">
      <aside className="sidebar">
        <Link className="brand" to="/">
          <span className="brand-icon">
            <Moon size={24} />
          </span>
          <span>
            夜番 <small>YORU</small>
          </span>
        </Link>
        <span className="nav-caption">你的動漫時光</span>
        <nav>
          {nav.map((n) => (
            <NavLink end={n.to === "/"} key={n.to} to={n.to}>
              <n.icon size={19} />
              <span>{n.label}</span>
              {n.to === "/library" && <b>{s.records.length}</b>}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <NavLink to="/backup">
            <Database size={19} />
            資料與備份
          </NavLink>
          <div className="local-note">
            <span className="local-dot" />
            儲存在這台裝置<p>每一集，都留下紀錄。</p>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <form
            className="search"
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              if (query.trim())
                navigate("/search?q=" + encodeURIComponent(query.trim()));
            }}
          >
            <Search size={19} />
            <input
              aria-label="搜尋動畫"
              placeholder="搜尋動畫，開始下一段故事…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button type="submit">搜尋</button>
          </form>
          <div className="topbar-right">
            <span>
              {currentSeason().year} {seasons[currentSeason().season]}
            </span>
            <span className="avatar">夜</span>
          </div>
        </header>
        <main>
          {s.error && (
            <div className="error" role="alert">
              {s.error}
            </div>
          )}
          {!s.ready ? (
            <Loading />
          ) : (
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/library" element={<LibraryPage />} />
              <Route path="/season" element={<Catalog mode="season" />} />
              <Route path="/upcoming" element={<Catalog mode="upcoming" />} />
              <Route path="/search" element={<Catalog mode="search" />} />
              <Route path="/anime/:id" element={<Detail />} />
              <Route path="/stats" element={<Stats />} />
              <Route path="/backup" element={<BackupPage />} />
              <Route path="*" element={<Empty heading="找不到這個頁面" />} />
            </Routes>
          )}
        </main>
        <footer>
          <span>夜番 YORU</span>
          <span>
            動畫資料：
            <a href="https://jikan.moe" target="_blank" rel="noreferrer">
              Jikan / MyAnimeList
            </a>{" "}
            ·{" "}
            <a href="https://bgm.tv" target="_blank" rel="noreferrer">
              Bangumi
            </a>
          </span>
        </footer>
      </div>
      {s.notice && (
        <div className="toast" role="status">
          {s.notice}
          <button onClick={s.clearNotice} aria-label="關閉通知">
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
function Dashboard() {
  const { records } = useStore(),
    watching = records.filter((r) => r.status === "watching"),
    [upcoming, setUpcoming] = useState<Anime[]>([]),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  const now = currentSeason(),
    next = nextSeason();
  useEffect(() => {
    let active = true;
    provider
      .season(next.year, next.season)
      .then((r) => {
        if (active) {
          setUpcoming(
            r.items.filter((a) => a.airing === "upcoming").slice(0, 4),
          );
          setError(r.warning ?? "");
        }
      })
      .catch((e) => active && setError(e.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [next.year, next.season]);
  const metrics = [
    {
      label: "觀看中",
      n: watching.length,
      icon: Play,
      path: "/library?status=watching",
      color: "green",
    },
    {
      label: "想看清單",
      n: records.filter((r) => r.status === "planned").length,
      icon: Bookmark,
      path: "/library?status=planned",
      color: "purple",
    },
    {
      label: "已完成",
      n: records.filter((r) => r.status === "completed").length,
      icon: CheckCheck,
      path: "/library?status=completed",
      color: "blue",
    },
    {
      label: "本季追番",
      n: watching.filter(
        (r) => r.anime.year === now.year && r.anime.season === now.season,
      ).length,
      icon: Sparkles,
      path:
        "/library?status=watching&year=" + now.year + "&season=" + now.season,
      color: "orange",
    },
  ];
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">YOUR WATCHLIST, YOUR PACE</p>
          <h1>今晚，繼續哪個故事？</h1>
          <p className="subtitle">追上喜歡的世界，收藏每一段旅程。</p>
        </div>
        <Link className="button subtle" to="/season">
          <CalendarDays size={16} />
          {now.year} {seasons[now.season]}新番 <ArrowRight size={15} />
        </Link>
      </div>
      <div className="metrics">
        {metrics.map((m) => (
          <Link to={m.path} key={m.label} className="metric">
            <span className={`metric-icon ${m.color}`}>
              <m.icon size={20} />
            </span>
            <div>
              <span>{m.label}</span>
              <strong>{m.n.toString().padStart(2, "0")}</strong>
            </div>
            <ArrowRight className="metric-arrow" size={17} />
          </Link>
        ))}
      </div>
      <section>
        <div className="section-heading">
          <div>
            <h2>
              <span className="green-line" />
              繼續觀看 <span className="count">{watching.length}</span>
            </h2>
            <p>留一點時間，給喜歡的動畫。</p>
          </div>
          <Link to="/library?status=watching">
            查看全部 <ArrowRight size={16} />
          </Link>
        </div>
        {watching.length ? (
          <div className="anime-grid">
            {[...watching]
              .sort((a, b) =>
                (b.lastWatched ?? b.addedAt).localeCompare(
                  a.lastWatched ?? a.addedAt,
                ),
              )
              .slice(0, 8)
              .map((r) => (
                <AnimeCard key={r.anime.id} anime={r.anime} record={r} />
              ))}
          </div>
        ) : (
          <Empty
            heading="你的追番時光，從這裡開始"
            message="找到喜歡的動畫，點選「開始觀看」，就能在這裡接著看。"
          />
        )}
      </section>
      <section>
        <div className="section-heading">
          <div>
            <h2>
              下一季，值得期待{" "}
              <span className="season-pill">
                {next.year} {seasons[next.season]}
              </span>
            </h2>
            <p>把下一個想看的故事，先放進清單。</p>
          </div>
          <Link to="/upcoming">
            探索新番 <ArrowRight size={16} />
          </Link>
        </div>
        {error && <p className="warning">{error}</p>}
        {loading ? (
          <Loading />
        ) : upcoming.length ? (
          <div className="upcoming-row">
            {upcoming.map((a) => (
              <Link
                className="upcoming-card"
                key={a.id}
                to={`/anime/${a.id}`}
                state={{ anime: a }}
              >
                <div>
                  <Cover anime={a} />
                </div>
                <section>
                  <span className="eyebrow">即將播出</span>
                  <h3>{a.zh || a.ja || a.title}</h3>
                  <p>{dateLabel(a.start)}</p>
                </section>
                <ArrowRight size={16} />
              </Link>
            ))}
          </div>
        ) : (
          <p className="muted">目前沒有可顯示的即將播出資料。</p>
        )}
      </section>
      <div className="backup-callout">
        <Database size={23} />
        <div>
          <h3>好好保存，你的動漫回憶</h3>
          <p>觀看紀錄儲存在這台裝置。定期備份，就能安心帶著走。</p>
        </div>
        <Link to="/backup">
          備份資料 <ArrowRight size={16} />
        </Link>
      </div>
    </>
  );
}

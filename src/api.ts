import { readCache, writeCache } from "./db";
import { type Anime, type Season, currentSeason } from "./model";
import {
  jikanFilterParams,
  bangumiFilterTags,
  jikanPagination,
  bangumiPagination,
  type CatalogFilters,
  genres,
} from "./catalog";
let traditional = (input: string) => input;
let converterReady: Promise<void> | undefined;
function loadConverter() {
  return (converterReady ??= import("opencc-js/cn2t").then(({ Converter }) => {
    traditional = Converter({ from: "cn", to: "tw" });
  }));
}
export interface CatalogResult {
  items: Anime[];
  hasNext: boolean;
  totalPages?: number;
  totalItems?: number;
  warning?: string;
  cachedAt?: number;
}
export interface AnimeProvider {
  seasonYears(): Promise<number[]>;
  search(query: string, page?: number): Promise<CatalogResult>;
  season(
    year: number,
    season: Season,
    page?: number,
    filters?: CatalogFilters,
  ): Promise<CatalogResult>;
  upcoming(
    page?: number,
    year?: number,
    filters?: CatalogFilters,
  ): Promise<CatalogResult>;
  detail(id: number): Promise<{ anime: Anime; warning?: string }>;
}
const JIKAN = "https://api.jikan.moe/v4";
const BGM = "https://api.bgm.tv/v0";
// One queue for Jikan: no more than one request per 450ms, including retries.
let queue = Promise.resolve();
let lastRequest = 0;
const pending = new Map<string, Promise<unknown>>();
async function network(url: string, body?: unknown): Promise<any> {
  for (let attempt = 0; attempt < 2; attempt++) {
    if (url.startsWith(JIKAN)) {
      await new Promise((r) =>
        setTimeout(r, Math.max(0, 450 - (Date.now() - lastRequest))),
      );
      lastRequest = Date.now();
    }
    let response: Response;
    try {
      response = await fetch(url, {
        method: body ? "POST" : "GET",
        headers: body ? { "Content-Type": "application/json" } : {},
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(12000),
      });
    } catch {
      throw new Error(
        "無法連線至動畫資料來源，請稍後重試。你的收藏仍可正常使用。",
      );
    }
    if (response.ok) return response.json();
    if ((response.status === 429 || response.status >= 500) && attempt === 0) {
      const delay = Number(response.headers.get("Retry-After"));
      await new Promise((r) =>
        setTimeout(
          r,
          Math.min(
            5000,
            Math.max(1200, Number.isFinite(delay) ? delay * 1000 : 1200),
          ),
        ),
      );
      continue;
    }
    throw new Error(
      response.status === 429
        ? "資料來源請求過於頻繁，請稍後重試。"
        : `動畫資料暫時無法取得（${response.status}），請稍後重試。`,
    );
  }
}
async function request(
  path: string,
  body?: unknown,
  bgm = false,
): Promise<any> {
  if (bgm) await loadConverter();
  const key = (bgm ? BGM : JIKAN) + path + JSON.stringify(body ?? "");
  const hit = await readCache(key);
  if (hit && Date.now() - hit.at < 6 * 60 * 60 * 1000) return hit.data;
  if (pending.has(key)) return pending.get(key);
  const job = async () => {
    const result = await network((bgm ? BGM : JIKAN) + path, body);
    await writeCache(key, result);
    return result;
  };
  const promise = bgm ? job() : queue.then(job);
  if (!bgm)
    queue = promise.then(
      () => undefined,
      () => undefined,
    );
  pending.set(key, promise);
  try {
    return await promise;
  } finally {
    pending.delete(key);
  }
}
const keyName = (s: string) =>
  s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]/gu, "");
function normalize(raw: any): Anime {
  const d = raw.aired?.prop?.from;
  return {
    id: raw.mal_id,
    title: raw.title || raw.title_japanese || "未命名動畫",
    zh: "",
    ja: raw.title_japanese || "",
    aliases: (raw.titles ?? []).map((x: any) => x.title).filter(Boolean),
    cover:
      raw.images?.webp?.large_image_url ||
      raw.images?.jpg?.large_image_url ||
      "",
    summary: raw.synopsis || "",
    genres: (raw.genres ?? []).map((x: any) => x.name),
    episodes: raw.episodes > 0 ? raw.episodes : null,
    year: raw.year || d?.year || null,
    season:
      raw.season ||
      (d?.month
        ? currentSeason(new Date(d.year, d.month - 1, 1)).season
        : null),
    start: raw.aired?.from ?? null,
    end: raw.aired?.to ?? null,
    airing:
      (
        {
          "Currently Airing": "airing",
          "Finished Airing": "finished",
          "Not yet aired": "upcoming",
        } as const
      )[raw.status as "Currently Airing"] ?? "unknown",
    format: raw.type || "未定",
    platforms: (raw.streaming ?? [])
      .filter((s: any) => /^https?:\/\//.test(s.url))
      .map((s: any) => ({
        name: s.name === "Bahamut Anime Crazy" ? "巴哈姆特動畫瘋" : s.name,
        url: s.url,
        region: "地區未確認",
        source: "api" as const,
      })),
    detail: false,
  };
}
function mergeChinese(a: Anime, b: any): Anime {
  return {
    ...a,
    zh: traditional(b.name_cn || ""),
    summary: b.summary ? traditional(b.summary) : a.summary,
    aliases: [...new Set([...a.aliases, b.name_cn, b.name].filter(Boolean))],
  };
}
async function chineseMatch(a: Anime): Promise<Anime> {
  if (!a.ja) return a;
  const result = await request(
    "/search/subjects?limit=10",
    { keyword: a.ja, filter: { type: [2], nsfw: false } },
    true,
  );
  const match = result.data?.find(
    (b: any) => keyName(b.name) === keyName(a.ja),
  );
  return match ? mergeChinese(a, match) : a;
}
function seasonDates(year: number, season: Season) {
  const month = { winter: 1, spring: 4, summer: 7, fall: 10 }[season];
  return [
    `${year}-${String(month).padStart(2, "0")}-01`,
    `${season === "fall" ? year + 1 : year}-${String(season === "fall" ? 1 : month + 3).padStart(2, "0")}-01`,
  ];
}
async function enrichList(
  items: Anime[],
  year?: number,
  season?: Season,
): Promise<{ items: Anime[]; warning?: string }> {
  if (!items.length) return { items };
  try {
    const range = year && season ? seasonDates(year, season) : null;
    const body = {
      keyword: "",
      sort: "heat",
      filter: {
        type: [2],
        nsfw: false,
        ...(range
          ? { air_date: [`>=${range[0]}`, `<${range[1]}`] }
          : { air_date: [`>=${new Date().getFullYear()}-01-01`] }),
      },
    };
    const result = await request("/search/subjects?limit=100", body, true);
    const byName = new Map<string, any>(
      (result.data ?? []).map((b: any) => [keyName(b.name), b]),
    );
    return {
      items: items.map((a) => {
        const b = byName.get(keyName(a.ja));
        return b ? mergeChinese(a, b) : a;
      }),
    };
  } catch {
    return { items, warning: "中文資料暫時無法取得，目前顯示原文名稱。" };
  }
}
async function catalog(
  key: string,
  run: () => Promise<CatalogResult>,
  fallback?: () => Promise<CatalogResult>,
): Promise<CatalogResult> {
  try {
    const result = await run();
    await writeCache("catalog:v2:" + key, result);
    return result;
  } catch (error) {
    const cached = await readCache("catalog:v2:" + key);
    if (cached)
      return {
        ...(cached.data as CatalogResult),
        cachedAt: cached.at,
        warning: "連線失敗，顯示上次快取的資料。",
      };
    if (fallback) {
      const result = await fallback();
      await writeCache("catalog:v2:" + key, result);
      return result;
    }
    throw error;
  }
}
// Namespaced positive IDs keep fallback subjects separate from MAL IDs.
export const BGM_OFFSET = 1_000_000_000;
function fromBangumi(b: any): Anime {
  const start = b.date && /^\d{4}-\d{2}-\d{2}$/.test(b.date) ? b.date : null;
  const today = new Date().toISOString().slice(0, 10);
  const aliases = (b.infobox ?? [])
    .filter((x: any) => x.key === "别名")
    .flatMap((x: any) =>
      Array.isArray(x.value) ? x.value.map((v: any) => v.v) : [x.value],
    )
    .filter((x: any) => typeof x === "string");
  return {
    id: BGM_OFFSET + b.id,
    title: b.name || b.name_cn || "未命名動畫",
    zh: traditional(b.name_cn || ""),
    ja: b.name || "",
    aliases,
    cover: b.images?.large || b.images?.common || "",
    summary: traditional(b.summary || ""),
    genres: (b.meta_tags?.length
      ? b.meta_tags
      : (b.tags ?? []).slice(0, 4).map((t: any) => t.name)
    ).map(traditional),
    episodes: b.eps > 0 ? b.eps : null,
    year: start ? Number(start.slice(0, 4)) : null,
    season: start ? currentSeason(new Date(start + "T12:00:00")).season : null,
    start,
    end: null,
    airing: start && start > today ? "upcoming" : "unknown",
    format: b.platform || "未定",
    platforms: [],
    detail: false,
  };
}
async function bangumiCatalog(
  keyword: string,
  page: number,
  range?: string[],
  filters: CatalogFilters = {},
): Promise<CatalogResult> {
  const r = await request(
    `/search/subjects?limit=20&offset=${(page - 1) * 20}`,
    {
      keyword,
      sort: keyword ? "match" : "heat",
      filter: {
        type: [2],
        nsfw: false,
        ...(range ? { air_date: range } : {}),
        ...(bangumiFilterTags(filters).length
          ? { tag: bangumiFilterTags(filters) }
          : {}),
      },
    },
    true,
  );
  let items = (r.data ?? []).map(fromBangumi) as Anime[];
  try {
    const c = await request("/../calendar", undefined, true);
    const airing = new Set(
      c.flatMap((day: any) => (day.items ?? []).map((a: any) => a.id)),
    );
    items = items.map((a) =>
      airing.has(a.id - BGM_OFFSET) && a.airing !== "upcoming"
        ? { ...a, airing: "airing" }
        : a,
    );
  } catch {
    /* Unknown is more honest than guessing broadcast status. */
  }
  return {
    items,
    ...bangumiPagination(r.total ?? 0, page),
    warning:
      "Jikan 暫時無法使用，已改用 Bangumi。類型依 Bangumi 分類標籤篩選；未確認的播出狀態與平台顯示為未定。",
  };
}
export const provider: AnimeProvider = {
  async seasonYears() {
    const r = await request("/seasons");
    return [...new Set<number>((r.data ?? []).map((x: any) => x.year))]
      .filter((y) => Number.isInteger(y) && y > 0)
      .sort((a, b) => b - a);
  },
  async search(query, page = 1) {
    return catalog(`search:${query}:${page}`, async () => {
      let raw: any;
      let zhMatches: any[] = [];
      if (/[\u3400-\u9fff]/.test(query) && !/[\u3040-\u30ff]/.test(query)) {
        const b = await request(
          "/search/subjects?limit=5",
          { keyword: query, filter: { type: [2], nsfw: false } },
          true,
        );
        zhMatches = b.data ?? [];
        if (!zhMatches.length)
          return { items: [], hasNext: false, totalPages: 0, totalItems: 0 };
        const all = await Promise.all(
          zhMatches.slice(0, 3).map(async (x: any) => {
            const r = await request(
              `/anime?q=${encodeURIComponent(x.name)}&sfw=true&limit=12`,
            );
            return r.data ?? [];
          }),
        );
        raw = {
          data: [
            ...new Map(all.flat().map((a: any) => [a.mal_id, a])).values(),
          ],
          pagination: { has_next_page: false, last_visible_page: 1 },
        };
      } else
        raw = await request(
          `/anime?q=${encodeURIComponent(query)}&sfw=true&page=${page}&limit=24`,
        );
      let items = (raw.data ?? []).map(normalize) as Anime[];
      if (zhMatches.length)
        items = items.map((a) => {
          const b = zhMatches.find((x) => keyName(x.name) === keyName(a.ja));
          return b ? mergeChinese(a, b) : a;
        });
      else {
        const enriched = await Promise.allSettled(
          items.slice(0, 5).map(chineseMatch),
        );
        items = items.map((a, i) =>
          enriched[i]?.status === "fulfilled" ? enriched[i].value : a,
        );
      }
      return {
        items,
        ...jikanPagination(raw, page),
        ...(zhMatches.length
          ? { totalItems: items.length, totalPages: items.length ? 1 : 0 }
          : {}),
      };
    });
  },
  async season(year, season, page = 1, filters = {}) {
    const d = seasonDates(year, season);
    const range = [`>=${d[0]}`, `<${d[1]}`];
    if (filters.upcomingOnly)
      range.push(`>${new Date().toISOString().slice(0, 10)}`);
    if (filters.sort) {
      // Fetch the complete quarter before sorting/paging. Do not sort only one API page.
      return catalog(
        `archive:${year}:${season}:${page}:${JSON.stringify(filters)}`,
        async () => {
          const rows: any[] = [];
          for (let p = 1; ; p++) {
            const r = await request(
              `/seasons/${year}/${season}?page=${p}&limit=25&sfw=true${filters.format ? "&filter=" + filters.format : ""}`,
            );
            rows.push(...(r.data ?? []));
            if (!r.pagination?.has_next_page) break;
          }
          const genreId = filters.genre ? genres[filters.genre].id : null;
          const unique = [
            ...new Map(rows.map((r) => [r.mal_id, r])).values(),
          ].filter(
            (r) =>
              !genreId ||
              (r.genres ?? []).some((g: any) => g.mal_id === genreId),
          );
          unique.sort((a, b) =>
            filters.sort === "title"
              ? (a.title || "").localeCompare(b.title || "", "en") ||
                a.mal_id - b.mal_id
              : ((filters.sort === "score" ? b.score : b.members) ?? -1) -
                  ((filters.sort === "score" ? a.score : a.members) ?? -1) ||
                a.mal_id - b.mal_id,
          );
          const enriched = await enrichList(
            unique.slice((page - 1) * 24, page * 24).map(normalize),
            year,
            season,
          );
          const totalPages = Math.ceil(unique.length / 24);
          return {
            ...enriched,
            totalItems: unique.length,
            totalPages,
            hasNext: page < totalPages,
          };
        },
        async () => {
          const rows: any[] = [];
          for (let offset = 0; ;) {
            const r = await request(
              `/search/subjects?limit=20&offset=${offset}`,
              {
                keyword: "",
                sort: filters.sort === "score" ? "rank" : "heat",
                filter: {
                  type: [2],
                  nsfw: false,
                  air_date: range,
                  tag: bangumiFilterTags(filters),
                },
              },
              true,
            );
            rows.push(...(r.data ?? []));
            if (rows.length >= (r.total ?? 0) || !r.data?.length) break;
            offset += r.data.length;
          }
          const unique = [...new Map(rows.map((r) => [r.id, r])).values()];
          const popularity = (r: any) =>
            Object.values(r.collection ?? {}).reduce<number>(
              (sum, n) => sum + (typeof n === "number" ? n : 0),
              0,
            );
          unique.sort((a, b) =>
            filters.sort === "title"
              ? (a.name || "").localeCompare(b.name || "", "ja") || a.id - b.id
              : ((filters.sort === "score" ? b.rating?.score : popularity(b)) ??
                  -1) -
                  ((filters.sort === "score"
                    ? a.rating?.score
                    : popularity(a)) ?? -1) || a.id - b.id,
          );
          const totalPages = Math.ceil(unique.length / 24);
          return {
            items: unique.slice((page - 1) * 24, page * 24).map(fromBangumi),
            totalItems: unique.length,
            totalPages,
            hasNext: page < totalPages,
            warning:
              "Jikan 暫時無法使用，已改用 Bangumi 的首播日期、分類、收藏人數與評分；名稱依原文排序。",
          };
        },
      );
    }
    return catalog(
      `season:${year}:${season}:${page}:${JSON.stringify(filters)}`,
      async () => {
        let path = `/seasons/${year}/${season}?page=${page}&limit=24&sfw=true${filters.format ? "&filter=" + filters.format : ""}`;
        if (filters.genre || filters.upcomingOnly) {
          const params = jikanFilterParams(filters);
          const end = new Date(d[1] + "T00:00:00Z");
          end.setUTCDate(end.getUTCDate() - 1);
          params.set("start_date", d[0]);
          params.set("end_date", end.toISOString().slice(0, 10));
          if (filters.upcomingOnly) params.set("status", "upcoming");
          path = `/anime?${params}&page=${page}&limit=24&sfw=true&order_by=popularity&sort=asc`;
        }
        const r = await request(path);
        const enriched = await enrichList(
          (r.data ?? []).map(normalize),
          year,
          season,
        );
        return { ...enriched, ...jikanPagination(r, page) };
      },
      () => {
        return bangumiCatalog("", page, range, filters);
      },
    );
  },
  async upcoming(page = 1, year, filters = {}) {
    return catalog(
      `upcoming:${year ?? "all"}:${page}:${JSON.stringify(filters)}`,
      async () => {
        const params = jikanFilterParams(filters);
        if (year) {
          params.set("start_date", `${year}-01-01`);
          params.set("end_date", `${year}-12-31`);
        }
        const r = await request(
          year || filters.format || filters.genre
            ? `/anime?status=upcoming&${params}&order_by=start_date&sort=asc&sfw=true&page=${page}&limit=24`
            : `/seasons/upcoming?page=${page}&limit=24&sfw=true`,
        );
        const enriched = await enrichList((r.data ?? []).map(normalize), year);
        return { ...enriched, ...jikanPagination(r, page) };
      },
      () =>
        bangumiCatalog(
          "",
          page,
          year
            ? [
                `>=${year}-01-01`,
                `<${year + 1}-01-01`,
                `>${new Date().toISOString().slice(0, 10)}`,
              ]
            : [`>${new Date().toISOString().slice(0, 10)}`],
          filters,
        ),
    );
  },
  async detail(id) {
    if (id >= BGM_OFFSET) {
      const b = await request(`/subjects/${id - BGM_OFFSET}`, undefined, true);
      let anime = { ...fromBangumi(b), detail: true };
      try {
        const r = await request(
          `/episodes?subject_id=${b.id}&type=0&limit=100&offset=${Math.max(0, (b.eps || 0) - 100)}`,
          undefined,
          true,
        );
        const eps = r.data ?? [];
        const last = eps.find((e: any) => e.sort === b.eps);
        const first = eps.find((e: any) => e.sort === 1);
        if (
          last?.airdate &&
          last.airdate <= new Date().toISOString().slice(0, 10) &&
          b.eps > 0
        )
          anime = { ...anime, end: last.airdate, airing: "finished" };
        else if (
          first?.airdate &&
          first.airdate <= new Date().toISOString().slice(0, 10) &&
          last?.airdate
        )
          anime = { ...anime, airing: "airing" };
      } catch {}
      return { anime };
    }
    const r = await request(`/anime/${id}/full`);
    let anime = { ...normalize(r.data), detail: true };
    try {
      anime = await chineseMatch(anime);
      return { anime };
    } catch {
      return { anime, warning: "中文補充資料暫時無法取得。" };
    }
  },
};
const jikanSearch = provider.search.bind(provider);
provider.search = async (query, page = 1) => {
  try {
    return await jikanSearch(query, page);
  } catch {
    return bangumiCatalog(query, page);
  }
};

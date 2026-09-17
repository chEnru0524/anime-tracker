import { z } from "zod";
import { readCache, writeCache } from "./db";
import { type Anime, type Platform } from "./model";

const source =
  "https://raw.githubusercontent.com/bangumi-data/bangumi-data/master/dist/data.json";
const site = z.object({
  site: z.string(),
  id: z.string(),
  url: z.string().optional(),
  regions: z.array(z.string()).optional(),
});
const schema = z.object({
  siteMeta: z.record(
    z.string(),
    z.object({
      title: z.string(),
      type: z.string(),
      urlTemplate: z.string(),
      regions: z.array(z.string()).optional(),
    }),
  ),
  items: z.array(
    z.object({ title: z.string(), begin: z.string(), sites: z.array(site) }),
  ),
});
type Data = z.infer<typeof schema>;
let pending: Promise<{ data: Data; stale: boolean }> | undefined;
async function dataset() {
  const cached = await readCache(source);
  const parsed = schema.safeParse(cached?.data);
  if (parsed.success && cached && Date.now() - cached.at < 86400000)
    return { data: parsed.data, stale: false };
  try {
    const response = await fetch(source, {
      credentials: "omit",
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) throw new Error("平台資料無法取得");
    const data = schema.parse(await response.json());
    await writeCache(source, data);
    return { data, stale: false };
  } catch (error) {
    if (parsed.success) return { data: parsed.data, stale: true };
    throw error;
  }
}

export function matchTaiwanPlatforms(anime: Anime, data: Data): Platform[] {
  // IDs identify seasons more reliably than translated names. A unique Japanese
  // title + premiere year is a conservative fallback when IDs are missing.
  const kind = anime.id >= 1e9 ? "bangumi" : "mal";
  const id = String(anime.id >= 1e9 ? anime.id - 1e9 : anime.id);
  const byId = data.items.filter((item) =>
    item.sites.some((s) => s.site === kind && s.id === id),
  );
  const matches = byId.length
    ? byId
    : data.items.filter(
        (item) =>
          anime.ja &&
          item.title.normalize("NFKC").trim() ===
            anime.ja.normalize("NFKC").trim() &&
          anime.year !== null &&
          new Date(item.begin).getUTCFullYear() === anime.year,
      );
  if (matches.length !== 1) return [];
  return matches[0].sites.flatMap((s) => {
    const meta = data.siteMeta[s.site];
    if (
      !meta ||
      meta.type !== "onair" ||
      !(s.regions ?? meta.regions ?? []).includes("TW")
    )
      return [];
    const url =
      s.url || meta.urlTemplate.replace("{{id}}", encodeURIComponent(s.id));
    try {
      if (new URL(url).protocol !== "https:") return [];
    } catch {
      return [];
    }
    return [
      {
        name: s.site === "gamer" ? "巴哈姆特動畫瘋" : meta.title,
        url,
        region: "台灣",
        source: "api" as const,
      },
    ];
  });
}

export async function withTaiwanPlatforms(anime: Anime) {
  try {
    pending ??= dataset().finally(() => {
      pending = undefined;
    });
    const { data, stale } = await pending;
    const extra = matchTaiwanPlatforms(anime, data);
    const platforms = [
      ...extra,
      ...anime.platforms.filter(
        (p) => !extra.some((e) => e.url === p.url || e.name === p.name),
      ),
    ];
    return {
      anime: { ...anime, platforms },
      warning: stale ? "平台來源暫時無法連線，目前顯示快取資料。" : undefined,
    };
  } catch {
    return {
      anime,
      warning: "台灣平台補充資料暫時無法取得；既有平台與手動設定仍保留。",
    };
  }
}

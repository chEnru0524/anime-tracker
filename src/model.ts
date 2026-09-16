import { z } from "zod";
import { syncStateSchema } from "./bahamut-schema";
export const statuses = {
  watching: "觀看中",
  planned: "想看",
  completed: "已看完",
  paused: "暫停",
  dropped: "棄番",
} as const;
export const seasons = {
  winter: "冬季",
  spring: "春季",
  summer: "夏季",
  fall: "秋季",
} as const;
export type Status = keyof typeof statuses;
export type Season = keyof typeof seasons;
const safeUrl = z
  .string()
  .max(3000)
  .refine(
    (s) =>
      !s ||
      (/^https?:\/\//i.test(s) &&
        (() => {
          try {
            return !!new URL(s).hostname;
          } catch {
            return false;
          }
        })()),
    "網址必須使用 http 或 https",
  );
export const platformSchema = z.object({
  name: z.string().trim().min(1).max(100),
  url: safeUrl,
  region: z.string().max(100),
  source: z.enum(["api", "manual"]),
});
export const animeSchema = z.object({
  bahamutSeriesId: z.string().regex(/^\d+$/).optional(),
  id: z.number().int().positive(),
  title: z.string().min(1).max(500),
  zh: z.string().max(500),
  ja: z.string().max(500),
  aliases: z.array(z.string().max(500)).max(100),
  cover: safeUrl,
  summary: z.string().max(100000),
  genres: z.array(z.string().max(100)).max(100),
  episodes: z.number().int().positive().nullable(),
  year: z.number().int().min(1900).max(2200).nullable(),
  season: z.enum(["winter", "spring", "summer", "fall"]).nullable(),
  start: z.union([z.iso.date(), z.iso.datetime({ offset: true })]).nullable(),
  end: z.union([z.iso.date(), z.iso.datetime({ offset: true })]).nullable(),
  airing: z.enum(["airing", "finished", "upcoming", "unknown"]),
  format: z.string().max(100),
  platforms: z.array(platformSchema).max(100),
  detail: z.boolean(),
});
const date = z.iso.datetime();
export const recordSchema = z
  .object({
    anime: animeSchema,
    status: z.enum(["watching", "planned", "completed", "paused", "dropped"]),
    progress: z.number().int().min(0).max(100000),
    rating: z.number().min(0).max(10).nullable(),
    notes: z.string().max(20000),
    addedAt: date,
    lastWatched: date.nullable(),
    completedAt: date.nullable(),
    customPlatforms: z.array(platformSchema).max(100).nullable(),
  })
  .refine(
    (r) => r.anime.episodes === null || r.progress <= r.anime.episodes,
    "觀看集數超過總集數",
  );
export const settingsSchema = z.object({
  region: z.string().min(1).max(100),
  bahamut: z
    .object({
      extensionId: z.string().regex(/^[a-p]{32}$/),
      enabled: z.boolean(),
    })
    .optional(),
});
export const backupSchema = z
  .object({
    app: z.literal("yoru"),
    version: z.literal(1),
    exportedAt: date,
    records: z.array(recordSchema).max(20000),
    settings: settingsSchema,
    bahamut: syncStateSchema.optional(),
  })
  .refine(
    (b) => new Set(b.records.map((r) => r.anime.id)).size === b.records.length,
    "收藏含有重複動畫",
  );
export type Anime = z.infer<typeof animeSchema>;
export type Platform = z.infer<typeof platformSchema>;
export type RecordEntry = z.infer<typeof recordSchema>;
export type Settings = z.infer<typeof settingsSchema>;
export type Backup = z.infer<typeof backupSchema>;
export function currentSeason(d = new Date()): {
  year: number;
  season: Season;
} {
  return {
    year: d.getFullYear(),
    season: (Object.keys(seasons) as Season[])[Math.floor(d.getMonth() / 3)],
  };
}
export function nextSeason(d = new Date()) {
  return currentSeason(new Date(d.getFullYear(), d.getMonth() + 3, 1));
}
export function previousSeason(d = new Date()) {
  return currentSeason(new Date(d.getFullYear(), d.getMonth() - 3, 1));
}
export function title(a: Anime) {
  return a.zh || a.ja || a.title;
}
export function clampProgress(n: number, total: number | null) {
  return Math.max(
    0,
    Math.min(Math.trunc(Number.isFinite(n) ? n : 0), total ?? 100000),
  );
}
export function newRecord(anime: Anime, status: Status): RecordEntry {
  return {
    anime,
    status,
    progress: 0,
    rating: null,
    notes: "",
    addedAt: new Date().toISOString(),
    lastWatched: null,
    completedAt: null,
    customPlatforms: null,
  };
}
export function platforms(a: Anime, r?: RecordEntry, region = "台灣") {
  return [...(r?.customPlatforms ?? a.platforms)].sort(
    (a, b) => Number(b.region === region) - Number(a.region === region),
  );
}
export const airingLabels = {
  airing: "播出中",
  finished: "已完結",
  upcoming: "尚未播出",
  unknown: "播出狀態未定",
};

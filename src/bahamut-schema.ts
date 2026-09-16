import { z } from "zod";
const sn = z.string().regex(/^[1-9]\d{0,11}$/);
export const watchEventSchema = z
  .object({
    id: z.string().min(1).max(180),
    kind: z.enum(["live", "history"]),
    seriesId: sn,
    videoId: sn.nullable(),
    title: z.string().min(1).max(500),
    episode: z.number().int().min(1).max(100000).nullable(),
    episodeLabel: z.string().max(100),
    watchedAt: z.iso.datetime().nullable(),
    capturedAt: z.iso.datetime(),
    ratio: z.number().min(0).max(1).nullable(),
    threshold: z.number().int().min(1).max(100),
    evidence: z.enum(["played-ranges", "site-history"]),
  })
  .strict()
  .refine(
    (e) =>
      e.kind !== "live" ||
      (e.evidence === "played-ranges" &&
        e.watchedAt !== null &&
        e.ratio !== null &&
        e.ratio * 100 + 0.001 >= e.threshold),
    "播放尚未達門檻",
  );
export const bindingSchema = z
  .object({
    seriesId: sn,
    animeId: z.number().int().positive(),
    from: z.number().int().min(1).max(100000),
    to: z.number().int().min(1).max(100000),
    offset: z.number().int().min(-100000).max(100000),
  })
  .refine(
    (m) => m.from <= m.to && m.from + m.offset >= 1,
    "集數範圍或偏移不正確",
  );
export const syncStateSchema = z.object({
  pending: z.array(watchEventSchema).max(10000),
  applied: z.array(z.string().max(180)).max(20000),
  bindings: z.array(bindingSchema).max(2000),
});
export const emptySyncState = () => ({
  pending: [],
  applied: [],
  bindings: [],
});
export type WatchEvent = z.infer<typeof watchEventSchema>;
export type Binding = z.infer<typeof bindingSchema>;
export type SyncState = z.infer<typeof syncStateSchema>;
export function trustedTracker(url: string) {
  try {
    const u = new URL(url);
    return (
      u.origin === "https://chenru0524.github.io" &&
      u.pathname === "/anime-tracker/"
    );
  } catch {
    return false;
  }
}
export function aniVideoId(url: string) {
  try {
    const u = new URL(url);
    return u.origin === "https://ani.gamer.com.tw" &&
      u.pathname === "/animeVideo.php" &&
      sn.safeParse(u.searchParams.get("sn")).success
      ? u.searchParams.get("sn")
      : null;
  } catch {
    return null;
  }
}

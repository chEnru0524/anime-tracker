import { type RecordEntry, recordSchema } from "./model";
import { type WatchEvent, type Binding } from "./bahamut-schema";
export function matchingBinding(event: WatchEvent, bindings: Binding[]) {
  const matches = bindings.filter(
    (b) =>
      b.seriesId === event.seriesId &&
      event.episode !== null &&
      event.episode >= b.from &&
      event.episode <= b.to,
  );
  return matches.length === 1 ? matches[0] : undefined;
}
export function mergeWatch(
  record: RecordEntry,
  event: WatchEvent,
  binding: Binding,
  explicitEpisode?: number,
): RecordEntry {
  const episode =
    explicitEpisode ??
    (event.episode === null ? NaN : event.episode + binding.offset);
  if (
    !Number.isInteger(episode) ||
    episode < 1 ||
    episode > 100000 ||
    (record.anime.episodes !== null && episode > record.anime.episodes)
  )
    throw new Error("對應集數超出總集數，請檢查季度與集數偏移。");
  const progress = Math.max(record.progress, episode);
  const lastWatched = !event.watchedAt
    ? record.lastWatched
    : !record.lastWatched || event.watchedAt > record.lastWatched
      ? event.watchedAt
      : record.lastWatched;
  const list = [...(record.customPlatforms ?? record.anime.platforms)];
  if (!list.some((p) => p.name === "巴哈姆特動畫瘋"))
    list.push({
      name: "巴哈姆特動畫瘋",
      url: event.videoId
        ? `https://ani.gamer.com.tw/animeVideo.php?sn=${event.videoId}`
        : "https://ani.gamer.com.tw/",
      region: "台灣",
      source: "manual",
    });
  return recordSchema.parse({
    ...record,
    progress,
    lastWatched,
    customPlatforms: list,
    status: record.status === "planned" ? "watching" : record.status,
  });
}

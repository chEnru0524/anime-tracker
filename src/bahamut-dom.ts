import { aniVideoId, type WatchEvent } from "./bahamut-schema";
export function integerEpisode(label: string) {
  const s = label.trim().normalize("NFKC");
  return /^\d+$/.test(s) && Number(s) > 0 && Number(s) <= 100000
    ? Number(s)
    : null;
}
export function playbackIdentity(doc: Document, href: string) {
  const videoId = aniVideoId(href);
  const selected = doc.querySelector(".season .playing a[data-ani-video-sn]");
  const heading = doc.querySelector(".anime_name h1")?.textContent?.trim();
  const series = doc
    .querySelector('.anime_name button[onclick*="toggleGather"]')
    ?.getAttribute("onclick")
    ?.match(/toggleGather\(\s*\d+\s*,\s*(\d+)/)?.[1];
  if (
    !videoId ||
    !series ||
    !heading ||
    selected?.getAttribute("data-ani-video-sn") !== videoId
  )
    return null;
  const episodeLabel = selected.textContent?.trim() ?? "";
  return {
    seriesId: series,
    videoId,
    title: heading.replace(/\s*\[[^\]]+\]\s*$/, "").slice(0, 500),
    episode: integerEpisode(episodeLabel),
    episodeLabel: episodeLabel.slice(0, 100),
  };
}
export function watchedRatio(
  ranges: Array<[number, number]>,
  duration: number,
) {
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  const sorted = ranges
    .filter(
      ([a, b]) => Number.isFinite(a) && Number.isFinite(b) && a >= 0 && b > a,
    )
    .map(([a, b]) => [a, Math.min(b, duration)])
    .sort((a, b) => a[0] - b[0]);
  let end = 0,
    total = 0;
  for (const [a, b] of sorted) {
    if (b > Math.max(a, end)) total += b - Math.max(a, end);
    end = Math.max(end, b);
  }
  return Math.min(1, total / duration);
}
export function mergeRanges(
  ranges: Array<[number, number]>,
): Array<[number, number]> {
  const compact: Array<[number, number]> = [];
  for (const [a, b] of [...ranges].sort((a, b) => a[0] - b[0])) {
    const tail = compact.at(-1);
    if (tail && a <= tail[1] + 0.1) tail[1] = Math.max(tail[1], b);
    else compact.push([a, b]);
  }
  return compact;
}
// Only read display dates. Never substitute import time for an unknown watch time.
export function displayWatchDate(
  text: string,
  now = new Date(),
): string | null {
  const absolute = text
    .trim()
    .match(/^(\d{4})\.(\d{2})\.(\d{2})\s+(\d{2}):(\d{2})$/);
  if (absolute) {
    const [, y, m, d, h, min] = absolute;
    const date = new Date(+y, +m - 1, +d, +h, +min);
    return Number.isNaN(+date) ? null : date.toISOString();
  }
  const relative = text.trim().match(/^(昨天|前天)\s+(\d{2}):(\d{2})$/);
  if (relative) {
    const d = new Date(now);
    d.setDate(d.getDate() - (relative[1] === "昨天" ? 1 : 2));
    d.setHours(+relative[2], +relative[3], 0, 0);
    return d.toISOString();
  }
  const elapsed = text.trim().match(/^(\d+)\s*(分前|小時前)$/);
  if (elapsed)
    return new Date(
      +now - Number(elapsed[1]) * (elapsed[2] === "分前" ? 60000 : 3600000),
    ).toISOString();
  return null;
}
export function historyEvents(
  doc: Document,
  threshold: number,
  now = new Date(),
): WatchEvent[] {
  return [
    ...doc.querySelectorAll(".history-wrapper .user-watch-list .anime-card"),
  ].flatMap((card) => {
    const seriesId = card
      .querySelector("[data-anime-sn]")
      ?.getAttribute("data-anime-sn");
    const title = card
      .querySelector(".history-anime-title")
      ?.textContent?.trim();
    const episodeLabel =
      card.querySelector(".user-lastwatch")?.textContent?.trim() ?? "";
    if (!seriesId || !/^\d+$/.test(seriesId) || !title) return [];
    const href = card.querySelector("a.play-btn")?.getAttribute("href") ?? "";
    const videoId = aniVideoId(href);
    const width = (
      card.querySelector(".progress-bar .progress") as HTMLElement | null
    )?.style.width;
    const ratio =
      width && /^\d+(\.\d+)?%$/.test(width)
        ? Math.min(1, parseFloat(width) / 100)
        : null;
    const detail = [
      ...doc.querySelectorAll(
        `.user-watchTime-list[data-anime-sn="${seriesId}"] a`,
      ),
    ].find(
      (a) => videoId && aniVideoId(a.getAttribute("href") ?? "") === videoId,
    );
    const watchedAt = displayWatchDate(
      detail?.querySelector(".date")?.textContent ?? "",
      now,
    );
    return [
      {
        id: `history:${seriesId}:${videoId ?? episodeLabel}:${watchedAt ?? "unknown"}:${ratio}`,
        kind: "history" as const,
        seriesId,
        videoId,
        title: title.slice(0, 500),
        episode: integerEpisode(episodeLabel),
        episodeLabel: episodeLabel.slice(0, 100),
        watchedAt,
        capturedAt: now.toISOString(),
        ratio,
        threshold,
        evidence: "site-history" as const,
      },
    ];
  });
}

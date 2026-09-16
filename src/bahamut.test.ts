import "fake-indexeddb/auto";
import { beforeEach, describe, it, expect } from "vitest";
import {
  watchEventSchema,
  trustedTracker,
  type WatchEvent,
} from "./bahamut-schema";
import {
  watchedRatio,
  mergeRanges,
  integerEpisode,
  displayWatchDate,
} from "./bahamut-dom";
import { mergeWatch } from "./bahamut-merge";
import { restoreBackup, readLibrary, makeBackup } from "./db";
import {
  receiveEvents,
  saveBinding,
  readSync,
  reviewEvent,
} from "./bahamut-db";
import { newRecord, type Anime } from "./model";
const anime: Anime = {
  id: 1,
  title: "A",
  zh: "測試",
  ja: "テスト",
  aliases: [],
  cover: "",
  summary: "",
  genres: [],
  episodes: 12,
  year: 2026,
  season: "summer",
  start: null,
  end: null,
  airing: "unknown",
  format: "TV",
  platforms: [],
  detail: true,
};
const event: WatchEvent = {
  id: "live:test",
  kind: "live",
  seriesId: "123",
  videoId: "456",
  title: "測試",
  episode: 8,
  episodeLabel: "8",
  watchedAt: "2026-09-16T01:00:00.000Z",
  capturedAt: "2026-09-16T01:00:00.000Z",
  ratio: 0.8,
  threshold: 80,
  evidence: "played-ranges",
};
const binding = { seriesId: "123", animeId: 1, from: 1, to: 12, offset: 0 };
beforeEach(async () => {
  await restoreBackup({
    app: "yoru",
    version: 1,
    exportedAt: new Date().toISOString(),
    records: [
      {
        ...newRecord(anime, "watching"),
        progress: 5,
        notes: "keep",
        rating: 9,
      },
    ],
    settings: { region: "台灣" },
  });
});
describe("safe progress merge", () => {
  it("sets episode 8 rather than incrementing 5, preserves notes, rating and timestamp", async () => {
    await saveBinding(binding);
    await receiveEvents([event]);
    const r = (await readLibrary())[0];
    expect(r.progress).toBe(8);
    expect(r.lastWatched).toBe(event.watchedAt);
    expect(r.notes).toBe("keep");
    expect(r.rating).toBe(9);
    expect(r.customPlatforms?.[0].name).toBe("巴哈姆特動畫瘋");
  });
  it("is idempotent and never regresses progress or last watched time", async () => {
    await saveBinding(binding);
    await receiveEvents([event, event]);
    await receiveEvents([
      {
        ...event,
        id: "older",
        episode: 3,
        watchedAt: "2020-01-01T00:00:00.000Z",
      },
    ]);
    expect((await readLibrary())[0].progress).toBe(8);
    expect((await readLibrary())[0].lastWatched).toBe(event.watchedAt);
    expect((await readSync()).applied).toEqual([event.id, "older"]);
  });
  it("keeps unmapped and history records in a durable inbox before acknowledgement", async () => {
    expect(await receiveEvents([event])).toEqual([event.id]);
    expect((await readSync()).pending).toHaveLength(1);
    expect((await readLibrary())[0].progress).toBe(5);
    await saveBinding(binding);
    await receiveEvents([
      { ...event, id: "history:x", kind: "history", evidence: "site-history" },
    ]);
    expect((await readLibrary())[0].progress).toBe(5);
  });
  it("supports season offsets and leaves out-of-range events for review", async () => {
    await saveBinding({ ...binding, from: 73, to: 84, offset: -72 });
    await receiveEvents([{ ...event, episode: 80 }]);
    expect((await readLibrary())[0].progress).toBe(8);
    await receiveEvents([{ ...event, id: "bad", episode: 90 }]);
    expect((await readSync()).pending).toHaveLength(1);
  });
  it("rejects overlapping mappings and never clamps the wrong season silently", async () => {
    await saveBinding(binding);
    await expect(
      saveBinding({ ...binding, from: 5, to: 15 }),
    ).rejects.toThrow();
    expect(() =>
      mergeWatch(
        newRecord(anime, "watching"),
        { ...event, episode: 13 },
        binding,
      ),
    ).toThrow();
  });
  it("requires explicit review for unknown/special episodes", async () => {
    await receiveEvents([{ ...event, episode: null, episodeLabel: "SP" }]);
    await reviewEvent(event.id, "apply", 1, 9);
    expect((await readLibrary())[0].progress).toBe(9);
  });
  it("backs up mappings, inbox and receipts; restore pauses auto-connect", async () => {
    await saveBinding(binding);
    await receiveEvents([
      { ...event, id: "h", kind: "history", evidence: "site-history" },
    ]);
    const b = await makeBackup();
    b.settings.bahamut = { extensionId: "a".repeat(32), enabled: true };
    await restoreBackup(b);
    const result = await makeBackup();
    expect(result.bahamut).toEqual(b.bahamut);
    expect(result.settings.bahamut?.enabled).toBe(false);
  });
});
describe("trust boundaries and completion evidence", () => {
  it("accepts only exact production origin and project path", () => {
    expect(
      trustedTracker("https://chenru0524.github.io/anime-tracker/#/sync"),
    ).toBe(true);
    for (const u of [
      "https://chenru0524.github.io/other/",
      "https://evil.test/anime-tracker/",
      "http://chenru0524.github.io/anime-tracker/",
      "https://chenru0524.github.io/anime-tracker/evil",
    ])
      expect(trustedTracker(u)).toBe(false);
  });
  it("rejects unexpected fields, invalid times and fabricated live completion below threshold", () => {
    expect(
      watchEventSchema.safeParse({ ...event, cookie: "secret" }).success,
    ).toBe(false);
    expect(watchEventSchema.safeParse({ ...event, ratio: 0.79 }).success).toBe(
      false,
    );
    expect(
      watchEventSchema.safeParse({ ...event, watchedAt: "invalid" }).success,
    ).toBe(false);
  });
  it("counts actual unique ranges rather than a seek position or repeated segment", () => {
    expect(
      watchedRatio(
        [
          [0, 20],
          [10, 30],
          [80, 90],
        ],
        100,
      ),
    ).toBe(0.4);
    expect(watchedRatio([[80, 81]], 100)).toBe(0.01);
    expect(watchedRatio([], Infinity)).toBe(0);
    expect(
      mergeRanges([
        [3, 5],
        [0, 4],
      ]),
    ).toEqual([[0, 5]]);
  });
  it("does not coerce specials, decimal episodes or missing dates", () => {
    expect(integerEpisode("第8集")).toBeNull();
    expect(integerEpisode("12.5")).toBeNull();
    expect(integerEpisode("OVA")).toBeNull();
    expect(integerEpisode("08")).toBe(8);
    expect(displayWatchDate("")).toBeNull();
    expect(displayWatchDate("2026.09.01 20:15")).not.toBeNull();
  });
});

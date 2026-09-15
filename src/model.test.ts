import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  backupSchema,
  clampProgress,
  currentSeason,
  nextSeason,
  newRecord,
  platforms,
  type Anime,
  type Backup,
} from "./model";
import { restoreBackup, makeBackup, saveRecord, readLibrary } from "./db";
const anime: Anime = {
  id: 1,
  title: "Test",
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
  platforms: [
    { name: "API", url: "https://example.com", region: "台灣", source: "api" },
  ],
  detail: true,
};
const backup = (): Backup => ({
  app: "yoru",
  version: 1,
  exportedAt: new Date().toISOString(),
  records: [newRecord(anime, "watching")],
  settings: { region: "台灣" },
});
describe("progress and seasons", () => {
  it("bounds known and unknown episode counts", () => {
    expect(clampProgress(-1, 12)).toBe(0);
    expect(clampProgress(99, 12)).toBe(12);
    expect(clampProgress(99, null)).toBe(99);
    expect(clampProgress(NaN, 12)).toBe(0);
  });
  it("handles year rollover", () => {
    expect(nextSeason(new Date(2026, 11, 15))).toEqual({
      year: 2027,
      season: "winter",
    });
    expect(currentSeason(new Date(2026, 2, 31)).season).toBe("winter");
  });
  it("preserves empty manual overrides and prioritizes region", () => {
    expect(
      platforms(anime, { ...newRecord(anime, "planned"), customPlatforms: [] }),
    ).toEqual([]);
    expect(
      platforms({
        ...anime,
        platforms: [
          { name: "Unknown", url: "", region: "unknown", source: "api" },
          ...anime.platforms,
        ],
      })[0].name,
    ).toBe("API");
  });
});
describe("backup validation and transactional persistence", () => {
  beforeEach(async () => {
    await restoreBackup({ ...backup(), records: [] });
  });
  it("round trips all personal fields and settings", async () => {
    const b = backup();
    b.records[0] = {
      ...b.records[0],
      progress: 4,
      rating: 8.5,
      notes: "感想",
      customPlatforms: [
        {
          name: "動畫瘋",
          url: "https://ani.gamer.com.tw",
          region: "台灣",
          source: "manual",
        },
      ],
    };
    await restoreBackup(b);
    const result = await makeBackup();
    expect(result.records).toEqual(b.records);
    expect(result.settings).toEqual(b.settings);
  });
  it("rejects invalid imports without changing data", async () => {
    await saveRecord(newRecord(anime, "watching"));
    const invalid = backup();
    invalid.records[0].progress = 13;
    await expect(restoreBackup(invalid)).rejects.toThrow();
    expect((await readLibrary())[0].progress).toBe(0);
  });
  it("rejects unsafe URLs, duplicate IDs, invalid dates and unsupported versions", () => {
    const b = backup();
    expect(backupSchema.safeParse({ ...b, version: 2 }).success).toBe(false);
    expect(
      backupSchema.safeParse({ ...b, records: [b.records[0], b.records[0]] })
        .success,
    ).toBe(false);
    b.records[0].anime = { ...anime, cover: "javascript:alert(1)" };
    expect(backupSchema.safeParse(b).success).toBe(false);
    b.records[0].anime = anime;
    b.records[0].lastWatched = "bad";
    expect(backupSchema.safeParse(b).success).toBe(false);
  });
  it("retains stored records independently of network failure", async () => {
    await saveRecord(newRecord(anime, "watching"));
    vi.stubGlobal("fetch", () => Promise.reject(new Error("offline")));
    expect((await readLibrary()).length).toBe(1);
    vi.unstubAllGlobals();
  });
});

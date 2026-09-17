import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { matchTaiwanPlatforms } from "./taiwan-platforms";
import { type Anime } from "./model";
const anime = { id: 99, ja: "作品", year: 2025 } as Anime;
const meta = {
  title: "平台",
  type: "onair",
  urlTemplate: "https://example.com/{{id}}",
  regions: ["TW"],
};
const data = {
  siteMeta: {
    tw: meta,
    hk: { ...meta, regions: ["HK"] },
    unknown: { ...meta, regions: undefined },
  },
  items: [
    {
      title: "作品",
      begin: "2025-04-01",
      sites: [
        { site: "mal", id: "99" },
        { site: "tw", id: "1" },
        { site: "hk", id: "2" },
        { site: "unknown", id: "3" },
      ],
    },
  ],
};
describe("Taiwan platform matching", () => {
  it("uses source IDs and includes only explicitly Taiwan offers", () => {
    expect(matchTaiwanPlatforms({ ...anime, ja: "不同翻譯" }, data)).toEqual([
      {
        name: "平台",
        url: "https://example.com/1",
        region: "台灣",
        source: "api",
      },
    ]);
  });
  it("respects per-title territory overrides and rejects unsafe URLs", () => {
    const override = {
      ...data,
      items: [
        {
          ...data.items[0],
          sites: [
            { site: "mal", id: "99" },
            { site: "tw", id: "1", regions: ["HK"] },
            { site: "tw", id: "2", url: "javascript:alert(1)" },
          ],
        },
      ],
    };
    expect(matchTaiwanPlatforms(anime, override)).toEqual([]);
  });
  it("rejects ambiguous title matches and wrong years", () => {
    expect(
      matchTaiwanPlatforms({ ...anime, id: 98, year: 2024 }, data),
    ).toEqual([]);
    expect(
      matchTaiwanPlatforms(
        { ...anime, id: 98 },
        { ...data, items: [...data.items, ...data.items] },
      ),
    ).toEqual([]);
  });
});

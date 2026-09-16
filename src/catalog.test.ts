import { describe, expect, it } from "vitest";
import {
  bangumiPagination,
  jikanPagination,
  validPage,
  jikanFilterParams,
  bangumiFilterTags,
} from "./catalog";
describe("catalog pagination and filters", () => {
  it("uses the capped Bangumi page size without skipping the last page", () => {
    expect(bangumiPagination(41, 2)).toEqual({
      totalItems: 41,
      totalPages: 3,
      hasNext: true,
    });
    expect(bangumiPagination(40, 2).hasNext).toBe(false);
    expect(bangumiPagination(0, 1).totalPages).toBe(0);
  });
  it("uses provider totals, including empty results", () => {
    expect(
      jikanPagination(
        { pagination: { last_visible_page: 3, items: { total: 49 } } },
        3,
      ),
    ).toEqual({ totalItems: 49, totalPages: 3, hasNext: false });
    expect(
      jikanPagination(
        { pagination: { last_visible_page: 1, items: { total: 0 } } },
        1,
      ).totalPages,
    ).toBe(0);
  });
  it("rejects invalid jumps", () => {
    for (const value of ["0", "-1", "1.5", "4", "", "1e2"])
      expect(validPage(value, 3)).toBeNull();
    expect(validPage("3", 3)).toBe(3);
  });
  it("filters the full provider query", () => {
    expect(
      jikanFilterParams({ format: "tv", genre: "fantasy" }).toString(),
    ).toBe("type=tv&genres=10");
    expect(bangumiFilterTags({ format: "tv", genre: "fantasy" })).toEqual([
      "TV",
      "奇幻",
    ]);
  });
});

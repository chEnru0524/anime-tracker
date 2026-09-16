import { describe, it, expect } from "vitest";
import { matchesPeriod } from "./library-period";
import type { Anime } from "./model";
const at = new Date(2026, 0, 15);
const anime = (year: number | null, season: Anime["season"]) =>
  ({ year, season }) as Anime;
describe("library seasonal filters", () => {
  it("compares both year and quarter across New Year", () => {
    expect(matchesPeriod(anime(2025, "winter"), "not-season", at)).toBe(true);
    expect(matchesPeriod(anime(2026, "winter"), "current", at)).toBe(true);
    expect(matchesPeriod(anime(2025, "fall"), "older-season", at)).toBe(true);
    expect(matchesPeriod(anime(2026, "spring"), "older-season", at)).toBe(
      false,
    );
    expect(matchesPeriod(anime(2027, "winter"), "not-year", at)).toBe(true);
    expect(matchesPeriod(anime(2027, "winter"), "older-year", at)).toBe(false);
  });
  it("does not guess missing dates", () => {
    expect(matchesPeriod(anime(null, null), "older-season", at)).toBe(false);
    expect(matchesPeriod(anime(2025, null), "older-year", at)).toBe(true);
    expect(matchesPeriod(anime(2025, null), "not-season", at)).toBe(false);
    expect(matchesPeriod(anime(null, null), "unknown", at)).toBe(true);
  });
});

import { currentSeason, seasons, type Anime } from "./model";
export function matchesPeriod(a: Anime, period: string, date = new Date()) {
  const now = currentSeason(date);
  if (!period) return true;
  if (period === "unknown") return a.year === null || a.season === null;
  if (a.year === null) return false;
  if (period === "not-year") return a.year !== now.year;
  if (period === "older-year") return a.year < now.year;
  if (a.season === null) return false;
  if (period === "not-season")
    return a.year !== now.year || a.season !== now.season;
  if (period === "current")
    return a.year === now.year && a.season === now.season;
  if (period === "older-season")
    return (
      a.year < now.year ||
      (a.year === now.year &&
        Object.keys(seasons).indexOf(a.season) <
          Object.keys(seasons).indexOf(now.season))
    );
  return true;
}

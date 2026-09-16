export const formats = {
  tv: { label: "TV 電視動畫", tag: "TV" },
  movie: { label: "劇場版", tag: "剧场版" },
  ova: { label: "OVA", tag: "OVA" },
  ona: { label: "ONA 網路動畫", tag: "WEB" },
  special: { label: "特別篇", tag: "SP" },
} as const;
export const genres = {
  fantasy: { label: "奇幻", id: 10, tag: "奇幻" },
  romance: { label: "戀愛", id: 22, tag: "恋爱" },
  comedy: { label: "喜劇", id: 4, tag: "搞笑" },
  action: { label: "動作／戰鬥", id: 1, tag: "战斗" },
  adventure: { label: "冒險", id: 2, tag: "冒险" },
  slice: { label: "日常", id: 36, tag: "日常" },
  scifi: { label: "科幻", id: 24, tag: "科幻" },
  mystery: { label: "懸疑／推理", id: 7, tag: "悬疑" },
  sports: { label: "運動", id: 30, tag: "运动" },
  horror: { label: "恐怖", id: 14, tag: "恐怖" },
} as const;
export type CatalogFilters = {
  format?: keyof typeof formats | "";
  genre?: keyof typeof genres | "";
  upcomingOnly?: boolean;
  sort?: "popularity" | "score" | "title";
};
export function jikanFilterParams(filters: CatalogFilters) {
  const params = new URLSearchParams();
  if (filters.format) params.set("type", filters.format);
  if (filters.genre) params.set("genres", String(genres[filters.genre].id));
  return params;
}
export function bangumiFilterTags(filters: CatalogFilters) {
  return [
    filters.format && formats[filters.format].tag,
    filters.genre && genres[filters.genre].tag,
  ].filter(Boolean) as string[];
}
export function jikanPagination(
  raw: {
    pagination?: {
      last_visible_page?: number;
      has_next_page?: boolean;
      items?: { total?: number };
    };
    data?: unknown[];
  },
  page: number,
) {
  const p = raw.pagination;
  const totalItems = p?.items?.total;
  const totalPages =
    totalItems === 0
      ? 0
      : (p?.last_visible_page ?? (p?.has_next_page ? undefined : page));
  return {
    totalItems,
    totalPages,
    hasNext: totalPages === undefined ? !!p?.has_next_page : page < totalPages,
  };
}
export function bangumiPagination(total: number, page: number) {
  const totalItems = Math.max(0, total),
    totalPages = Math.ceil(totalItems / 20);
  return { totalItems, totalPages, hasNext: page < totalPages };
}
export function validPage(value: string, max: number | undefined) {
  const page = Number(value);
  return /^\d+$/.test(value) &&
    Number.isSafeInteger(page) &&
    page >= 1 &&
    (max === undefined || page <= max)
    ? page
    : null;
}

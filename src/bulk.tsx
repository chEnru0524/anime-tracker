import { useEffect, useState } from "react";
import { useStore } from "./store";
import { title, type Anime } from "./model";
import { AnimeCard } from "./components";

export function BulkCatalog({ items }: { items: Anime[] }) {
  const s = useStore();
  const [selected, setSelected] = useState<number[]>([]);
  const key = items.map((a) => a.id).join(",");
  useEffect(() => setSelected([]), [key]);
  const available = items.filter(
    (a) =>
      !s.records.some(
        (r) =>
          r.anime.id === a.id ||
          (a.ja && a.ja === r.anime.ja && a.year === r.anime.year),
      ),
  );
  const chosen = available.filter((a) => selected.includes(a.id));
  return (
    <>
      <div className="bulk-bar">
        <button
          disabled={s.busy || !available.length}
          onClick={() => setSelected(available.map((a) => a.id))}
        >
          選取本頁未收藏
        </button>
        <button onClick={() => setSelected([])}>取消選取</button>
        <span>已選 {chosen.length} 部</span>
        <button
          disabled={s.busy || !chosen.length}
          onClick={async () => {
            if (await s.addMany(chosen, "planned")) setSelected([]);
          }}
        >
          批次加入想看
        </button>
        <button
          disabled={s.busy || !chosen.length}
          onClick={async () => {
            if (await s.addMany(chosen, "watching")) setSelected([]);
          }}
        >
          批次開始觀看
        </button>
      </div>
      <div className="anime-grid">
        {items.map((a) => (
          <div key={a.id} className="bulk-card">
            <label className="bulk-choice">
              <input
                type="checkbox"
                aria-label={`選取 ${title(a)}`}
                disabled={s.busy || !available.some((x) => x.id === a.id)}
                checked={chosen.some((x) => x.id === a.id)}
                onChange={(e) =>
                  setSelected(
                    e.target.checked
                      ? [...selected, a.id]
                      : selected.filter((id) => id !== a.id),
                  )
                }
              />
              選取
            </label>
            <AnimeCard anime={a} />
          </div>
        ))}
      </div>
    </>
  );
}

import { z } from "zod";
import { db } from "./db";
import {
  emptySyncState,
  watchEventSchema,
  bindingSchema,
  type WatchEvent,
  type Binding,
} from "./bahamut-schema";
import { matchingBinding, mergeWatch, bahamutRecord } from "./bahamut-merge";
export async function readSync() {
  return (await (await db).get("bahamut", "state")) ?? emptySyncState();
}
function notify() {
  if (typeof window !== "undefined")
    window.dispatchEvent(new Event("yoru-bahamut"));
  if (typeof BroadcastChannel !== "undefined") {
    const c = new BroadcastChannel("yoru");
    c.postMessage("changed");
    c.close();
  }
}
export async function receiveEvents(input: unknown) {
  const events = z.array(watchEventSchema).max(100).parse(input);
  const tx = (await db).transaction(["bahamut", "records"], "readwrite");
  const state =
    (await tx.objectStore("bahamut").get("state")) ?? emptySyncState();
  for (const event of events) {
    if (
      state.applied.includes(event.id) ||
      state.pending.some((e) => e.id === event.id)
    )
      continue;
    const binding = matchingBinding(event, state.bindings);
    let record =
      binding && (await tx.objectStore("records").get(binding.animeId));
    if (
      !binding &&
      !state.excludedSeries?.includes(event.seriesId) &&
      !state.bindings.some((b) => b.seriesId === event.seriesId) &&
      event.kind === "live" &&
      event.episode !== null
    ) {
      const draft = bahamutRecord(event);
      record = (await tx.objectStore("records").get(draft.anime.id)) ?? draft;
    }
    let saved = false;
    if (event.kind === "live" && record) {
      try {
        const merged = mergeWatch(
          record,
          event,
          binding ?? {
            seriesId: event.seriesId,
            animeId: record.anime.id,
            from: 1,
            to: 100000,
            offset: 0,
          },
        );
        await tx.objectStore("records").put(merged);
        state.applied.push(event.id);
        saved = true;
      } catch {
        /* An episode mismatch stays in the review inbox. */
      }
    }
    if (!saved) {
      if (state.pending.length >= 10000) {
        tx.abort();
        await tx.done.catch(() => {});
        throw new Error("待處理紀錄已滿，請先處理同步收件匣。");
      }
      state.pending.push(event);
    }
  }
  state.applied = state.applied.slice(-20000);
  await tx.objectStore("bahamut").put(state, "state");
  await tx.done;
  notify();
  return events.map((e) => e.id);
}
export async function saveBinding(input: Binding) {
  const b = bindingSchema.parse(input);
  const tx = (await db).transaction(["bahamut", "records"], "readwrite");
  const record = await tx.objectStore("records").get(b.animeId);
  if (!record) {
    tx.abort();
    await tx.done.catch(() => {});
    throw new Error("請先將作品加入我的動畫。");
  }
  if (
    record.anime.episodes !== null &&
    b.to + b.offset > record.anime.episodes
  ) {
    tx.abort();
    await tx.done.catch(() => {});
    throw new Error("配對範圍超過此作品總集數，請檢查偏移與季度。");
  }
  const s = (await tx.objectStore("bahamut").get("state")) ?? emptySyncState();
  if (
    s.bindings.some(
      (x) => x.seriesId === b.seriesId && x.from <= b.to && b.from <= x.to,
    )
  ) {
    tx.abort();
    await tx.done.catch(() => {});
    throw new Error("此動畫瘋作品已有重疊的集數配對，請先移除舊配對。");
  }
  s.bindings.push(b);
  await tx.objectStore("bahamut").put(s, "state");
  await tx.done;
  notify();
}
export async function removeBinding(index: number) {
  const tx = (await db).transaction("bahamut", "readwrite");
  const s = (await tx.store.get("state")) ?? emptySyncState();
  s.bindings.splice(index, 1);
  await tx.store.put(s, "state");
  await tx.done;
  notify();
}
export async function reviewEvent(
  id: string,
  action: "apply" | "dismiss",
  animeId?: number,
  episode?: number,
  autoAdd = false,
) {
  const tx = (await db).transaction(["bahamut", "records"], "readwrite");
  const s = (await tx.objectStore("bahamut").get("state")) ?? emptySyncState();
  const event = s.pending.find((e) => e.id === id);
  if (!event) {
    await tx.done;
    return;
  }
  if (action === "apply") {
    const b = matchingBinding(event, s.bindings);
    const selected = animeId ?? b?.animeId;
    let record = selected
      ? await tx.objectStore("records").get(selected)
      : undefined;
    if (
      !record &&
      autoAdd &&
      !selected &&
      !s.bindings.some((b) => b.seriesId === event.seriesId)
    ) {
      const draft = bahamutRecord(event);
      record = (await tx.objectStore("records").get(draft.anime.id)) ?? draft;
    }
    if (!record) {
      tx.abort();
      await tx.done.catch(() => {});
      throw new Error("請選擇收藏中的對應作品。");
    }
    let updated;
    try {
      updated = mergeWatch(
        record,
        event,
        b ?? {
          seriesId: event.seriesId,
          animeId: record.anime.id,
          from: 1,
          to: 100000,
          offset: 0,
        },
        episode,
      );
    } catch (e) {
      tx.abort();
      await tx.done.catch(() => {});
      throw e;
    }
    await tx.objectStore("records").put(updated);
    s.excludedSeries = s.excludedSeries?.filter((id) => id !== event.seriesId);
  }
  s.pending = s.pending.filter((e) => e.id !== id);
  s.applied = [...s.applied, id].slice(-20000);
  await tx.objectStore("bahamut").put(s, "state");
  await tx.done;
  notify();
}
export async function applyMappedLive() {
  const state = await readSync();
  for (const e of state.pending.filter((e) => e.kind === "live")) {
    if (matchingBinding(e, state.bindings)) {
      try {
        await reviewEvent(e.id, "apply");
      } catch {
        /* Retain mismatches for review. */
      }
    }
  }
}
export type { WatchEvent };

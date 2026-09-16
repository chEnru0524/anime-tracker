import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { it, expect } from "vitest";
it("worker validates senders, preserves queue until ACK and serializes concurrent writes", async () => {
  let internal: any, external: any;
  const data: Record<string, any> = {};
  const id = "a".repeat(32),
    runtime = {
      id,
      getURL: (p: string) => `chrome-extension://${id}/${p}`,
      onMessage: { addListener: (f: any) => (internal = f) },
      onMessageExternal: { addListener: (f: any) => (external = f) },
    };
  const storage = {
    setAccessLevel: async () => {},
    get: async (k: string) => structuredClone({ [k]: data[k] }),
    set: async (v: any) => Object.assign(data, structuredClone(v)),
  };
  runInNewContext(readFileSync("extension-dist/worker.js", "utf8"), {
    chrome: { runtime, storage: { local: storage } },
    URL,
    console,
    setTimeout,
    clearTimeout,
    structuredClone,
  });
  const call = (listener: any, message: any, sender: any): Promise<any> =>
    new Promise((resolve) => listener(message, sender, resolve));
  const popup = { id, url: runtime.getURL("popup.html") },
    sender = {
      id,
      frameId: 0,
      url: "https://ani.gamer.com.tw/animeVideo.php?sn=456",
    },
    tracker = { url: "https://chenru0524.github.io/anime-tracker/#/sync" };
  expect(
    await call(
      internal,
      { type: "CONFIG", value: { enabled: true, threshold: 80 } },
      popup,
    ),
  ).toEqual({ ok: true });
  const event = {
    id: "one",
    kind: "live",
    seriesId: "123",
    videoId: "456",
    title: "Test",
    episode: 8,
    episodeLabel: "8",
    ratio: 0.8,
    threshold: 80,
    watchedAt: "2026-09-16T00:00:00.000Z",
    capturedAt: "2026-09-16T00:00:00.000Z",
    evidence: "played-ranges",
  };
  await Promise.all(
    ["one", "two"].map((x) =>
      call(
        internal,
        { type: "ENQUEUE", events: [{ ...event, id: x }] },
        sender,
      ),
    ),
  );
  expect(data.state.queue).toHaveLength(2);
  expect(
    (
      await call(
        external,
        { protocol: "yoru-bahamut-v1", type: "PULL" },
        { url: "https://chenru0524.github.io/other/" },
      )
    ).ok,
  ).toBe(false);
  expect(
    (
      await call(
        internal,
        { type: "ENQUEUE", events: [event] },
        { ...sender, url: "https://evil.test/" },
      )
    ).ok,
  ).toBe(false);
  expect(
    (
      await call(
        external,
        { protocol: "yoru-bahamut-v1", type: "PULL" },
        tracker,
      )
    ).events,
  ).toHaveLength(2);
  expect(data.state.queue).toHaveLength(2);
  await call(
    external,
    { protocol: "yoru-bahamut-v1", type: "ACK", ids: ["one"] },
    tracker,
  );
  expect(data.state.queue.map((e: any) => e.id)).toEqual(["two"]);
});

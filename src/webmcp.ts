import { readLibrary } from "./db";
import { title } from "./model";
type ModelContext = {
  registerTool: (
    tool: {
      name: string;
      description: string;
      inputSchema: object;
      annotations: object;
      execute: (input: unknown) => Promise<unknown>;
    },
    options: { signal: AbortSignal },
  ) => void | Promise<void>;
};
export function registerLibraryTool() {
  const context = (document as Document & { modelContext?: ModelContext })
    .modelContext;
  if (!context?.registerTool) return () => {};
  const lifecycle = new AbortController();
  try {
    void Promise.resolve(
      context.registerTool(
        {
          name: "read_anime_library",
          description:
            "Read saved anime titles, watching status and episode progress from this device. Does not modify records.",
          inputSchema: {
            type: "object",
            properties: {},
            additionalProperties: false,
          },
          annotations: { readOnlyHint: true, untrustedContentHint: true },
          async execute(input) {
            if (
              !input ||
              typeof input !== "object" ||
              Array.isArray(input) ||
              Object.keys(input).length
            )
              throw new Error("Expected an empty object.");
            return (await readLibrary()).map((r) => ({
              id: r.anime.id,
              title: title(r.anime),
              status: r.status,
              progress: r.progress,
              episodes: r.anime.episodes,
            }));
          },
        },
        { signal: lifecycle.signal },
      ),
    ).catch(() => {});
  } catch {
    /* Optional browser capability. */
  }
  return () => lifecycle.abort();
}

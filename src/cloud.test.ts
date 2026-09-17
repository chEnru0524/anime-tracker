import { describe, expect, it } from "vitest";
import {
  configSchema,
  cloudBackup,
  writeCloud,
  type CloudClient,
} from "./cloud";
describe("cloud safety", () => {
  it("rejects privileged keys and arbitrary credential endpoints", () => {
    expect(
      configSchema.safeParse({
        url: "https://example.com",
        key: "sb_publishable_test",
      }).success,
    ).toBe(false);
    expect(
      configSchema.safeParse({
        url: "https://test.supabase.co",
        key: "sb_secret_test",
      }).success,
    ).toBe(false);
    expect(
      configSchema.safeParse({
        url: "https://test.supabase.co",
        key: "sb_publishable_test",
      }).success,
    ).toBe(true);
  });
  it("does not export device-specific extension connection settings", () => {
    expect(
      cloudBackup({
        app: "yoru",
        version: 1,
        exportedAt: new Date().toISOString(),
        records: [],
        settings: {
          region: "台灣",
          bahamut: { extensionId: "a".repeat(32), enabled: true },
        },
      }).settings,
    ).toEqual({ region: "台灣" });
  });
  it("reports concurrent writes rather than retrying and overwriting", async () => {
    const client = {
      rpc: async () => ({ error: { message: "revision_conflict" } }),
    } as unknown as CloudClient;
    await expect(
      writeCloud(
        client,
        {
          app: "yoru",
          version: 1,
          exportedAt: new Date().toISOString(),
          records: [],
          settings: { region: "台灣" },
        },
        1,
      ),
    ).rejects.toThrow("另一台裝置");
  });
});

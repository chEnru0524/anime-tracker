import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { backupSchema, type Backup } from "./model";

export const configSchema = z.object({
  url: z
    .string()
    .regex(
      /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/,
      "請填寫 Supabase Project URL",
    ),
  key: z
    .string()
    .regex(
      /^sb_publishable_[A-Za-z0-9_-]+$/,
      "只接受 Publishable key，請勿輸入 secret 或 service_role key",
    ),
});
export type CloudConfig = z.infer<typeof configSchema>;
export function readCloudConfig(): CloudConfig | null {
  try {
    const built = configSchema.safeParse({
      url: import.meta.env.VITE_SUPABASE_URL,
      key: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    });
    if (built.success) return built.data;
    return configSchema.parse(
      JSON.parse(localStorage.getItem("yoru-cloud-config") || "null"),
    );
  } catch {
    return null;
  }
}
export function cloudClient(config: CloudConfig) {
  config = configSchema.parse(config);
  return createClient(config.url, config.key, {
    auth: {
      detectSessionInUrl: false,
      storageKey: `yoru-auth-${new URL(config.url).hostname}`,
    },
  });
}
export type CloudClient = ReturnType<typeof cloudClient>;
export const cloudRow = z.object({
  revision: z.number().int().positive(),
  payload: backupSchema,
  updated_at: z.string(),
});
export type CloudRow = z.infer<typeof cloudRow>;
export function cloudBackup(backup: Backup): Backup {
  // Extension IDs and enabled flags belong to one browser, never to the account.
  return backupSchema.parse({
    ...backup,
    settings: { region: backup.settings.region },
  });
}
export async function readCloud(client: CloudClient): Promise<CloudRow | null> {
  const {
    data: { user },
    error: authError,
  } = await client.auth.getUser();
  if (authError || !user) throw new Error("請重新登入");
  const { data, error } = await client
    .from("yoru_backups")
    .select("revision,payload,updated_at")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) throw new Error("無法讀取雲端資料。請檢查網路及專案 SQL 設定。");
  return data ? cloudRow.parse(data) : null;
}
export async function writeCloud(
  client: CloudClient,
  backup: Backup,
  revision: number,
) {
  const { error } = await client.rpc("save_yoru_backup", {
    expected_revision: revision,
    new_payload: cloudBackup(backup),
  });
  if (error)
    throw new Error(
      error.message.includes("revision_conflict")
        ? "另一台裝置已更新雲端紀錄。請重新讀取並確認，尚未覆蓋任何資料。"
        : "上傳失敗，請檢查網路及專案設定。本機紀錄仍保留。",
    );
}

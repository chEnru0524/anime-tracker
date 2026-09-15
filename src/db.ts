import { openDB, type DBSchema } from "idb";
import {
  backupSchema,
  type Backup,
  type RecordEntry,
  type Settings,
} from "./model";
interface YoruDB extends DBSchema {
  records: { key: number; value: RecordEntry };
  settings: { key: string; value: Settings };
  cache: { key: string; value: { key: string; at: number; data: unknown } };
}
const db = openDB<YoruDB>("yoru-anime", 1, {
  upgrade(db) {
    db.createObjectStore("records", { keyPath: "anime.id" });
    db.createObjectStore("settings");
    db.createObjectStore("cache", { keyPath: "key" });
  },
});
export async function readLibrary() {
  return (await db).getAll("records");
}
export async function saveRecord(r: RecordEntry) {
  return (await db).put("records", r);
}
export async function deleteRecord(id: number) {
  return (await db).delete("records", id);
}
export async function readSettings() {
  return (await db)
    .get("settings", "preferences")
    .then((s) => s ?? { region: "台灣" });
}
export async function saveSettings(s: Settings) {
  return (await db).put("settings", s, "preferences");
}
export async function readCache(key: string) {
  try {
    return await (await db).get("cache", key);
  } catch {
    return undefined;
  }
}
export async function writeCache(key: string, data: unknown) {
  try {
    await (await db).put("cache", { key, at: Date.now(), data });
  } catch {
    /* A public API cache is optional; personal writes still report errors. */
  }
}
export async function makeBackup(): Promise<Backup> {
  return {
    app: "yoru",
    version: 1,
    exportedAt: new Date().toISOString(),
    records: await readLibrary(),
    settings: await readSettings(),
  };
}
export async function restoreBackup(input: unknown) {
  const b = backupSchema.parse(input);
  const tx = (await db).transaction(["records", "settings"], "readwrite");
  await tx.objectStore("records").clear();
  for (const r of b.records) await tx.objectStore("records").put(r);
  await tx.objectStore("settings").put(b.settings, "preferences");
  await tx.done;
  if (typeof BroadcastChannel !== "undefined") {
    const channel = new BroadcastChannel("yoru");
    channel.postMessage("restored");
    channel.close();
  }
}

import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { expect, it } from "vitest";

it("Postgres policies isolate accounts, deny anonymous access and reject stale revisions", async () => {
  const pg = new PGlite();
  try {
    await pg.exec(`create role anon; create role authenticated; create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid$$;
      grant usage on schema auth to anon, authenticated;
      grant execute on function auth.uid() to anon, authenticated;
      insert into auth.users values ('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002');`);
    await pg.exec(
      readFileSync(new URL("../supabase.sql", import.meta.url), "utf8"),
    );
    const payload = JSON.stringify({ app: "yoru", version: 1, records: [] });
    await pg.exec(
      `set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';`,
    );
    await pg.query("select public.save_yoru_backup(0,$1::jsonb)", [payload]);
    expect(
      (await pg.query("select * from public.yoru_backups")).rows,
    ).toHaveLength(1);
    await expect(
      pg.query("select public.save_yoru_backup(0,$1::jsonb)", [payload]),
    ).rejects.toThrow("revision_conflict");
    await expect(
      pg.query("update public.yoru_backups set revision=99"),
    ).rejects.toThrow("permission denied");
    await pg.exec(
      `set request.jwt.claim.sub='00000000-0000-0000-0000-000000000002';`,
    );
    expect(
      (await pg.query("select * from public.yoru_backups")).rows,
    ).toHaveLength(0);
    await pg.query("select public.save_yoru_backup(0,$1::jsonb)", [payload]);
    expect(
      (await pg.query<{ user_id: string }>("select * from public.yoru_backups"))
        .rows[0].user_id,
    ).toBe("00000000-0000-0000-0000-000000000002");
    await pg.exec(`reset role; set role anon; set request.jwt.claim.sub='';`);
    await expect(pg.query("select * from public.yoru_backups")).rejects.toThrow(
      "permission denied",
    );
    await expect(
      pg.query("select public.save_yoru_backup(0,$1::jsonb)", [payload]),
    ).rejects.toThrow("permission denied");
  } finally {
    await pg.close();
  }
}, 30000);

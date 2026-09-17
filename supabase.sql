-- Run once in your hosted Supabase project's SQL Editor.
begin;
create table if not exists public.yoru_backups (
  user_id uuid primary key references auth.users(id) on delete cascade,
  revision integer not null check (revision > 0),
  payload jsonb not null check (jsonb_typeof(payload) = 'object' and payload->>'app' = 'yoru' and payload->>'version' = '1' and jsonb_typeof(payload->'records') = 'array'),
  updated_at timestamptz not null default now()
);
alter table public.yoru_backups enable row level security;
revoke all on public.yoru_backups from anon, authenticated;
grant select on public.yoru_backups to authenticated;
drop policy if exists own_backup on public.yoru_backups;
create policy own_backup on public.yoru_backups for select to authenticated using ((select auth.uid()) = user_id);

create or replace function public.save_yoru_backup(expected_revision integer, new_payload jsonb)
returns integer language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); next_revision integer;
begin
  if uid is null then raise exception 'authentication_required'; end if;
  if expected_revision < 0 or expected_revision is null or new_payload is null or pg_column_size(new_payload) > 20000000 then raise exception 'invalid_payload'; end if;
  -- Serialize writes for this account, including the first insert.
  perform pg_advisory_xact_lock(hashtextextended(uid::text, 0));
  if coalesce((select revision from public.yoru_backups where user_id = uid), 0) <> expected_revision then
    raise exception 'revision_conflict';
  end if;
  next_revision := expected_revision + 1;
  insert into public.yoru_backups(user_id,revision,payload) values(uid,next_revision,new_payload)
  on conflict(user_id) do update set revision=excluded.revision,payload=excluded.payload,updated_at=now();
  return next_revision;
end $$;
revoke all on function public.save_yoru_backup(integer,jsonb) from public, anon;
grant execute on function public.save_yoru_backup(integer,jsonb) to authenticated;
commit;

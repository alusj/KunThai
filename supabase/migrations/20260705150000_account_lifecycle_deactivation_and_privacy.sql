-- Account lifecycle: self-service deletion, deactivation, and server-synced privacy settings.

-- 1) Account deactivation flag. When set, the profile is hidden from people
--    search and directories and renders as "Account unavailable" to others
--    until the owner reactivates it.
alter table public.explore_profiles
  add column if not exists deactivated_at timestamptz;

comment on column public.explore_profiles.deactivated_at is
  'When set, the profile is hidden from search/directories and shows as unavailable until the owner clears it.';

-- 2) Server-synced privacy settings. The client already targets this table
--    (explore_user_privacy_settings) and silently falls back to localStorage
--    while it does not exist.
create table if not exists public.explore_user_privacy_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.explore_user_privacy_settings enable row level security;

drop policy if exists explore_user_privacy_settings_owner_select on public.explore_user_privacy_settings;
create policy explore_user_privacy_settings_owner_select
  on public.explore_user_privacy_settings for select
  using (auth.uid() = user_id);

drop policy if exists explore_user_privacy_settings_owner_insert on public.explore_user_privacy_settings;
create policy explore_user_privacy_settings_owner_insert
  on public.explore_user_privacy_settings for insert
  with check (auth.uid() = user_id);

drop policy if exists explore_user_privacy_settings_owner_update on public.explore_user_privacy_settings;
create policy explore_user_privacy_settings_owner_update
  on public.explore_user_privacy_settings for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists explore_user_privacy_settings_owner_delete on public.explore_user_privacy_settings;
create policy explore_user_privacy_settings_owner_delete
  on public.explore_user_privacy_settings for delete
  using (auth.uid() = user_id);

-- 3) Self-service account deletion. Deletes the caller's auth user; ON DELETE
--    CASCADE removes their data. Tables referencing auth.users WITHOUT cascade
--    are discovered dynamically and cleared first so a new table can never
--    break deletion.
create or replace function public.delete_kunthai_account()
returns void
language plpgsql
security definer
set search_path to 'public', 'auth', 'pg_catalog'
as $$
declare
  uid uuid := auth.uid();
  fk record;
begin
  if uid is null then
    raise exception 'You must be signed in to delete your account.';
  end if;

  for fk in
    select n.nspname as sch, c.relname as tbl, a.attname as col
    from pg_constraint con
    join pg_class c on c.oid = con.conrelid
    join pg_namespace n on n.oid = c.relnamespace
    join pg_class t on t.oid = con.confrelid
    join pg_namespace tn on tn.oid = t.relnamespace
    join lateral unnest(con.conkey) as ck(attnum) on true
    join pg_attribute a on a.attrelid = c.oid and a.attnum = ck.attnum
    where con.contype = 'f'
      and tn.nspname = 'auth'
      and t.relname = 'users'
      and con.confdeltype not in ('c', 'n')
      and n.nspname = 'public'
  loop
    execute format('delete from %I.%I where %I = $1', fk.sch, fk.tbl, fk.col) using uid;
  end loop;

  -- No FK links kunthai_account_identities cleanup is covered by its own
  -- cascade; keep an explicit delete as a safety net for legacy rows.
  delete from public.kunthai_account_identities where user_id = uid;

  delete from auth.users where id = uid;
end;
$$;

revoke all on function public.delete_kunthai_account() from public;
grant execute on function public.delete_kunthai_account() to authenticated;

-- Why people delete their accounts (2026-10-31).
--
-- Every delete button (the KunThai account, a UrMall business, a UrRide
-- operator account, a UrRide company, an Explore Space) now asks why, with
-- suggested reasons and a free-text note; both may be left empty. The answer
-- is kept here, one row per deletion, and listed in the admin console under
-- "Deleted accounts" (support.view).
--
-- The row is written just before the deletion (record_account_deletion) and
-- withdrawn if the deletion fails (withdraw_account_deletion). user_id has no
-- foreign key on purpose: a deleted KunThai account's row stays, with the
-- name and email it had, so admins still see who left and why.
--
-- Safe to run more than once.

begin;

create table if not exists public.account_deletions (
  id uuid primary key default gen_random_uuid(),
  surface text not null,
  target_id text,
  target_name text not null default '',
  user_id uuid,
  account_name text not null default '',
  username text not null default '',
  email text not null default '',
  reasons text[] not null default '{}',
  note text not null default '',
  created_at timestamptz not null default now(),
  constraint account_deletions_surface_check check (surface in ('kunthai_account', 'urmall_business', 'urride_operator', 'urride_company', 'explore_space')),
  constraint account_deletions_note_length check (char_length(note) <= 1000),
  constraint account_deletions_reasons_count check (cardinality(reasons) <= 10)
);

create index if not exists account_deletions_created_idx on public.account_deletions (created_at desc);

alter table public.account_deletions enable row level security;

drop policy if exists "Support admins read account deletions" on public.account_deletions;
create policy "Support admins read account deletions"
on public.account_deletions for select to authenticated
using (public.admin_has_permission('support.view'));

revoke all on public.account_deletions from anon;
revoke insert, update, delete on public.account_deletions from authenticated;
grant select on public.account_deletions to authenticated;

create or replace function public.record_account_deletion(
  p_surface text,
  p_target_id text default null,
  p_target_name text default '',
  p_reasons text[] default '{}',
  p_note text default ''
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user uuid := auth.uid();
  v_reasons text[];
  v_id uuid;
begin
  if v_user is null then raise exception 'Sign in first'; end if;
  if p_surface not in ('kunthai_account', 'urmall_business', 'urride_operator', 'urride_company', 'explore_space') then
    raise exception 'Unknown account type';
  end if;

  select coalesce(array_agg(reason order by reason), '{}')
  into v_reasons
  from (
    select distinct left(btrim(item), 60) as reason
    from unnest(coalesce(p_reasons, '{}'::text[])) as item
    where btrim(coalesce(item, '')) <> ''
    limit 10
  ) cleaned;

  insert into public.account_deletions (surface, target_id, target_name, user_id, account_name, username, email, reasons, note)
  select
    p_surface,
    nullif(btrim(coalesce(p_target_id, '')), ''),
    left(btrim(coalesce(p_target_name, '')), 200),
    v_user,
    coalesce(nullif(btrim(profile.display_name), ''), nullif(btrim(account.raw_user_meta_data ->> 'full_name'), ''), ''),
    coalesce(profile.username, ''),
    coalesce(account.email, ''),
    v_reasons,
    left(btrim(coalesce(p_note, '')), 1000)
  from auth.users account
  left join public.explore_profiles profile on profile.user_id = account.id
  where account.id = v_user
  returning id into v_id;

  return v_id;
end;
$$;

-- The deletion that followed failed: the person still has the account, so the
-- reason is taken back. Only the caller's own, recent row.
create or replace function public.withdraw_account_deletion(p_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.account_deletions
  where id = p_id
    and user_id = auth.uid()
    and created_at > now() - interval '15 minutes';
$$;

revoke all on function public.record_account_deletion(text, text, text, text[], text) from public, anon;
revoke all on function public.withdraw_account_deletion(uuid) from public, anon;
grant execute on function public.record_account_deletion(text, text, text, text[], text) to authenticated;
grant execute on function public.withdraw_account_deletion(uuid) to authenticated;

commit;

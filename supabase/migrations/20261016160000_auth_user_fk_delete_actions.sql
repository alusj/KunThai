-- Deleting a user no longer blocked by foreign keys (2026-10-16).
--
-- Mirrors the change already applied by hand in production: every public
-- foreign key to auth.users that had no delete action (NO ACTION / RESTRICT)
-- now says what happens when the user is deleted.
--   - Owner columns (user_id, owner_id, owner_user_id, seller_id, profile_id):
--     ON DELETE CASCADE - the row belongs to the person and goes with them.
--   - Every other column is an actor on someone else's record (author,
--     requester, reviewer, creator, approver …): ON DELETE SET NULL, and the
--     column's NOT NULL is dropped where needed, so the record stays and shows
--     "Deleted user".
-- In production this already ran (9 keys, e.g.
-- marketplace_seller_verification_requests.reviewed_by,
-- admin_case_notes.author_user_id, admin_approvals.requested_by/reviewed_by,
-- admin_notification_campaigns.created_by/approved_by), so there it changes
-- nothing; on a fresh database it applies the same rule.
--
-- Also: admin screens name a deleted account "Deleted user" instead of a
-- blank (admin_display_name and the directory notes / notices / actions).
--
-- Safe to run more than once.

do $fk$
declare
  fk record;
  v_action text;
begin
  for fk in
    select con.conname,
           c.oid::regclass as tbl,
           a.attname as col,
           a.attnotnull as not_null,
           ra.attname as ref_col
    from pg_constraint con
    join pg_class c on c.oid = con.conrelid
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = con.conrelid and a.attnum = con.conkey[1]
    join pg_attribute ra on ra.attrelid = con.confrelid and ra.attnum = con.confkey[1]
    where con.contype = 'f'
      and con.confrelid = 'auth.users'::regclass
      and n.nspname = 'public'
      and cardinality(con.conkey) = 1
      and con.confdeltype in ('a', 'r')
  loop
    v_action := case
      when fk.col in ('user_id', 'owner_id', 'owner_user_id', 'seller_id', 'profile_id') then 'cascade'
      else 'set null'
    end;

    if v_action = 'set null' and fk.not_null then
      execute format('alter table %s alter column %I drop not null', fk.tbl, fk.col);
    end if;

    execute format('alter table %s drop constraint %I', fk.tbl, fk.conname);
    execute format(
      'alter table %s add constraint %I foreign key (%I) references auth.users(%I) on delete %s',
      fk.tbl, fk.conname, fk.col, fk.ref_col, v_action
    );
    raise notice '%.% -> on delete %', fk.tbl, fk.col, v_action;
  end loop;
end $fk$;

-- A user id with no account left reads "Deleted user"; no id stays null (the
-- callers turn that into "KunThai system" for automatic actions).
create or replace function public.admin_display_name(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = public, auth
as $$
  select case
    when p_user_id is null then null
    else coalesce((
      select coalesce(
        nullif(profile.display_name, ''),
        users.raw_user_meta_data ->> 'display_name',
        users.raw_user_meta_data ->> 'full_name',
        split_part(users.email, '@', 1),
        'KunThai user'
      )::text
      from auth.users users
      left join public.explore_profiles profile on profile.user_id = users.id
      where users.id = p_user_id
    ), 'Deleted user')
  end;
$$;

revoke all on function public.admin_display_name(uuid) from public, anon, authenticated;

-- Notes, notices and staff actions whose author was deleted (now null).
do $patch$
declare
  fn record;
  def text;
  patched text;
begin
  for fn in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and (p.prosrc like '%admin_display_name(note.author_user_id)%'
        or p.prosrc like '%admin_display_name(notice.sent_by)%'
        or p.prosrc like '%admin_display_name(action.performed_by)%')
  loop
    def := pg_get_functiondef(fn.sig);
    patched := def;
    patched := replace(patched, 'coalesce(public.admin_display_name(note.author_user_id), ''Deleted user'')', 'public.admin_display_name(note.author_user_id)');
    patched := replace(patched, 'public.admin_display_name(note.author_user_id)', 'coalesce(public.admin_display_name(note.author_user_id), ''Deleted user'')');
    patched := replace(patched, 'coalesce(public.admin_display_name(notice.sent_by), ''Deleted user'')', 'public.admin_display_name(notice.sent_by)');
    patched := replace(patched, 'public.admin_display_name(notice.sent_by)', 'coalesce(public.admin_display_name(notice.sent_by), ''Deleted user'')');
    patched := replace(patched, 'coalesce(public.admin_display_name(action.performed_by), ''Deleted user'')', 'public.admin_display_name(action.performed_by)');
    patched := replace(patched, 'public.admin_display_name(action.performed_by)', 'coalesce(public.admin_display_name(action.performed_by), ''Deleted user'')');
    if patched <> def then
      execute patched;
      raise notice 'patched %', fn.sig;
    end if;
  end loop;
end $patch$;

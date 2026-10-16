-- Account deletion: two more guards that refused the clean-up (2026-10-16).
--
-- Deleting a user sets their id to NULL on other people's records
-- (ON DELETE SET NULL). That is an UPDATE, and these triggers refused it, so
-- "Delete my account" failed for:
--   - anyone named in admin history: a user who received an admin direct
--     notification (admin_direct_notifications.recipient_user_id) or was the
--     target of an enforcement action (admin_enforcement_actions
--     .target_owner_user_id); and any staff member who acted on a case, wrote
--     a note or appears in the audit log. admin_prevent_history_mutation():
--     "Admin history is immutable". Same for the UrMall message access log.
--   - any operator who was ever invited to a UrRide company: the invite's
--     operator_user_id is cleared, and transport_guard_company_invite_acceptance
--     saw the recipient changing: "The company and recipient of an invitation
--     cannot be changed by its recipient."
--
-- While kunthai.account_deletion is on (set only inside delete_kunthai_account
-- and delete_transport_company, see 20261016120000):
--   - history tables accept the UPDATE, so the row is kept with the person
--     cleared ("Deleted user"); DELETE stays refused, history is never erased;
--   - the invite guard stands aside.
-- Outside a deletion nothing changes.
--
-- Safe to run more than once. Run after 20261016120000.

create or replace function public.account_deletion_in_progress()
returns boolean
language sql
stable
as $$
  select coalesce(current_setting('kunthai.account_deletion', true), '') = 'on';
$$;

create or replace function public.admin_prevent_history_mutation()
returns trigger
language plpgsql
as $$
begin
  -- A deleted account's id is cleared from history; the row itself stays.
  if tg_op = 'UPDATE' and public.account_deletion_in_progress() then
    return new;
  end if;
  raise exception 'Admin history is immutable';
end;
$$;

create or replace function public.admin_prevent_marketplace_message_access_log_mutation()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and public.account_deletion_in_progress() then
    return new;
  end if;
  raise exception 'UrMall message access history is immutable';
end;
$$;

-- Invite guard: return early during a deletion (patched in place so the live
-- body, which has changed several times, is kept as it is).
do $patch$
declare
  fn text := 'public.transport_guard_company_invite_acceptance()';
  def text;
  patched text;
begin
  if to_regprocedure(fn) is null then
    raise notice '% not found, skipped', fn;
    return;
  end if;
  def := pg_get_functiondef(fn::regprocedure);
  if position('account_deletion_in_progress' in def) > 0 then
    return;
  end if;
  patched := regexp_replace(
    def,
    '(AS \$function\$.*?\mbegin\M)',
    E'\\1\n  -- Account or company deletion in progress: cascaded clean-up, not an edit.\n  if public.account_deletion_in_progress() then\n    if tg_op = ''DELETE'' then return old; end if;\n    return new;\n  end if;'
  );
  if patched = def then
    raise exception 'Could not patch %', fn;
  end if;
  execute patched;
end $patch$;

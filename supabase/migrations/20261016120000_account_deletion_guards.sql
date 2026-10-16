-- Account / company deletion: let protection triggers stand aside (2026-10-16).
--
-- Deleting an account cascades through the database: reviews lose their
-- reviewer (ON DELETE SET NULL) and an owner's company fleets are removed.
-- Three guards treated those clean-up writes as tampering and refused, so
-- "Delete my account" failed:
--   - guard_transport_review_update / guard_marketplace_review_update:
--     "Review details cannot be changed."
--   - guard_company_rental_fleet: "Only the company owner or an active admin
--     can manage rentals." (the company row is already gone mid-cascade)
--
-- delete_kunthai_account() and delete_transport_company() now set the
-- transaction-local flag kunthai.account_deletion (same pattern as
-- kunthai.review_edit), and these guards return early while it is on. The
-- flag cannot be set by the app: it is only set inside those two functions,
-- after their own sign-in / ownership checks run in the same transaction.
--
-- Safe to run more than once. Run after file 18 (20261015170000).

create or replace function public.account_deletion_in_progress()
returns boolean
language sql
stable
as $$
  select coalesce(current_setting('kunthai.account_deletion', true), '') = 'on';
$$;

-- Guards: return early during a deletion.
do $patch$
declare
  fn text;
  def text;
  patched text;
begin
  foreach fn in array array[
    'public.guard_transport_review_update()',
    'public.guard_marketplace_review_update()',
    'public.guard_company_rental_fleet()'
  ] loop
    if to_regprocedure(fn) is null then
      raise notice '% not found, skipped', fn;
      continue;
    end if;
    def := pg_get_functiondef(fn::regprocedure);
    if position('account_deletion_in_progress' in def) > 0 then
      continue;
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
  end loop;
end $patch$;

-- Deletion functions: switch the flag on for their transaction.
do $patch$
declare
  fn text;
  def text;
  patched text;
begin
  foreach fn in array array[
    'public.delete_kunthai_account()',
    'public.delete_transport_company(uuid,text)'
  ] loop
    if to_regprocedure(fn) is null then
      raise notice '% not found, skipped', fn;
      continue;
    end if;
    def := pg_get_functiondef(fn::regprocedure);
    if position('kunthai.account_deletion' in def) > 0 then
      continue;
    end if;
    patched := regexp_replace(
      def,
      '(AS \$function\$.*?\mbegin\M)',
      E'\\1\n  perform set_config(''kunthai.account_deletion'', ''on'', true);'
    );
    if patched = def then
      raise exception 'Could not patch %', fn;
    end if;
    execute patched;
  end loop;
end $patch$;

-- UrRide: the company creator can delete their transport company (2026-10-15).
--
-- delete_transport_company(p_company_id, p_confirm_name)
--   Owner only. The typed name must match the company name. Refused while a
--   company trip is under way or a rental is confirmed/active. Company fleets
--   operators drive go offline and are detached from the company (their
--   operators keep their personal KunThai accounts and operator profiles).
--   Everything that belongs to the company (members, invites, company fleets,
--   rentals and their reservation history, settings) is removed.
--
-- kunthai_purge_dependents(rel, ids)
--   Internal. Clears rows that would block deleting `ids` from `rel`: rows that
--   reference them through a NO ACTION / RESTRICT foreign key are deleted, and
--   cascade children are visited the same way so their own restrict links do
--   not stop the cascade (e.g. company fleet -> rental -> reservation).
--   ON DELETE SET NULL links are left to Postgres.
--
-- delete_kunthai_account() now removes the person's own company the same way
-- first, so a company with rental history no longer blocks account deletion.
--
-- Safe to run more than once.

create or replace function public.kunthai_purge_dependents(
  p_rel regclass,
  p_ids uuid[],
  p_depth integer default 0
)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_catalog'
as $$
declare
  fk record;
  child_ids uuid[];
  child_has_id boolean;
begin
  if p_ids is null or cardinality(p_ids) = 0 or p_depth > 8 then
    return;
  end if;

  for fk in
    select con.conrelid::regclass as child,
           ca.attname as col,
           con.confdeltype as action
    from pg_constraint con
    join pg_class c on c.oid = con.conrelid
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute ca on ca.attrelid = con.conrelid and ca.attnum = con.conkey[1]
    join pg_attribute pa on pa.attrelid = con.confrelid and pa.attnum = con.confkey[1]
    where con.contype = 'f'
      and con.confrelid = p_rel
      and cardinality(con.conkey) = 1
      and pa.attname = 'id'
      and n.nspname = 'public'
      and con.conrelid <> con.confrelid
      and con.confdeltype in ('a', 'r', 'c')
  loop
    select exists (
      select 1 from pg_attribute
      where attrelid = fk.child and attname = 'id' and atttypid = 'uuid'::regtype and not attisdropped
    ) into child_has_id;

    if child_has_id then
      execute format('select coalesce(array_agg(id), ''{}''::uuid[]) from %s where %I = any($1)', fk.child, fk.col)
        into child_ids using p_ids;
      perform public.kunthai_purge_dependents(fk.child, child_ids, p_depth + 1);
    end if;

    if fk.action in ('a', 'r') then
      execute format('delete from %s where %I = any($1)', fk.child, fk.col) using p_ids;
    end if;
  end loop;
end;
$$;

revoke all on function public.kunthai_purge_dependents(regclass, uuid[], integer) from public;
revoke all on function public.kunthai_purge_dependents(regclass, uuid[], integer) from anon, authenticated;

create or replace function public.delete_transport_company(
  p_company_id uuid,
  p_confirm_name text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_catalog'
as $$
declare
  uid uuid := auth.uid();
  v_company public.transport_companies;
  v_busy boolean := false;
begin
  if uid is null then
    raise exception 'Sign in to delete this company.';
  end if;

  select * into v_company from public.transport_companies where id = p_company_id for update;
  if not found then
    raise exception 'This company no longer exists.';
  end if;
  if v_company.owner_user_id is distinct from uid then
    raise exception 'Only the company creator can delete this company.';
  end if;
  if lower(btrim(coalesce(p_confirm_name, ''))) <> lower(btrim(v_company.company_name)) then
    raise exception 'Type the company name exactly to confirm.';
  end if;

  if to_regclass('public.transport_trips') is not null then
    execute $q$
      select exists (
        select 1
        from public.transport_trips trip
        join public.transport_fleets fleet on fleet.id = trip.fleet_id
        where fleet.company_id = $1
          and trip.status in ('accepted', 'arrived', 'start_requested', 'in_progress', 'paused')
      )
    $q$ into v_busy using p_company_id;
    if v_busy then
      raise exception 'A company trip is in progress. Finish or cancel it before deleting the company.';
    end if;
  end if;

  if to_regclass('public.transport_rental_reservations') is not null
     and to_regclass('public.transport_company_rentals') is not null then
    execute $q$
      select exists (
        select 1
        from public.transport_rental_reservations reservation
        join public.transport_company_rentals rental on rental.id = reservation.rental_id
        where rental.company_id = $1
          and reservation.status in ('confirmed', 'active')
      )
    $q$ into v_busy using p_company_id;
    if v_busy then
      raise exception 'A rental is confirmed or active. Complete or cancel it before deleting the company.';
    end if;
  end if;

  -- Operators' vehicles stop being offered under this company straight away.
  update public.transport_fleets
     set active_status = 'offline',
         is_visible_to_passengers = false,
         updated_at = now()
   where company_id = p_company_id;

  perform public.kunthai_purge_dependents('public.transport_companies'::regclass, array[p_company_id]);
  delete from public.transport_companies where id = p_company_id;

  return jsonb_build_object('deleted', true, 'company_id', p_company_id);
end;
$$;

revoke all on function public.delete_transport_company(uuid, text) from public;
revoke all on function public.delete_transport_company(uuid, text) from anon;
grant execute on function public.delete_transport_company(uuid, text) to authenticated;

-- Same body as 20260705150000_account_lifecycle_deactivation_and_privacy.sql,
-- plus the company clean-up first.
create or replace function public.delete_kunthai_account()
returns void
language plpgsql
security definer
set search_path to 'public', 'auth', 'pg_catalog'
as $$
declare
  uid uuid := auth.uid();
  fk record;
  v_company_ids uuid[];
begin
  if uid is null then
    raise exception 'You must be signed in to delete your account.';
  end if;

  if to_regclass('public.transport_companies') is not null then
    select coalesce(array_agg(id), '{}'::uuid[]) into v_company_ids
    from public.transport_companies where owner_user_id = uid;
    if cardinality(v_company_ids) > 0 then
      update public.transport_fleets
         set active_status = 'offline', is_visible_to_passengers = false, updated_at = now()
       where company_id = any(v_company_ids);
      perform public.kunthai_purge_dependents('public.transport_companies'::regclass, v_company_ids);
      delete from public.transport_companies where id = any(v_company_ids);
    end if;
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

  delete from public.kunthai_account_identities where user_id = uid;

  delete from auth.users where id = uid;
end;
$$;

revoke all on function public.delete_kunthai_account() from public;
grant execute on function public.delete_kunthai_account() to authenticated;

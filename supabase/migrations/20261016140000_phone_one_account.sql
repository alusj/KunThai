-- One phone number, one KunThai account (2026-10-16).
--
-- A phone number used as a contact number on UrMall businesses, UrRide
-- operators, UrRide companies and Explore Spaces must not belong to a
-- different KunThai account. "Belongs" means either:
--   - it is another account's own phone (kunthai_account_identities), or
--   - another account already uses it on one of those four registrations.
-- The same person may reuse their own number everywhere. Emergency contact
-- numbers (transport_operators.emergency_contact) are not checked.
--
-- kunthai_phone_in_use(p_phone, p_country)  -- RPC for the forms' inline
--   check; true/false only, never who holds the number.
-- kunthai_guard_contact_phone()              -- trigger on the four tables;
--   refuses an insert, or an update that changes the phone, with
--   "KT_PHONE_IN_USE". Rows that already share a number keep working until
--   their phone is changed.
--
-- Safe to run more than once.

create or replace function public.kunthai_phone_taken_by_other(
  p_phone text,
  p_country text,
  p_user uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_catalog
as $$
declare
  v_phone text := public.normalize_kunthai_phone(p_phone, p_country);
  v_taken boolean := false;
begin
  if v_phone is null or length(regexp_replace(v_phone, '[^0-9]', '', 'g')) < 6 then
    return false;
  end if;

  if to_regclass('public.kunthai_account_identities') is not null then
    select exists (
      select 1 from public.kunthai_account_identities identity
      where identity.normalized_phone = v_phone
        and identity.user_id is distinct from p_user
    ) into v_taken;
    if v_taken then return true; end if;
  end if;

  if to_regclass('public.marketplace_businesses') is not null then
    execute $q$
      select exists (
        select 1 from public.marketplace_businesses row_
        where row_.user_id is distinct from $2
          and nullif(btrim(coalesce(row_.phone, '')), '') is not null
          and public.normalize_kunthai_phone(row_.phone,
                coalesce(to_jsonb(row_) ->> 'country_iso', to_jsonb(row_) ->> 'country_code', to_jsonb(row_) ->> 'country', $3)) = $1
      )
    $q$ into v_taken using v_phone, p_user, p_country;
    if v_taken then return true; end if;
  end if;

  if to_regclass('public.transport_operators') is not null then
    execute $q$
      select exists (
        select 1 from public.transport_operators row_
        where row_.user_id is distinct from $2
          and nullif(btrim(coalesce(row_.phone, '')), '') is not null
          and public.normalize_kunthai_phone(row_.phone,
                coalesce(to_jsonb(row_) ->> 'country_iso', to_jsonb(row_) ->> 'country_code', to_jsonb(row_) ->> 'country', $3)) = $1
      )
    $q$ into v_taken using v_phone, p_user, p_country;
    if v_taken then return true; end if;
  end if;

  if to_regclass('public.transport_companies') is not null then
    execute $q$
      select exists (
        select 1 from public.transport_companies row_
        where row_.owner_user_id is distinct from $2
          and nullif(btrim(coalesce(row_.phone, '')), '') is not null
          and public.normalize_kunthai_phone(row_.phone,
                coalesce(to_jsonb(row_) ->> 'country_iso', to_jsonb(row_) ->> 'country_code', to_jsonb(row_) ->> 'country', $3)) = $1
      )
    $q$ into v_taken using v_phone, p_user, p_country;
    if v_taken then return true; end if;
  end if;

  if to_regclass('public.explore_spaces') is not null then
    execute $q$
      select exists (
        select 1 from public.explore_spaces row_
        where row_.owner_user_id is distinct from $2
          and nullif(btrim(coalesce(row_.phone, '')), '') is not null
          and public.normalize_kunthai_phone(row_.phone,
                coalesce(to_jsonb(row_) ->> 'country_iso', to_jsonb(row_) ->> 'country_code', to_jsonb(row_) ->> 'country', $3)) = $1
      )
    $q$ into v_taken using v_phone, p_user, p_country;
    if v_taken then return true; end if;
  end if;

  return false;
end;
$$;

revoke all on function public.kunthai_phone_taken_by_other(text, text, uuid) from public, anon, authenticated;

-- Inline check for the signed-in person's forms.
create or replace function public.kunthai_phone_in_use(p_phone text, p_country text default null)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_catalog
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in to check this phone number.';
  end if;
  return public.kunthai_phone_taken_by_other(p_phone, p_country, auth.uid());
end;
$$;

revoke all on function public.kunthai_phone_in_use(text, text) from public, anon;
grant execute on function public.kunthai_phone_in_use(text, text) to authenticated;

-- Trigger: TG_ARGV[0] is the owner column of the table.
create or replace function public.kunthai_guard_contact_phone()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_new jsonb := to_jsonb(new);
  v_owner uuid := nullif(v_new ->> tg_argv[0], '')::uuid;
  v_country text := coalesce(v_new ->> 'country_iso', v_new ->> 'country_code', v_new ->> 'country');
begin
  if nullif(btrim(coalesce(new.phone, '')), '') is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.phone is not distinct from old.phone then
    return new;
  end if;
  if public.kunthai_phone_taken_by_other(new.phone, v_country, v_owner) then
    raise exception 'KT_PHONE_IN_USE: This phone number is already associated with a different KunThai account.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

do $triggers$
declare
  target record;
begin
  for target in
    select * from (values
      ('marketplace_businesses', 'user_id'),
      ('transport_operators', 'user_id'),
      ('transport_companies', 'owner_user_id'),
      ('explore_spaces', 'owner_user_id')
    ) as t(tbl, owner_col)
  loop
    if to_regclass('public.' || target.tbl) is null then
      raise notice '% not found, skipped', target.tbl;
      continue;
    end if;
    execute format('drop trigger if exists kunthai_contact_phone_guard on public.%I', target.tbl);
    execute format(
      'create trigger kunthai_contact_phone_guard before insert or update of phone on public.%I
         for each row execute function public.kunthai_guard_contact_phone(%L)',
      target.tbl, target.owner_col
    );
  end loop;
end $triggers$;

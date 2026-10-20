-- Welcome credits are once per person, not once per account (2026-10-20).
--
-- Deleting an account and signing up again with the same email or phone is
-- allowed, but the new account never gets the free Visibility Credits again:
-- no 5 starter credits, no invite reward for whoever invited it, and no
-- starter credits on Explore Spaces it creates. Purchased credits and credits
-- earned later work as normal.
--
-- When an auth user is deleted (in-app delete, admin, or the dashboard) a
-- one-way SHA-256 hash of its email and phone is kept in
-- deleted_account_identities. Only hashes are stored, never the address or
-- number, and nothing can read the table except these functions.
--
-- Emails are compared in canonical form so "+tags" and Gmail dots do not make
-- a "new" address: J.o.h.n+2@GMail.com == john@gmail.com.

create extension if not exists pgcrypto;

create or replace function public.kunthai_canonical_credit_email(input_email text)
returns text
language plpgsql
immutable
set search_path = public, pg_catalog
as $$
declare
  v_email text := public.normalize_kunthai_email(input_email);
  v_local text;
  v_domain text;
begin
  if v_email is null or position('@' in v_email) = 0 then
    return null;
  end if;

  v_local := split_part(v_email, '@', 1);
  v_domain := substring(v_email from position('@' in v_email) + 1);
  v_local := split_part(v_local, '+', 1);

  if v_domain in ('gmail.com', 'googlemail.com') then
    v_local := replace(v_local, '.', '');
    v_domain := 'gmail.com';
  end if;

  if v_local = '' or v_domain = '' then
    return null;
  end if;

  return v_local || '@' || v_domain;
end;
$$;

-- The email and phone hashes for an auth.users row, read the same way the
-- identity sync reads them (login email/phone first, then profile metadata).
create or replace function public.kunthai_credit_identity_hashes(
  p_email text,
  p_phone text,
  p_meta jsonb
)
returns table (identity_kind text, identity_hash text)
language plpgsql
immutable
set search_path = public, pg_catalog
as $$
declare
  v_email text;
  v_phone text;
begin
  v_email := public.kunthai_canonical_credit_email(coalesce(
    nullif(p_email, ''),
    nullif(p_meta->>'contact_email', '')
  ));
  v_phone := public.normalize_kunthai_phone(
    coalesce(
      nullif(p_phone, ''),
      nullif(p_meta->>'phone_number', ''),
      nullif(p_meta->>'phone', '')
    ),
    coalesce(nullif(p_meta->>'country_code', ''), nullif(p_meta->>'country', ''))
  );

  if v_email is not null then
    identity_kind := 'email';
    identity_hash := public.kunthai_hash_identity('email:' || v_email);
    return next;
  end if;

  if v_phone is not null then
    identity_kind := 'phone';
    identity_hash := public.kunthai_hash_identity('phone:' || v_phone);
    return next;
  end if;
end;
$$;

create table if not exists public.deleted_account_identities (
  identity_hash text primary key,
  identity_kind text not null check (identity_kind in ('email', 'phone')),
  first_deleted_at timestamptz not null default timezone('utc', now()),
  last_deleted_at timestamptz not null default timezone('utc', now()),
  deletion_count integer not null default 1 check (deletion_count > 0)
);

alter table public.deleted_account_identities enable row level security;
revoke all on table public.deleted_account_identities from public, anon, authenticated;
grant select, insert, update, delete on table public.deleted_account_identities to service_role;

comment on table public.deleted_account_identities is
  'One-way hashes of the email/phone of deleted KunThai accounts. A new account with a matching email or phone gets no welcome Visibility Credits.';

create or replace function public.kunthai_is_returning_account(p_user_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public, auth, pg_catalog
as $$
declare
  v_user auth.users;
begin
  if p_user_id is null then
    return false;
  end if;

  select * into v_user from auth.users where id = p_user_id;
  if v_user.id is null then
    return false;
  end if;

  return exists (
    select 1
    from public.kunthai_credit_identity_hashes(v_user.email, v_user.phone, v_user.raw_user_meta_data) h
    join public.deleted_account_identities d on d.identity_hash = h.identity_hash
  );
end;
$$;
revoke all on function public.kunthai_is_returning_account(uuid) from public, anon, authenticated;

-- Remember the email/phone of every real account as it is deleted. Runs
-- before the delete, so the row is still readable however it was deleted.
create or replace function public.remember_deleted_account_identity()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $$
begin
  if old.is_anonymous is true then
    return old;
  end if;

  begin
    insert into public.deleted_account_identities (identity_hash, identity_kind)
    select h.identity_hash, h.identity_kind
    from public.kunthai_credit_identity_hashes(old.email, old.phone, old.raw_user_meta_data) h
    on conflict (identity_hash) do update
      set last_deleted_at = timezone('utc', now()),
          deletion_count = public.deleted_account_identities.deletion_count + 1;
  exception when others then
    -- Never block an account deletion over this record.
    null;
  end;

  return old;
end;
$$;
revoke all on function public.remember_deleted_account_identity() from public, anon, authenticated;

drop trigger if exists remember_deleted_account_identity_on_auth_user on auth.users;
create trigger remember_deleted_account_identity_on_auth_user
before delete on auth.users
for each row execute function public.remember_deleted_account_identity();

-- 1. Starter credits: same as before, plus the returning-account check.
create or replace function public.grant_kunthai_starter_credits(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wallet public.visibility_credit_wallets;
begin
  if p_user_id is null then
    return;
  end if;

  -- Never grant to anonymous guests.
  if exists (select 1 from auth.users u where u.id = p_user_id and u.is_anonymous) then
    return;
  end if;

  -- Already granted once — nothing to do.
  if exists (
    select 1 from public.visibility_credit_transactions
    where user_id = p_user_id and transaction_type = 'starter_bonus'
  ) then
    return;
  end if;

  -- This email or phone already had a KunThai account that was deleted:
  -- the welcome credits were given to that account and are not given again.
  if public.kunthai_is_returning_account(p_user_id) then
    return;
  end if;

  insert into public.visibility_credit_wallets (user_id, balance, lifetime_earned)
  values (p_user_id, 5, 5)
  on conflict (user_id) do update
    set balance = public.visibility_credit_wallets.balance + 5,
        lifetime_earned = public.visibility_credit_wallets.lifetime_earned + 5,
        updated_at = timezone('utc', now())
  returning * into v_wallet;

  insert into public.visibility_credit_transactions (
    user_id, amount, balance_after, transaction_type, surface, reference_type, metadata
  ) values (
    p_user_id, 5, v_wallet.balance, 'starter_bonus', 'platform', 'account_creation',
    jsonb_build_object('reason', 'welcome_bonus')
  );
end;
$$;

-- 2. Invite rewards: a returning account does not earn its inviter credits.
-- The existing function is kept as-is under a new name and wrapped, so every
-- caller (finalize_visibility_invite, the confirmation trigger) gets the check.
-- If apply_visibility_invite is ever redefined, redefine
-- apply_visibility_invite_unchecked instead, or keep this check in it.
do $$
begin
  if to_regprocedure('public.apply_visibility_invite_unchecked(uuid, text)') is null then
    alter function public.apply_visibility_invite(uuid, text) rename to apply_visibility_invite_unchecked;
  end if;
end;
$$;
revoke all on function public.apply_visibility_invite_unchecked(uuid, text) from public, anon, authenticated;

create or replace function public.apply_visibility_invite(
  p_invited_user_id uuid,
  p_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_invited_user_id is not null
    and public.kunthai_is_returning_account(p_invited_user_id)
    and not exists (
      select 1 from public.visibility_invite_events
      where invited_user_id = p_invited_user_id and status = 'credited'
    )
  then
    update public.visibility_invite_events
    set status = 'ineligible', updated_at = timezone('utc', now())
    where invited_user_id = p_invited_user_id and status = 'pending';

    return jsonb_build_object('status', 'ineligible', 'reason', 'returning_account');
  end if;

  return public.apply_visibility_invite_unchecked(p_invited_user_id, p_code);
end;
$$;
revoke all on function public.apply_visibility_invite(uuid, text) from public, anon, authenticated;

-- 3. Explore Space starter credits: not for Spaces owned by a returning account.
create or replace function public.grant_explore_space_starter_credits()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wallet public.explore_space_credit_wallets;
begin
  begin
    if public.kunthai_is_returning_account(new.owner_user_id) then
      return new;
    end if;

    insert into public.explore_space_credit_wallets (space_id, balance, lifetime_earned)
    values (new.id, 5, 5)
    on conflict (space_id) do nothing
    returning * into v_wallet;

    if v_wallet.space_id is not null then
      insert into public.explore_space_credit_transactions (
        space_id, actor_user_id, amount, balance_after, transaction_type, surface, metadata
      ) values (
        new.id, new.owner_user_id, 5, v_wallet.balance, 'starter_bonus', 'platform',
        jsonb_build_object('reason', 'space_created')
      );
    end if;
  exception when others then
    null;
  end;
  return new;
end;
$$;
revoke all on function public.grant_explore_space_starter_credits() from public, anon, authenticated;

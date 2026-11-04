-- Two-step login backup codes (2026-11-04).
--
-- Two-step login is an authenticator app (Supabase MFA, TOTP): it needs no
-- email or phone. What a phone-only account lacked was a way back in after
-- losing the app. Backup codes are that way: 10 one-time codes shown once
-- when two-step is set up. One code, typed on the two-step screen, turns
-- two-step off so the person can sign in and set it up again.
--
-- Codes are stored only as bcrypt hashes, never readable by any client,
-- each works once, and wrong guesses are limited to 5 an hour per account.

create table if not exists public.kunthai_mfa_backup_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  code_hash text not null,
  used_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists kunthai_mfa_backup_codes_user_idx
  on public.kunthai_mfa_backup_codes (user_id)
  where used_at is null;

create table if not exists public.kunthai_mfa_recovery_attempts (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  succeeded boolean not null default false,
  attempted_at timestamptz not null default timezone('utc', now())
);

create index if not exists kunthai_mfa_recovery_attempts_user_idx
  on public.kunthai_mfa_recovery_attempts (user_id, attempted_at desc);

alter table public.kunthai_mfa_backup_codes enable row level security;
alter table public.kunthai_mfa_recovery_attempts enable row level security;
revoke all on public.kunthai_mfa_backup_codes from anon, authenticated;
revoke all on public.kunthai_mfa_recovery_attempts from anon, authenticated;

-- New codes (replacing any old ones). Only a session that has passed
-- two-step (aal2) of an account with a verified authenticator may ask.
-- Returns the codes in plain text this once.
create or replace function public.kunthai_generate_mfa_backup_codes()
returns text[]
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $$
declare
  uid uuid := auth.uid();
  codes text[] := '{}';
  raw text;
  i integer;
begin
  if uid is null then
    raise exception 'KT_MFA_SIGN_IN_REQUIRED' using errcode = '42501';
  end if;
  if coalesce(auth.jwt() ->> 'aal', 'aal1') <> 'aal2' then
    raise exception 'KT_MFA_AAL2_REQUIRED' using errcode = '42501';
  end if;
  if not exists (
    select 1 from auth.mfa_factors factor
    where factor.user_id = uid and factor.status = 'verified'
  ) then
    raise exception 'KT_MFA_NOT_ENABLED' using errcode = '22023';
  end if;

  delete from public.kunthai_mfa_backup_codes where user_id = uid;

  for i in 1..10 loop
    raw := upper(encode(extensions.gen_random_bytes(5), 'hex'));
    codes := codes || (substr(raw, 1, 5) || '-' || substr(raw, 6, 5));
    insert into public.kunthai_mfa_backup_codes (user_id, code_hash)
    values (uid, extensions.crypt(raw, extensions.gen_salt('bf', 8)));
  end loop;

  return codes;
end;
$$;

-- How many unused codes the signed-in account has.
create or replace function public.kunthai_mfa_backup_code_count()
returns integer
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select count(*)::integer
  from public.kunthai_mfa_backup_codes
  where user_id = auth.uid() and used_at is null;
$$;

-- Use one code on the two-step screen (the session has the password step
-- only). A right code is spent, two-step is turned off for the account
-- (its authenticator removed) and the other codes are cleared. Returns
-- false for a wrong code.
create or replace function public.kunthai_recover_mfa_with_backup_code(p_code text)
returns boolean
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $$
declare
  uid uuid := auth.uid();
  normalized text := upper(regexp_replace(coalesce(p_code, ''), '[^0-9A-Za-z]', '', 'g'));
  match_id uuid;
begin
  if uid is null then
    raise exception 'KT_MFA_SIGN_IN_REQUIRED' using errcode = '42501';
  end if;

  if (
    select count(*) from public.kunthai_mfa_recovery_attempts attempt
    where attempt.user_id = uid and not attempt.succeeded
      and attempt.attempted_at > timezone('utc', now()) - interval '1 hour'
  ) >= 5 then
    raise exception 'KT_MFA_TOO_MANY_ATTEMPTS' using errcode = '42501';
  end if;

  if length(normalized) = 10 then
    select code.id into match_id
      from public.kunthai_mfa_backup_codes code
     where code.user_id = uid
       and code.used_at is null
       and code.code_hash = extensions.crypt(normalized, code.code_hash)
     limit 1
     for update;
  end if;

  if match_id is null then
    insert into public.kunthai_mfa_recovery_attempts (user_id, succeeded) values (uid, false);
    return false;
  end if;

  update public.kunthai_mfa_backup_codes set used_at = timezone('utc', now()) where id = match_id;
  delete from auth.mfa_factors where user_id = uid;
  delete from public.kunthai_mfa_backup_codes where user_id = uid and used_at is null;
  insert into public.kunthai_mfa_recovery_attempts (user_id, succeeded) values (uid, true);
  return true;
end;
$$;

revoke execute on function public.kunthai_generate_mfa_backup_codes() from public, anon;
revoke execute on function public.kunthai_mfa_backup_code_count() from public, anon;
revoke execute on function public.kunthai_recover_mfa_with_backup_code(text) from public, anon;
grant execute on function public.kunthai_generate_mfa_backup_codes() to authenticated;
grant execute on function public.kunthai_mfa_backup_code_count() to authenticated;
grant execute on function public.kunthai_recover_mfa_with_backup_code(text) to authenticated;

-- Admin console lock: a server-enforced idle lock for the KunThai admin console.
--
-- * Each admin sets a console passcode (bcrypt hash, server-side only).
--   Creating or resetting it requires a fresh authenticator (TOTP) check.
-- * Unlocking (passcode, or a fresh authenticator check) opens a console
--   session bound to the admin's current auth session (JWT session_id). The
--   session slides forward while the admin is active and expires after
--   inactivity.
-- * admin_has_permission() now requires an open console session for the
--   caller's own requests. A locked or idle console therefore loses every
--   admin power at the database, not just behind a screen: no admin data,
--   no admin actions, even via devtools or direct API calls. Checks about
--   OTHER admins (notifications, scheduled jobs) are unaffected.
-- * 5 wrong passcodes lock the console for 15 minutes; lockouts are audited.

create extension if not exists pgcrypto;

-- Server idle window. The console locks itself client-side at 5 minutes; the
-- server allows a short grace for the final heartbeat.
create or replace function public.admin_console_ttl()
returns interval
language sql
immutable
as $$ select interval '6 minutes' $$;

create table if not exists public.admin_console_passcodes (
  user_id uuid primary key references auth.users(id) on delete cascade,
  passcode_hash text not null,
  set_at timestamptz not null default now(),
  failed_attempts smallint not null default 0,
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.admin_console_sessions (
  user_id uuid not null references auth.users(id) on delete cascade,
  session_key text not null,
  method text not null check (method in ('passcode', 'authenticator', 'setup')),
  unlocked_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null,
  primary key (user_id, session_key)
);

create index if not exists admin_console_sessions_expiry_idx on public.admin_console_sessions (expires_at);

-- No client access at all: only the security-definer functions below.
alter table public.admin_console_passcodes enable row level security;
alter table public.admin_console_sessions enable row level security;
revoke all on public.admin_console_passcodes from anon, authenticated;
revoke all on public.admin_console_sessions from anon, authenticated;

-- The caller's auth session (one console session per signed-in device/tab set).
create or replace function public.admin_console_session_key()
returns text
language sql
stable
as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'session_id', '')
$$;

create or replace function public.admin_console_unlocked()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and exists (
    select 1 from public.admin_console_sessions session
    where session.user_id = auth.uid()
      and session.session_key = public.admin_console_session_key()
      and session.expires_at > now()
  );
$$;

-- Did the caller complete an authenticator (MFA) check within `max_age`?
create or replace function public.admin_mfa_recent(max_age interval)
returns boolean
language sql
stable
as $$
  with claims as (
    select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb) as value
  )
  select coalesce((select value ->> 'aal' from claims), '') = 'aal2'
    and exists (
      select 1
      from claims, jsonb_array_elements(coalesce(claims.value -> 'amr', '[]'::jsonb)) method
      where method ->> 'method' in ('totp', 'mfa/totp', 'phone', 'webauthn')
        and to_timestamp(coalesce(nullif(method ->> 'timestamp', ''), '0')::double precision) > now() - max_age
    );
$$;

-- Did the caller SIGN IN (password, email/phone code, OAuth...) within
-- `max_age`? Used for passcode resets: a fresh sign-in, not just a session
-- that happens to be open on an unattended desk.
create or replace function public.admin_primary_auth_recent(max_age interval)
returns boolean
language sql
stable
as $$
  with claims as (
    select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb) as value
  )
  select exists (
    select 1
    from claims, jsonb_array_elements(coalesce(claims.value -> 'amr', '[]'::jsonb)) method
    where coalesce(method ->> 'method', '') not in ('', 'totp', 'mfa/totp', 'webauthn', 'token_refresh')
      and to_timestamp(coalesce(nullif(method ->> 'timestamp', ''), '0')::double precision) > now() - max_age
  );
$$;

-- Every admin permission check made BY an admin for themselves now needs an
-- unlocked console. Identical to 20261001150000 otherwise.
create or replace function public.admin_has_permission(
  requested_permission text,
  requested_sector text default null,
  user_uuid uuid default auth.uid()
)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_assignments assignment
    join public.admin_role_permissions role_permission on role_permission.role_id = assignment.role_id
    where assignment.user_id = user_uuid
      and public.admin_assignment_is_active(assignment)
      and role_permission.permission_key = requested_permission
      and (
        requested_sector is null
        or 'all' = any(assignment.sector_scopes)
        or requested_sector = any(assignment.sector_scopes)
      )
  )
  and (
    public.admin_permission_is_read_only(requested_permission)
    or not public.admin_staff_is_restricted(user_uuid)
  )
  and (
    user_uuid is distinct from auth.uid()
    or public.admin_console_unlocked()
  );
$$;

create or replace function public.admin_console_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_passcode public.admin_console_passcodes;
  v_session public.admin_console_sessions;
begin
  if auth.uid() is null or not public.is_kunthai_admin(auth.uid()) then
    return jsonb_build_object('isAdmin', false);
  end if;
  select * into v_passcode from public.admin_console_passcodes where user_id = auth.uid();
  select * into v_session from public.admin_console_sessions
  where user_id = auth.uid() and session_key = public.admin_console_session_key() and expires_at > now();
  return jsonb_build_object(
    'isAdmin', true,
    'passcodeSet', v_passcode.user_id is not null,
    'unlocked', v_session.user_id is not null,
    'expiresAt', v_session.expires_at,
    'lockedUntil', case when v_passcode.locked_until > now() then v_passcode.locked_until end,
    'attemptsLeft', 5 - coalesce(v_passcode.failed_attempts, 0),
    'mfaFresh', public.admin_mfa_recent(interval '10 minutes'),
    -- A reset needs a fresh sign-in AND a fresh authenticator check.
    'reauthFresh', public.admin_primary_auth_recent(interval '10 minutes') and public.admin_mfa_recent(interval '5 minutes'),
    'idleSeconds', 300
  );
end;
$$;

-- Opens (or extends) the caller's console session.
create or replace function public.admin_console_open_session(p_method text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.admin_console_sessions (user_id, session_key, method, unlocked_at, last_seen_at, expires_at)
  values (auth.uid(), public.admin_console_session_key(), p_method, now(), now(), now() + public.admin_console_ttl())
  on conflict (user_id, session_key) do update
  set method = excluded.method, unlocked_at = now(), last_seen_at = now(), expires_at = excluded.expires_at;
  delete from public.admin_console_sessions where user_id = auth.uid() and expires_at < now() - interval '1 day';
$$;

create or replace function public.admin_set_console_passcode(p_passcode text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_code text := coalesce(p_passcode, '');
  v_existing boolean;
begin
  if auth.uid() is null or not public.is_kunthai_admin(auth.uid()) then raise exception 'Not authorized'; end if;
  select exists (select 1 from public.admin_console_passcodes where user_id = auth.uid()) into v_existing;
  if v_existing then
    -- Changing an existing passcode ("forgot passcode") needs a brand-new
    -- sign-in plus a fresh authenticator check. An open session alone, e.g.
    -- someone at an unattended desk, can never reset it.
    if not public.admin_primary_auth_recent(interval '10 minutes') then
      raise exception 'Sign in again to reset your console passcode';
    end if;
    if not public.admin_mfa_recent(interval '5 minutes') then
      raise exception 'Confirm with your authenticator app first';
    end if;
  elsif not public.admin_mfa_recent(interval '10 minutes') then
    raise exception 'Confirm with your authenticator app first';
  end if;
  if length(v_code) < 6 or length(v_code) > 64 then
    raise exception 'Use 6 to 64 characters';
  end if;
  if v_code ~ '^(.)\1+$'
    or v_code in ('123456', '1234567', '12345678', '123456789', '654321', '012345', '111111', 'password', 'qwerty', 'kunthai', 'admin123') then
    raise exception 'That passcode is too easy to guess';
  end if;

  insert into public.admin_console_passcodes (user_id, passcode_hash, set_at, failed_attempts, locked_until, updated_at)
  values (auth.uid(), crypt(v_code, gen_salt('bf', 10)), now(), 0, null, now())
  on conflict (user_id) do update
  set passcode_hash = excluded.passcode_hash, set_at = now(), failed_attempts = 0, locked_until = null, updated_at = now();

  -- A reset ends every other console session this admin has open.
  if v_existing then
    delete from public.admin_console_sessions
    where user_id = auth.uid() and session_key <> public.admin_console_session_key();
  end if;
  perform public.admin_console_open_session('setup');
  perform public.admin_log_action(
    case when v_existing then 'security.console_passcode_reset' else 'security.console_passcode_set' end,
    'platform', 'admin_staff', auth.uid(), null, '', null, null, '{}'::jsonb
  );
  return public.admin_console_status();
end;
$$;

-- Never raises on a wrong passcode: raising would roll back the attempt
-- counter and make brute force free.
create or replace function public.admin_unlock_console(p_passcode text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_passcode public.admin_console_passcodes;
  v_attempts smallint;
begin
  if auth.uid() is null or not public.is_kunthai_admin(auth.uid()) then raise exception 'Not authorized'; end if;
  select * into v_passcode from public.admin_console_passcodes where user_id = auth.uid() for update;
  if v_passcode.user_id is null then
    return jsonb_build_object('ok', false, 'reason', 'no_passcode');
  end if;
  if v_passcode.locked_until > now() then
    return jsonb_build_object('ok', false, 'reason', 'locked_out', 'lockedUntil', v_passcode.locked_until);
  end if;

  if crypt(coalesce(p_passcode, ''), v_passcode.passcode_hash) = v_passcode.passcode_hash then
    update public.admin_console_passcodes set failed_attempts = 0, locked_until = null, updated_at = now() where user_id = auth.uid();
    perform public.admin_console_open_session('passcode');
    return jsonb_build_object('ok', true, 'status', public.admin_console_status());
  end if;

  v_attempts := v_passcode.failed_attempts + 1;
  if v_attempts >= 5 then
    update public.admin_console_passcodes
    set failed_attempts = 0, locked_until = now() + interval '15 minutes', updated_at = now()
    where user_id = auth.uid();
    delete from public.admin_console_sessions where user_id = auth.uid();
    perform public.admin_log_action('security.console_lockout', 'platform', 'admin_staff', auth.uid(), null,
      'Five wrong console passcodes', null, null, jsonb_build_object('lockedForMinutes', 15));
    return jsonb_build_object('ok', false, 'reason', 'locked_out', 'lockedUntil', now() + interval '15 minutes');
  end if;

  update public.admin_console_passcodes set failed_attempts = v_attempts, updated_at = now() where user_id = auth.uid();
  return jsonb_build_object('ok', false, 'reason', 'wrong_passcode', 'attemptsLeft', 5 - v_attempts);
end;
$$;

-- Unlock with a fresh authenticator check instead of the passcode (also the
-- way back in after a lockout or a forgotten passcode).
create or replace function public.admin_unlock_console_with_mfa()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_kunthai_admin(auth.uid()) then raise exception 'Not authorized'; end if;
  if not public.admin_mfa_recent(interval '3 minutes') then
    raise exception 'Confirm with your authenticator app first';
  end if;
  update public.admin_console_passcodes set failed_attempts = 0, locked_until = null, updated_at = now() where user_id = auth.uid();
  perform public.admin_console_open_session('authenticator');
  perform public.admin_log_action('security.console_unlocked_authenticator', 'platform', 'admin_staff', auth.uid(), null, '', null, null, '{}'::jsonb);
  return public.admin_console_status();
end;
$$;

-- Slides the session forward while the admin is active. Returns the status;
-- an expired session stays locked.
create or replace function public.admin_console_heartbeat()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then return jsonb_build_object('isAdmin', false); end if;
  update public.admin_console_sessions
  set last_seen_at = now(), expires_at = now() + public.admin_console_ttl()
  where user_id = auth.uid()
    and session_key = public.admin_console_session_key()
    and expires_at > now();
  return public.admin_console_status();
end;
$$;

create or replace function public.admin_lock_console()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.admin_console_sessions
  where user_id = auth.uid() and session_key = public.admin_console_session_key();
$$;

revoke all on function public.admin_console_open_session(text) from public, anon, authenticated;
revoke all on function public.admin_console_ttl() from public, anon;
do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.admin_console_status()',
    'public.admin_set_console_passcode(text)',
    'public.admin_unlock_console(text)',
    'public.admin_unlock_console_with_mfa()',
    'public.admin_console_heartbeat()',
    'public.admin_lock_console()'
  ] loop
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end;
$$;

notify pgrst, 'reload schema';

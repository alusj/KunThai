-- Live location sharing keeps going in the background (2026-10-27).
--
-- A shared live location (Messages, UrRide trips) used to update only while
-- KunThai was open. Now, like an online operator's position, the phone's
-- background location plugin POSTs each fix from native code until the share
-- ends, with KunThai in the background or the phone locked. The plugin carries
-- a narrow token, never the sign-in token: it can only move the running shares
-- of the person it was issued to, and dies with them.
--
--   live_location_share_native_start()  a token for this person, valid until
--                                       their last running share ends (+5 min)
--   live_location_share_native_stop()   token removed (all shares ended)
--   live_location_share_native_ping(jsonb)
--     body: the plugin's Location JSON; token in header x-kunthai-share-token.
--
-- One phone has one background watcher. While an operator is online it
-- delivers to operator_native_location_ping, which now also moves that
-- person's running shares (live_location_share_apply_fix).

begin;

create table if not exists public.live_location_share_tokens (
  user_id uuid primary key references auth.users(id) on delete cascade,
  token_hash bytea not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table public.live_location_share_tokens enable row level security;
revoke all on table public.live_location_share_tokens from anon, authenticated;

-- Moves every running share of p_user to this fix. Ignores stopped and
-- expired shares, so a late ping never brings one back.
create or replace function public.live_location_share_apply_fix(
  p_user uuid,
  p_lat double precision,
  p_lng double precision,
  p_accuracy_m double precision default null,
  p_heading double precision default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if p_user is null or p_lat is null or p_lng is null
     or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    return 0;
  end if;
  update public.live_location_shares
  set lat = p_lat,
      lng = p_lng,
      accuracy_m = case when p_accuracy_m >= 0 then p_accuracy_m end,
      heading = p_heading,
      located_at = now()
  where sharer_id = p_user
    and stopped_at is null
    and expires_at > now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.live_location_share_apply_fix(uuid, double precision, double precision, double precision, double precision) from public, anon, authenticated;

create or replace function public.live_location_share_native_start()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_until timestamptz;
  v_token text;
begin
  if v_user is null then
    raise exception 'Sign in to share your live location.' using errcode = '42501';
  end if;
  select max(expires_at) into v_until
  from public.live_location_shares
  where sharer_id = v_user and stopped_at is null and expires_at > now();
  if v_until is null then
    return null;
  end if;
  v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  insert into public.live_location_share_tokens (user_id, token_hash, expires_at)
  values (v_user, sha256(convert_to(v_token, 'UTF8')), v_until + interval '5 minutes')
  on conflict (user_id) do update
    set token_hash = excluded.token_hash,
        expires_at = excluded.expires_at,
        created_at = now();
  return v_token;
end;
$$;

create or replace function public.live_location_share_native_stop()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.live_location_share_tokens where user_id = auth.uid();
$$;

-- A single unnamed jsonb parameter: PostgREST passes the whole request body.
create or replace function public.live_location_share_native_ping(jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_body jsonb := $1;
  v_token text := nullif(current_setting('request.headers', true), '')::json ->> 'x-kunthai-share-token';
  v_user uuid;
  v_lat double precision;
  v_lng double precision;
  v_accuracy double precision;
  v_fix_at timestamptz;
begin
  if v_token is null or length(v_token) < 32 then
    raise exception 'Missing share token.' using errcode = '42501';
  end if;
  select user_id into v_user
  from public.live_location_share_tokens
  where token_hash = sha256(convert_to(v_token, 'UTF8')) and expires_at > now();
  if v_user is null then
    raise exception 'Share token expired.' using errcode = '42501';
  end if;

  -- Mock-location apps never place anyone.
  if coalesce((v_body ->> 'simulated')::boolean, false) then return; end if;
  begin
    v_lat := (v_body ->> 'latitude')::double precision;
    v_lng := (v_body ->> 'longitude')::double precision;
    v_accuracy := nullif(v_body ->> 'accuracy', '')::double precision;
    v_fix_at := to_timestamp(nullif(v_body ->> 'time', '')::double precision / 1000.0);
  exception when others then
    return;
  end;
  if v_lat is null or v_lng is null or (v_lat = 0 and v_lng = 0) then return; end if;
  -- A fix delivered late (queued while offline) is not where they are now.
  if v_fix_at is not null and v_fix_at < now() - interval '2 minutes' then return; end if;

  perform public.live_location_share_apply_fix(v_user, v_lat, v_lng, v_accuracy, nullif(v_body ->> 'bearing', '')::double precision);
end;
$$;

revoke all on function public.live_location_share_native_start() from public, anon;
revoke all on function public.live_location_share_native_stop() from public, anon;
revoke all on function public.live_location_share_native_ping(jsonb) from public;
grant execute on function public.live_location_share_native_start() to authenticated;
grant execute on function public.live_location_share_native_stop() to authenticated;
-- The plugin calls with the public key only; the token is the credential.
grant execute on function public.live_location_share_native_ping(jsonb) to anon, authenticated;

-- The operator's background ping moves their shares too (unchanged otherwise).
create or replace function public.operator_native_location_ping(jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_body jsonb := $1;
  v_token text := nullif(current_setting('request.headers', true), '')::json ->> 'x-kunthai-location-token';
  v_operator uuid;
  v_row public.transport_operator_locations%rowtype;
  v_lat double precision;
  v_lng double precision;
  v_accuracy double precision;
  v_fix_at timestamptz;
  v_good_at timestamptz;
  v_now timestamptz := now();
begin
  if v_token is null or length(v_token) < 32 then
    raise exception 'Missing location token.' using errcode = '42501';
  end if;

  select operator_id into v_operator
  from public.transport_operator_location_tokens
  where token_hash = sha256(convert_to(v_token, 'UTF8')) and expires_at > v_now;
  if v_operator is null then
    raise exception 'Location token expired.' using errcode = '42501';
  end if;

  -- Mock-location apps never place an operator.
  if coalesce((v_body ->> 'simulated')::boolean, false) then return; end if;

  begin
    v_lat := (v_body ->> 'latitude')::double precision;
    v_lng := (v_body ->> 'longitude')::double precision;
    v_accuracy := nullif(v_body ->> 'accuracy', '')::double precision;
    v_fix_at := to_timestamp(nullif(v_body ->> 'time', '')::double precision / 1000.0);
  exception when others then
    return;
  end;
  if v_lat is null or v_lng is null or v_lat not between -90 and 90 or v_lng not between -180 and 180
     or (v_lat = 0 and v_lng = 0) then
    return;
  end if;
  -- A fix delivered late (queued while offline) is not where the operator is now.
  if v_fix_at is not null and v_fix_at < v_now - interval '2 minutes' then return; end if;

  -- The same fix also moves this person's running live location shares
  -- (Messages, trips): one background watcher serves both.
  perform public.live_location_share_apply_fix(v_operator, v_lat, v_lng, v_accuracy, nullif(v_body ->> 'bearing', '')::double precision);

  select * into v_row from public.transport_operator_locations where operator_id = v_operator for update;
  -- Only an operator who is sharing (online / busy) is updated; going offline wins.
  if not found or v_row.status not in ('online', 'busy') then return; end if;

  v_good_at := nullif(v_row.metadata ->> 'good_fix_at', '')::timestamptz;
  if v_accuracy is not null
     and v_accuracy > greatest(150, 4 * coalesce(v_row.accuracy_meters, 0))
     and v_row.accuracy_meters <= 100
     and v_good_at > v_now - interval '10 minutes'
     and public.transport_open_booking_distance_km(v_row.lat, v_row.lng, v_lat, v_lng) * 1000 <= v_accuracy then
    -- Rough noise around a recent good fix: still here, same place.
    update public.transport_operator_locations
    set last_seen_at = v_now,
        updated_at = v_now,
        metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('native_at', v_now)
    where operator_id = v_operator;
    return;
  end if;

  update public.transport_operator_locations
  set lat = v_lat,
      lng = v_lng,
      accuracy_meters = v_accuracy,
      heading = nullif(v_body ->> 'bearing', '')::double precision,
      speed_mps = nullif(v_body ->> 'speed', '')::double precision,
      last_seen_at = v_now,
      updated_at = v_now,
      metadata = coalesce(metadata, '{}'::jsonb)
        || jsonb_build_object('native_at', v_now)
        || case when v_accuracy <= 100 then jsonb_build_object('good_fix_at', v_now) else '{}'::jsonb end
  where operator_id = v_operator;
end;
$$;

commit;

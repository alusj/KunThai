-- UrRide: operators stay visible with KunThai in the background (2026-10-21).
--
-- On Android the "KunThai: you are online" notification kept the GPS running,
-- but positions were only saved by the app's JavaScript, which the phone pauses
-- once KunThai leaves the screen. Passengers then lost the operator after two
-- minutes although the notification said "online".
--
-- Now the location plugin also POSTs every fix from native code, straight to
-- operator_native_location_ping, which works with the app in the background or
-- swiped away. The plugin keeps its headers across a service restart, so it
-- carries a narrow token instead of the (hourly) sign-in token: it only lets
-- that phone update the position of an operator who is already online.
--
--   start_operator_native_location()  Active on: a new token for this operator
--                                      (replaces any earlier one), 3 days.
--   stop_operator_native_location()   Active off / sign-out: token removed.
--   operator_native_location_ping(jsonb)
--     body: the plugin's Location JSON; token in header x-kunthai-location-token.
--     Never brings an offline operator back, ignores mock locations and old
--     fixes, and keeps a recent good fix when a rough one (indoor cell fix)
--     lies within its own error circle, like operatorLocationPolicy.acceptFix.

create table if not exists public.transport_operator_location_tokens (
  operator_id uuid primary key references auth.users(id) on delete cascade,
  token_hash bytea not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table public.transport_operator_location_tokens enable row level security;
revoke all on table public.transport_operator_location_tokens from anon, authenticated;

create or replace function public.start_operator_native_location()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_operator uuid := auth.uid();
  v_token text;
begin
  if v_operator is null then
    raise exception 'Sign in to share your location.' using errcode = '42501';
  end if;
  v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  insert into public.transport_operator_location_tokens (operator_id, token_hash, expires_at)
  values (v_operator, sha256(convert_to(v_token, 'UTF8')), now() + interval '3 days')
  on conflict (operator_id) do update
    set token_hash = excluded.token_hash,
        expires_at = excluded.expires_at,
        created_at = now();
  return v_token;
end;
$$;

create or replace function public.stop_operator_native_location()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.transport_operator_location_tokens where operator_id = auth.uid();
$$;

-- A single unnamed jsonb parameter: PostgREST passes the whole request body.
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

revoke all on function public.start_operator_native_location() from public, anon;
revoke all on function public.stop_operator_native_location() from public, anon;
revoke all on function public.operator_native_location_ping(jsonb) from public;
grant execute on function public.start_operator_native_location() to authenticated;
grant execute on function public.stop_operator_native_location() to authenticated;
-- The plugin calls with the public key only; the token is the credential.
grant execute on function public.operator_native_location_ping(jsonb) to anon, authenticated;

-- Live location sharing and "Track operator" (2026-10-26).
--
-- 1. Share live location, in Messages and on UrRide trips. Someone picks how
--    long (at most 1 hour); their phone keeps updating one row while KunThai
--    is open; the people it is shared with watch it move until it expires or
--    is stopped. Who may watch is decided here, never by the app:
--      message: the members of that conversation
--      trip:    the passenger, the trip's operator, and active members of the
--               operator's company (company transport)
--    live_location_share_start(context, conversation_id, trip_id, minutes)
--    live_location_share_update(share_id, lat, lng, accuracy_m, heading)
--    live_location_share_stop(share_id)
--    Viewers read the row directly (RLS: sharer or viewer) and get realtime
--    updates; a stopped or expired share keeps no position.
--
-- 2. transport_track_operator(fleet_id, trip_id): where an operator is now.
--    Allowed for an operator who is online (the same rule as the public map,
--    transport_operator_locations' "Anyone can view active nearby operators"),
--    for the passenger of a booking that operator accepted (ride or
--    delivery), and for active members of the fleet's company.

begin;

create table if not exists public.live_location_shares (
  id uuid primary key default gen_random_uuid(),
  sharer_id uuid not null references auth.users(id) on delete cascade,
  context text not null check (context in ('message', 'trip')),
  conversation_id uuid references public.explore_conversations(id) on delete cascade,
  trip_id uuid references public.transport_trips(id) on delete cascade,
  viewer_ids uuid[] not null default '{}',
  sharer_name text,
  lat double precision check (lat between -90 and 90),
  lng double precision check (lng between -180 and 180),
  accuracy_m double precision check (accuracy_m >= 0),
  heading double precision,
  located_at timestamptz,
  started_at timestamptz not null default now(),
  expires_at timestamptz not null,
  stopped_at timestamptz,
  constraint live_location_shares_duration check (expires_at > started_at and expires_at <= started_at + interval '61 minutes'),
  constraint live_location_shares_target check (
    (context = 'message' and conversation_id is not null)
    or (context = 'trip' and trip_id is not null)
  )
);

create index if not exists live_location_shares_viewers_idx on public.live_location_shares using gin (viewer_ids);
create index if not exists live_location_shares_trip_idx on public.live_location_shares (trip_id) where trip_id is not null;
create index if not exists live_location_shares_conversation_idx on public.live_location_shares (conversation_id) where conversation_id is not null;

alter table public.live_location_shares enable row level security;
revoke all on table public.live_location_shares from anon;
revoke insert, update, delete on table public.live_location_shares from authenticated;
grant select on table public.live_location_shares to authenticated;

drop policy if exists "live location shares sharer or viewer read" on public.live_location_shares;
create policy "live location shares sharer or viewer read"
on public.live_location_shares
for select to authenticated
using (sharer_id = auth.uid() or auth.uid() = any(viewer_ids));

-- Who sees a trip share: everyone on the trip except the sharer.
create or replace function public.live_location_trip_viewers(p_trip_id uuid)
returns uuid[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(distinct viewer) filter (where viewer is not null), '{}')
  from (
    select trip.passenger_id as viewer
    from public.transport_trips trip
    where trip.id = p_trip_id
    union all
    select operator.user_id
    from public.transport_trips trip
    join public.transport_fleets fleet on fleet.id = trip.fleet_id
    join public.transport_operators operator on operator.id = fleet.operator_id
    where trip.id = p_trip_id
    union all
    select member.user_id
    from public.transport_trips trip
    join public.transport_fleets fleet on fleet.id = trip.fleet_id
    join public.transport_company_members member on member.company_id = fleet.company_id and member.status = 'active'
    where trip.id = p_trip_id
  ) viewers;
$$;

revoke all on function public.live_location_trip_viewers(uuid) from public, anon, authenticated;

create or replace function public.live_location_share_start(
  p_context text,
  p_conversation_id uuid default null,
  p_trip_id uuid default null,
  p_minutes integer default 15
)
returns public.live_location_shares
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_minutes integer := least(greatest(coalesce(p_minutes, 15), 1), 60);
  v_viewers uuid[];
  v_name text;
  v_row public.live_location_shares;
begin
  if v_user is null then
    raise exception 'Sign in to share your live location.' using errcode = '42501';
  end if;

  if p_context = 'message' then
    if p_conversation_id is null or not public.explore_is_conversation_member(p_conversation_id, v_user) then
      raise exception 'Conversation not found.' using errcode = '42501';
    end if;
    select coalesce(array_agg(member), '{}') into v_viewers
    from public.explore_conversations conversation, unnest(conversation.participant_ids) member
    where conversation.id = p_conversation_id and member <> v_user;
  elsif p_context = 'trip' then
    v_viewers := public.live_location_trip_viewers(p_trip_id);
    if p_trip_id is null or not (v_user = any(v_viewers)) then
      raise exception 'Trip not found.' using errcode = '42501';
    end if;
    if not exists (
      select 1 from public.transport_trips trip
      where trip.id = p_trip_id
        and trip.status::text in ('accepted', 'arrived', 'start_requested', 'in_progress', 'paused')
    ) then
      raise exception 'Live location can only be shared on an active trip.';
    end if;
    v_viewers := array_remove(v_viewers, v_user);
  else
    raise exception 'Unknown live location context.';
  end if;

  select nullif(btrim(coalesce(profile.display_name, profile.username, '')), '') into v_name
  from public.profiles profile where profile.id = v_user;

  -- One running share per person and place: a new one replaces it.
  update public.live_location_shares
  set stopped_at = now(), lat = null, lng = null, accuracy_m = null, heading = null
  where sharer_id = v_user
    and stopped_at is null
    and expires_at > now()
    and context = p_context
    and conversation_id is not distinct from (case when p_context = 'message' then p_conversation_id end)
    and trip_id is not distinct from (case when p_context = 'trip' then p_trip_id end);

  insert into public.live_location_shares (sharer_id, context, conversation_id, trip_id, viewer_ids, sharer_name, expires_at)
  values (
    v_user,
    p_context,
    case when p_context = 'message' then p_conversation_id end,
    case when p_context = 'trip' then p_trip_id end,
    coalesce(v_viewers, '{}'),
    v_name,
    now() + make_interval(mins => v_minutes)
  )
  returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.live_location_share_update(
  p_share_id uuid,
  p_lat double precision,
  p_lng double precision,
  p_accuracy_m double precision default null,
  p_heading double precision default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    return false;
  end if;
  update public.live_location_shares
  set lat = p_lat,
      lng = p_lng,
      accuracy_m = case when p_accuracy_m >= 0 then p_accuracy_m end,
      heading = p_heading,
      located_at = now()
  where id = p_share_id
    and sharer_id = auth.uid()
    and stopped_at is null
    and expires_at > now();
  return found;
end;
$$;

create or replace function public.live_location_share_stop(p_share_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.live_location_shares
  set stopped_at = coalesce(stopped_at, now()), lat = null, lng = null, accuracy_m = null, heading = null
  where id = p_share_id and sharer_id = auth.uid();
$$;

revoke all on function public.live_location_share_start(text, uuid, uuid, integer) from public, anon;
revoke all on function public.live_location_share_update(uuid, double precision, double precision, double precision, double precision) from public, anon;
revoke all on function public.live_location_share_stop(uuid) from public, anon;
grant execute on function public.live_location_share_start(text, uuid, uuid, integer) to authenticated;
grant execute on function public.live_location_share_update(uuid, double precision, double precision, double precision, double precision) to authenticated;
grant execute on function public.live_location_share_stop(uuid) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'live_location_shares'
     ) then
    alter publication supabase_realtime add table public.live_location_shares;
  end if;
end $$;

-- 2. Track operator ------------------------------------------------------------

create or replace function public.transport_track_operator(p_fleet_id uuid, p_trip_id uuid default null)
returns table (
  lat double precision,
  lng double precision,
  accuracy_m integer,
  heading double precision,
  speed_mps double precision,
  last_seen_at timestamptz,
  status text,
  place text,
  fleet_type text,
  fleet_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    location.lat::double precision,
    location.lng::double precision,
    case when location.accuracy_meters >= 0 then round(location.accuracy_meters)::integer end,
    location.heading::double precision,
    location.speed_mps::double precision,
    location.last_seen_at,
    location.status::text,
    nullif(left(btrim(coalesce(location.metadata->>'place', '')), 120), ''),
    lower(coalesce(fleet.fleet_type::text, '')),
    fleet.fleet_name::text
  from public.transport_fleets fleet
  join public.transport_operators operator on operator.id = fleet.operator_id
  join public.transport_operator_locations location on location.operator_id = operator.user_id
  where fleet.id = p_fleet_id
    and location.lat between -90 and 90
    and location.lng between -180 and 180
    and location.status::text in ('online', 'busy')
    and location.last_seen_at > now() - interval '10 minutes'
    and (
      -- An online operator passengers can see (the public map rule).
      (lower(coalesce(fleet.active_status::text, '')) = 'active'
        and (fleet.company_id is null or coalesce(fleet.is_visible_to_passengers, false)))
      -- The passenger of a booking this fleet accepted (ride or delivery).
      or (auth.uid() is not null and p_trip_id is not null and exists (
        select 1 from public.transport_trips trip
        where trip.id = p_trip_id
          and trip.fleet_id = fleet.id
          and trip.passenger_id = auth.uid()
          and trip.status::text in ('accepted', 'arrived', 'start_requested', 'in_progress', 'paused')
      ))
      -- The operator's company (company transport).
      or (fleet.company_id is not null and auth.uid() is not null
        and public.transport_company_is_active_member(fleet.company_id, auth.uid()))
    )
  limit 1;
$$;

revoke all on function public.transport_track_operator(uuid, uuid) from public;
grant execute on function public.transport_track_operator(uuid, uuid) to anon, authenticated;

commit;

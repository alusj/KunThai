-- UrRide: "Leave and delete company" finishes the job, and company staff see it (2026-11-15).
--
-- * An operator whose profile exists only for the company they are leaving
--   (no vehicle of their own, no other company) was left with an empty
--   operator dashboard. Leaving now removes that leftover profile too, the
--   same result as deleting the UrRide account. An operator with their own
--   vehicle or another company keeps everything else.
-- * An operator leaving (or deleting their account) has its own alert switch,
--   "Operator leaves", in Company notifications.

begin;

create or replace function public.push_company_activity_preference_key(p_activity_type text, p_metadata jsonb)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    when coalesce(p_activity_type, '') like 'operator\_invite\_%' then 'operatorInvitations'
    when coalesce(p_activity_type, '') in ('operator_left_company', 'operator_deleted_account') then 'operatorDepartures'
    when coalesce(p_activity_type, '') = 'trip_requested' then 'newBookings'
    when coalesce(p_activity_type, '') <> 'trip_status_updated' then 'otherTripUpdates'
    else case lower(coalesce(p_metadata ->> 'status', ''))
      when 'accepted' then 'bookingAccepted'
      when 'arrived' then 'operatorArrived'
      when 'start_requested' then 'startApproval'
      when 'in_progress' then 'tripStarted'
      when 'paused' then 'tripPaused'
      when 'completed' then 'tripCompleted'
      when 'cancelled' then 'tripCancelled'
      else 'otherTripUpdates'
    end
  end;
$$;

create or replace function public.leave_transport_company(p_company_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_operator_ids uuid[] := '{}';
  v_fleet_ids uuid[] := '{}';
  v_member_count integer := 0;
  v_operator_removed boolean := false;
begin
  if v_uid is null then
    raise exception 'Sign in to leave this company.';
  end if;

  if exists (
    select 1 from public.transport_companies company
    where company.id = p_company_id and company.owner_user_id = v_uid
  ) then
    raise exception 'The company creator cannot leave. Delete the company instead.';
  end if;

  perform 1 from public.transport_company_members member
  where member.company_id = p_company_id and member.user_id = v_uid
  for update;

  select count(*),
         coalesce(array_agg(distinct member.operator_id) filter (where member.operator_id is not null), '{}')
  into v_member_count, v_operator_ids
  from public.transport_company_members member
  where member.company_id = p_company_id
    and member.user_id = v_uid
    and member.status in ('active', 'suspended', 'pending');

  if v_member_count = 0 then
    raise exception 'You are no longer a member of this company.';
  end if;

  select coalesce(array_agg(distinct id), '{}') into v_operator_ids
  from (
    select unnest(v_operator_ids) as id
    union
    select operator.id from public.transport_operators operator where operator.user_id = v_uid
  ) ids;

  if exists (
    select 1
    from public.transport_trips trip
    join public.transport_fleets fleet on fleet.id = trip.fleet_id
    where fleet.company_id = p_company_id
      and fleet.operator_id = any(v_operator_ids)
      and trip.status in ('accepted', 'arrived', 'start_requested', 'in_progress', 'paused')
  ) then
    raise exception 'You have a company trip in progress. Finish or cancel it before leaving.';
  end if;

  v_fleet_ids := public.transport_company_exit_member(p_company_id, v_uid, 'left');

  -- Nothing left to operate: no vehicle of their own, no other company and no
  -- company of their own. The operator profile existed only for this company.
  if not exists (
    select 1 from public.transport_fleets fleet
    join public.transport_operators operator on operator.id = fleet.operator_id
    where operator.user_id = v_uid and fleet.company_id is null and fleet.company_fleet_id is null
  ) and not exists (
    select 1 from public.transport_company_members member
    where member.user_id = v_uid and member.status in ('active', 'suspended')
  ) and not exists (
    select 1 from public.transport_companies company where company.owner_user_id = v_uid
  ) then
    update public.transport_operator_locations
    set status = 'offline', available = false, updated_at = now()
    where operator_id = v_uid;
    delete from public.transport_operators where user_id = v_uid;
    v_operator_removed := found;
  end if;

  return jsonb_build_object('ok', true, 'companyId', p_company_id,
    'companyFleetIds', to_jsonb(v_fleet_ids), 'operatorRemoved', v_operator_removed);
end;
$$;

revoke all on function public.leave_transport_company(uuid) from public, anon;
grant execute on function public.leave_transport_company(uuid) to authenticated;

commit;

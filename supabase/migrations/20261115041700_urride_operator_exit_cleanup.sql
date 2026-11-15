-- UrRide: leaving a company and deleting an operator account clean up fully (2026-11-15).
--
-- What was wrong
-- 1. "Delete my UrRide account" removed only the operator profile. The person
--    stayed a member of every company they drove for, the invitation stayed
--    accepted and the company vehicle stayed "online", with no operator and no
--    live vehicle behind it. Passengers could not see it, and the person was
--    left on a company page that could not work.
-- 2. Leaving a company told nobody: the app recorded the activity after the
--    membership ended, which the activity table refuses.
-- 3. An operator who only ever joined through a company invitation has no
--    country on their profile, so their live position was stamped with a blank
--    country and Nearby Area (which shows one country) hid them.
--
-- Now
-- * transport_company_exit_member ends one membership completely (membership,
--   invitations, vehicle assignment, live vehicle) and records the activity,
--   which notifies the owner and whoever may see company activity.
-- * leave_transport_company and delete_my_transport_operator both use it, so
--   deleting the operator account behaves like leaving every company.
-- * A removed operator profile always takes its company vehicles offline.
-- * A live position takes its country from the operator's vehicle when the
--   profile has none.

begin;

create or replace function public.transport_company_exit_member(
  p_company_id uuid,
  p_user uuid,
  p_reason text default 'left'
)
returns uuid[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_operator_ids uuid[] := '{}';
  v_fleet_ids uuid[] := '{}';
  v_name text;
  v_company text;
  v_deleted boolean := coalesce(p_reason, '') = 'deleted_account';
begin
  if p_company_id is null or p_user is null then return '{}'; end if;

  select coalesce(array_agg(distinct id), '{}') into v_operator_ids
  from (
    select member.operator_id as id
    from public.transport_company_members member
    where member.company_id = p_company_id and member.user_id = p_user and member.operator_id is not null
    union
    select operator.id from public.transport_operators operator where operator.user_id = p_user
  ) ids;

  select nullif(btrim(member.full_name), '') into v_name
  from public.transport_company_members member
  where member.company_id = p_company_id and member.user_id = p_user
  limit 1;

  update public.transport_company_members member
  set status = 'removed', service_status = 'removed', managed_by = p_user, updated_at = v_now
  where member.company_id = p_company_id
    and member.user_id = p_user
    and member.role <> 'owner'
    and member.status <> 'removed';

  -- Company fleets this person is assigned to.
  select coalesce(array_agg(distinct fleet_id), '{}') into v_fleet_ids
  from (
    select invite.company_fleet_id as fleet_id
    from public.transport_company_operator_invites invite
    where invite.company_id = p_company_id
      and invite.status = 'accepted'
      and invite.company_fleet_id is not null
      and (invite.operator_user_id = p_user or invite.operator_id = any(v_operator_ids))
    union
    select fleet.id
    from public.transport_company_fleets fleet
    where fleet.company_id = p_company_id and fleet.operator_id = any(v_operator_ids)
  ) assigned;

  update public.transport_company_operator_invites invite
  set status = 'revoked', updated_at = v_now
  where invite.company_id = p_company_id
    and invite.status in ('pending', 'accepted')
    and (invite.operator_user_id = p_user or invite.operator_id = any(v_operator_ids));

  -- The live vehicle first: its change is mirrored onto the company fleet.
  update public.transport_fleets runtime
  set active_status = 'offline', is_visible_to_passengers = false, updated_at = v_now
  where runtime.company_fleet_id = any(v_fleet_ids)
     or (runtime.company_id = p_company_id and runtime.operator_id = any(v_operator_ids));

  if cardinality(v_fleet_ids) > 0 then
    update public.transport_company_fleets fleet
    set operator_id = case when fleet.operator_id = any(v_operator_ids) then null else fleet.operator_id end,
        operators = (
          select coalesce(jsonb_agg(
            case when lower(coalesce(entry ->> 'status', '')) in ('pending', 'accepted', 'accepted_pending_documents')
              and (
                coalesce(entry ->> 'userId', entry ->> 'operator_user_id', '') = p_user::text
                or coalesce(entry ->> 'operatorId', entry ->> 'operator_id', '') = any(select unnest(v_operator_ids)::text)
              )
              then entry || jsonb_build_object('status', 'revoked', 'updatedAt', v_now)
              else entry end
          ), '[]'::jsonb)
          from jsonb_array_elements(coalesce(fleet.operators, '[]'::jsonb)) entry
        ),
        active_status = 'offline',
        is_visible_to_passengers = false,
        updated_at = v_now
    where fleet.id = any(v_fleet_ids);
  end if;

  -- Tell the company. Recorded here because the person can no longer write
  -- to the company once their membership has ended.
  begin
    select coalesce(nullif(btrim(company.company_name), ''), 'the company') into v_company
    from public.transport_companies company where company.id = p_company_id;
    insert into public.transport_company_activities (company_id, actor_user_id, activity_type, title, body, metadata)
    values (
      p_company_id, p_user,
      case when v_deleted then 'operator_deleted_account' else 'operator_left_company' end,
      case when v_deleted then 'Operator deleted their UrRide account' else 'Operator left the company' end,
      coalesce(v_name, 'An operator')
        || case when v_deleted then ' deleted their UrRide operator account and is no longer in '
                else ' left ' end
        || coalesce(v_company, 'the company') || '.'
        || case when cardinality(v_fleet_ids) > 0 then ' Their vehicle is offline and can be given to another operator.' else '' end,
      jsonb_build_object('operatorUserId', p_user, 'operatorName', coalesce(v_name, ''), 'companyFleetIds', to_jsonb(v_fleet_ids), 'reason', coalesce(p_reason, 'left'))
    );
  exception when others then
    raise warning 'transport_company_exit_member activity skipped: %', sqlerrm;
  end;

  return v_fleet_ids;
end;
$$;

revoke all on function public.transport_company_exit_member(uuid, uuid, text) from public, anon, authenticated;

-- Team changes follow the "operator invitations" notification switch.
create or replace function public.push_company_activity_preference_key(p_activity_type text, p_metadata jsonb)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    when coalesce(p_activity_type, '') like 'operator\_invite\_%' then 'operatorInvitations'
    when coalesce(p_activity_type, '') in ('operator_left_company', 'operator_deleted_account') then 'operatorInvitations'
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

  return jsonb_build_object('ok', true, 'companyId', p_company_id, 'companyFleetIds', to_jsonb(v_fleet_ids));
end;
$$;

revoke all on function public.leave_transport_company(uuid) from public, anon;
grant execute on function public.leave_transport_company(uuid) to authenticated;

-- Deleting the operator account: out of every company first, then the profile
-- (its own vehicles and their records go with it).
create or replace function public.delete_my_transport_operator()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid uuid := auth.uid();
  v_operator uuid;
  v_company uuid;
begin
  if uid is null then
    raise exception 'Sign in to manage your UrRide account.' using errcode = '28000';
  end if;

  select id into v_operator from public.transport_operators where user_id = uid for update;

  if v_operator is not null and exists (
    select 1
    from public.transport_trips trip
    join public.transport_fleets fleet on fleet.id = trip.fleet_id
    where fleet.operator_id = v_operator
      and trip.status in ('accepted', 'arrived', 'start_requested', 'in_progress', 'paused')
  ) then
    raise exception 'You have a trip in progress. Finish or cancel it before deleting your UrRide account.';
  end if;

  for v_company in
    select distinct member.company_id
    from public.transport_company_members member
    join public.transport_companies company on company.id = member.company_id
    where member.user_id = uid
      and member.role <> 'owner'
      and company.owner_user_id is distinct from uid
      and member.status in ('active', 'suspended', 'pending')
  loop
    perform public.transport_company_exit_member(v_company, uid, 'deleted_account');
  end loop;

  -- No longer on the live map.
  update public.transport_operator_locations
  set status = 'offline', available = false, updated_at = now()
  where operator_id = uid;

  delete from public.transport_operators where user_id = uid;
end;
$$;

revoke all on function public.delete_my_transport_operator() from public, anon;
grant execute on function public.delete_my_transport_operator() to authenticated;

-- However an operator profile is removed, the company vehicles it drove stop
-- showing as online (their live vehicle is deleted with the profile).
create or replace function public.transport_operator_release_company_fleets()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.transport_company_fleets
  set active_status = 'offline', is_visible_to_passengers = false, updated_at = now()
  where operator_id = old.id
    and (active_status <> 'offline' or coalesce(is_visible_to_passengers, false));
  return old;
exception when others then
  raise warning 'transport_operator_release_company_fleets skipped: %', sqlerrm;
  return old;
end;
$$;

drop trigger if exists transport_operator_release_company_fleets on public.transport_operators;
create trigger transport_operator_release_company_fleets
before delete on public.transport_operators
for each row execute function public.transport_operator_release_company_fleets();

-- A live position's country: the operator profile's, else their vehicle's
-- (an operator who joined through a company invitation has none of their own).
create or replace function public.stamp_transport_operator_location_country()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(nullif(btrim(new.country_iso), ''), '') = '' then
    select nullif(btrim(operator.country_iso), '')
      into new.country_iso
    from public.transport_operators operator
    where operator.user_id = new.operator_id
    limit 1;
    if new.country_iso is null then
      select nullif(btrim(fleet.country_iso), '')
        into new.country_iso
      from public.transport_fleets fleet
      join public.transport_operators operator on operator.id = fleet.operator_id
      where operator.user_id = new.operator_id
        and nullif(btrim(fleet.country_iso), '') is not null
      order by (fleet.active_status = 'active') desc, fleet.updated_at desc nulls last
      limit 1;
    end if;
    new.country_iso := coalesce(new.country_iso, '');
  end if;
  return new;
end;
$$;

-- Repair what the old behaviour left behind.
update public.transport_operator_locations location
set country_iso = found.country_iso
from (
  select distinct on (operator.user_id) operator.user_id, fleet.country_iso
  from public.transport_fleets fleet
  join public.transport_operators operator on operator.id = fleet.operator_id
  where nullif(btrim(fleet.country_iso), '') is not null
  order by operator.user_id, (fleet.active_status = 'active') desc, fleet.updated_at desc nulls last
) found
where found.user_id = location.operator_id
  and coalesce(nullif(btrim(location.country_iso), ''), '') = '';

update public.transport_company_fleets fleet
set active_status = 'offline', is_visible_to_passengers = false, updated_at = now()
where (fleet.active_status = 'active' or coalesce(fleet.is_visible_to_passengers, false))
  and lower(coalesce(fleet.service_category, '')) <> 'rental'
  and not exists (select 1 from public.transport_fleets runtime where runtime.company_fleet_id = fleet.id);

commit;

-- UrRide: an operator leaves a company ("Leave and delete company") (2026-10-16).
--
-- The app used to end the membership with direct table writes, but row-level
-- security only lets owners/managers update transport_company_members, so the
-- write changed nothing and the operator stayed in the company. This function
-- does the same clean-up as the owner's "Remove operator"
-- (manage_transport_company_member, 20261008140000), for the caller's own
-- membership:
--   - membership -> removed (every active/suspended row of theirs in the company)
--   - their pending/accepted invitations in the company -> revoked
--   - they are taken off the company fleets they were assigned to
--   - their company vehicles go offline and hidden
-- Refused for the company creator, and while one of their company trips is
-- under way.
--
-- Safe to run more than once.

create or replace function public.leave_transport_company(p_company_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_now timestamptz := now();
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

  -- The operator profile may only be linked through transport_operators.
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

  update public.transport_company_members member
  set status = 'removed', service_status = 'removed', managed_by = v_uid, updated_at = v_now
  where member.company_id = p_company_id
    and member.user_id = v_uid
    and member.status <> 'removed';

  -- Company fleets this person is assigned to.
  select coalesce(array_agg(distinct fleet_id), '{}') into v_fleet_ids
  from (
    select invite.company_fleet_id as fleet_id
    from public.transport_company_operator_invites invite
    where invite.company_id = p_company_id
      and invite.status = 'accepted'
      and invite.company_fleet_id is not null
      and (invite.operator_user_id = v_uid or invite.operator_id = any(v_operator_ids))
    union
    select fleet.id
    from public.transport_company_fleets fleet
    where fleet.company_id = p_company_id and fleet.operator_id = any(v_operator_ids)
  ) assigned;

  update public.transport_company_operator_invites invite
  set status = 'revoked', updated_at = v_now
  where invite.company_id = p_company_id
    and invite.status in ('pending', 'accepted')
    and (invite.operator_user_id = v_uid or invite.operator_id = any(v_operator_ids));

  if cardinality(v_fleet_ids) > 0 then
    update public.transport_company_fleets fleet
    set operator_id = case when fleet.operator_id = any(v_operator_ids) then null else fleet.operator_id end,
        operators = (
          select coalesce(jsonb_agg(
            case when lower(coalesce(entry ->> 'status', '')) in ('pending', 'accepted', 'accepted_pending_documents')
              and (
                coalesce(entry ->> 'userId', entry ->> 'operator_user_id', '') = v_uid::text
                or coalesce(entry ->> 'operatorId', entry ->> 'operator_id', '') = any(select unnest(v_operator_ids)::text)
              )
              then entry || jsonb_build_object('status', 'revoked', 'updatedAt', v_now)
              else entry end
          ), '[]'::jsonb)
          from jsonb_array_elements(coalesce(fleet.operators, '[]'::jsonb)) entry
        ),
        is_visible_to_passengers = false,
        updated_at = v_now
    where fleet.id = any(v_fleet_ids);
  end if;

  update public.transport_fleets runtime
  set active_status = 'offline', is_visible_to_passengers = false, updated_at = v_now
  where runtime.company_fleet_id = any(v_fleet_ids)
     or (runtime.company_id = p_company_id and runtime.operator_id = any(v_operator_ids));

  return jsonb_build_object('ok', true, 'companyId', p_company_id, 'companyFleetIds', to_jsonb(v_fleet_ids));
end;
$$;

revoke all on function public.leave_transport_company(uuid) from public, anon;
grant execute on function public.leave_transport_company(uuid) to authenticated;

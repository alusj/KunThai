-- UrRide Fleet HQ: changing a team member from one Fleet HQ role to another
-- (Dispatcher <-> Fleet Manager <-> Company Admin) no longer hits the plan
-- limit. The three roles share one limit and the person already holds a place.
-- Latest definition before this: 20260820140000_business_subscription_capacity_guards.sql

create or replace function public.kunthai_guard_urride_member_capacity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entitlement record;
  v_current integer;
  v_resource text;
  v_limit integer;
begin
  if new.status not in ('pending', 'active')
    or coalesce(new.service_status, 'active') <> 'active'
    or new.role = 'owner' then
    return new;
  end if;

  if tg_op = 'UPDATE'
    and old.status in ('pending', 'active')
    and coalesce(old.service_status, 'active') = 'active'
    and old.company_id is not distinct from new.company_id
    and old.role is not distinct from new.role then
    return new;
  end if;

  -- Dispatcher, Fleet Manager and Company Admin share one limit ("admins").
  -- Someone who already holds one of them keeps the same place when moved to
  -- another, so there is nothing new to count. Before this, the move was
  -- refused as "limit reached" and the company had to set the person back to
  -- Operator only first.
  if tg_op = 'UPDATE'
    and old.status in ('pending', 'active')
    and coalesce(old.service_status, 'active') = 'active'
    and old.company_id is not distinct from new.company_id
    and old.role in ('admin', 'fleet_manager', 'dispatcher')
    and new.role in ('admin', 'fleet_manager', 'dispatcher') then
    return new;
  end if;

  select * into v_entitlement
  from public.kunthai_business_effective_entitlement('urride', new.company_id);

  if new.role = 'operator' then
    -- Accepted invitations are already counted, so only direct operator member
    -- additions need a second guard here.
    if exists (
      select 1 from public.transport_company_operator_invites invite
      where invite.company_id = new.company_id
        and invite.status in ('pending', 'accepted')
        and coalesce(invite.operator_user_id::text, invite.operator_id::text, nullif(lower(btrim(invite.operator_public_id)), ''))
          = coalesce(new.user_id::text, new.operator_id::text, nullif(lower(btrim(new.public_id)), ''))
    ) then
      return new;
    end if;
    v_resource := 'operators';
    v_limit := v_entitlement.operator_limit;
  elsif new.role in ('admin', 'fleet_manager', 'dispatcher') then
    v_resource := 'admins';
    v_limit := v_entitlement.admin_limit;
  else
    return new;
  end if;

  if v_limit is null then return new; end if;
  v_current := coalesce((public.kunthai_business_usage('urride', new.company_id) ->> v_resource)::integer, 0);
  if v_current >= v_limit then
    perform public.kunthai_raise_capacity_limit(
      'urride', v_resource, v_current, v_limit, v_entitlement.plan_code
    );
  end if;
  return new;
end;
$$;

-- An operator is told whenever a transport company changes what they are
-- responsible for (2026-11-04).
--
-- Making an operator a company admin (or fleet manager, dispatcher, back to
-- operator), changing their permissions or responsibilities, suspending or
-- restoring their service, removing them, and giving them or taking away a
-- company vehicle wrote nothing for that operator: "Alusine Sulaiman Kamara"
-- was made a company admin on 2026-11-03 and was never told. Each change now
-- writes one UrRide notification for that operator (bell + push via
-- platform_notifications_add_push_channel / push_queue_platform_notification),
-- opening UrRide home, as the company invitation notice does
-- (20261031100000_urride_company_invite_notification.sql).
--
-- Triggers on the tables themselves, so every path is covered: Fleet HQ's
-- direct writes, manage_transport_company_member(), and any later RPC. The
-- person who made the change is never notified of their own action (an
-- operator leaving, or accepting an invitation, notifies nobody here).
--
--   transport_company_members
--     role changed                    -> "You are now <role> at <company>"
--     permissions / responsibilities  -> "Your responsibilities at <company> changed"
--     service suspended / restored    -> suspended / restored notice
--     status -> removed               -> "You were removed from <company>"
--   transport_company_fleets.operator_id
--     set to an operator              -> that operator: vehicle assigned
--     cleared or moved away           -> the previous operator: vehicle unassigned
--                                        (not when they were just removed)
--
-- Only adds functions and triggers. A notification never blocks the change.
-- Re-runnable.
begin;

create or replace function public.urride_operator_notify(
  p_user uuid, p_company uuid, p_type text, p_title text, p_body text, p_key text
) returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_user is null or p_user is not distinct from auth.uid() then return; end if;
  insert into public.platform_notifications (
    user_id, sector, notification_type, title, body, priority, status,
    category, workspace, workspace_id, action_target, action_data,
    channels, presentation, dedupe_key
  ) values (
    p_user, 'transport', p_type, p_title, p_body, 'high', 'unread',
    'transport', 'transport', p_company,
    'urride:home', jsonb_build_object('companyId', p_company),
    array['in_app', 'push']::text[], 'floating', p_key
  )
  on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;
end;
$$;

create or replace function public.urride_company_role_label(p_role text)
returns text language sql immutable set search_path = public, pg_temp as $$
  select case lower(coalesce(p_role, ''))
    when 'admin' then 'a company admin'
    when 'fleet_manager' then 'a fleet manager'
    when 'dispatcher' then 'a dispatcher'
    when 'operator' then 'an operator'
    when 'owner' then 'the company owner'
    else 'a ' || replace(lower(coalesce(nullif(p_role, ''), 'operator')), '_', ' ')
  end;
$$;

create or replace function public.notify_transport_company_member_change()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_company text;
  v_stamp text := extract(epoch from clock_timestamp())::bigint::text;
  v_key text := 'urride-member:' || new.id::text || ':';
begin
  if new.user_id is null or new.role = 'owner' then return new; end if;
  -- Pending rows are invitations; the invitation notice covers them.
  if new.status = 'pending' and coalesce(old.status, 'pending') = 'pending' then return new; end if;

  select coalesce(nullif(btrim(company.company_name), ''), 'your transport company')
  into v_company
  from public.transport_companies company
  where company.id = new.company_id;
  v_company := coalesce(v_company, 'your transport company');

  if new.status = 'removed' and old.status is distinct from 'removed' then
    perform public.urride_operator_notify(new.user_id, new.company_id, 'urride_company_member_removed',
      'Removed from ' || v_company,
      v_company || ' removed you from its company. Your KunThai account and solo fleets are not affected.',
      v_key || 'removed:' || v_stamp);
    return new;
  end if;
  if new.status = 'removed' then return new; end if;

  if new.service_status is distinct from old.service_status then
    if new.service_status = 'suspended' then
      perform public.urride_operator_notify(new.user_id, new.company_id, 'urride_company_member_suspended',
        'Company service paused',
        v_company || ' paused your service with its fleet. You cannot take its trips until it is restored.',
        v_key || 'suspended:' || v_stamp);
    elsif new.service_status = 'active' and old.service_status = 'suspended' then
      perform public.urride_operator_notify(new.user_id, new.company_id, 'urride_company_member_restored',
        'Company service restored',
        v_company || ' restored your service. You can work with its fleet again.',
        v_key || 'restored:' || v_stamp);
    end if;
  end if;

  if new.role is distinct from old.role then
    perform public.urride_operator_notify(new.user_id, new.company_id, 'urride_company_role_changed',
      case when new.role in ('admin', 'fleet_manager', 'dispatcher') and coalesce(old.role, 'operator') not in ('admin', 'fleet_manager', 'dispatcher')
        then 'You were made ' || public.urride_company_role_label(new.role)
        when old.role in ('admin', 'fleet_manager', 'dispatcher') and new.role not in ('admin', 'fleet_manager', 'dispatcher')
        then 'Admin access removed'
        else 'Your company role changed' end,
      'You are now ' || public.urride_company_role_label(new.role) || ' at ' || v_company || '.'
        || case when new.role in ('admin', 'fleet_manager', 'dispatcher') then ' Open UrRide to manage the company in Fleet HQ.' else '' end,
      v_key || 'role:' || coalesce(new.role, '') || ':' || v_stamp);
  elsif new.permissions is distinct from old.permissions or new.responsibilities is distinct from old.responsibilities then
    perform public.urride_operator_notify(new.user_id, new.company_id, 'urride_company_role_changed',
      'Your responsibilities changed',
      v_company || ' updated what you can do in the company'
        || case when coalesce(array_length(new.responsibilities, 1), 0) > 0
             then ': ' || array_to_string(new.responsibilities, ', ') else '' end || '.',
      v_key || 'duties:' || v_stamp);
  end if;
  return new;
exception when others then
  raise warning 'notify_transport_company_member_change skipped: %', sqlerrm;
  return new;
end;
$$;

drop trigger if exists notify_transport_company_member_change on public.transport_company_members;
create trigger notify_transport_company_member_change
after update of role, permissions, responsibilities, status, service_status on public.transport_company_members
for each row execute function public.notify_transport_company_member_change();

create or replace function public.notify_transport_company_fleet_assignment()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_company text;
  v_vehicle text;
  v_new_user uuid;
  v_old_user uuid;
  v_stamp text := extract(epoch from clock_timestamp())::bigint::text;
begin
  if new.operator_id is not distinct from old.operator_id then return new; end if;

  select coalesce(nullif(btrim(company.company_name), ''), 'your transport company')
  into v_company
  from public.transport_companies company
  where company.id = new.company_id;
  v_company := coalesce(v_company, 'your transport company');
  v_vehicle := coalesce(nullif(btrim(new.fleet_name), ''), nullif(btrim(new.fleet_type), ''), 'a vehicle')
    || case when nullif(btrim(new.plate_number), '') is not null then ' (' || btrim(new.plate_number) || ')' else '' end;

  if new.operator_id is not null then
    select operator.user_id into v_new_user from public.transport_operators operator where operator.id = new.operator_id;
  end if;
  if old.operator_id is not null then
    select operator.user_id into v_old_user from public.transport_operators operator where operator.id = old.operator_id;
  end if;

  if v_new_user is not null then
    perform public.urride_operator_notify(v_new_user, new.company_id, 'urride_company_vehicle_assigned',
      'Vehicle assigned to you',
      v_company || ' assigned ' || v_vehicle || ' to you.',
      'urride-fleet-assign:' || new.id::text || ':' || v_new_user::text || ':' || v_stamp);
  end if;
  -- Removing an operator clears their vehicle too; "Removed from" already says so.
  if v_old_user is not null and exists (
    select 1 from public.transport_company_members member
    where member.company_id = new.company_id and member.user_id = v_old_user and member.status = 'removed'
  ) then
    v_old_user := null;
  end if;
  if v_old_user is not null and v_old_user is distinct from v_new_user then
    perform public.urride_operator_notify(v_old_user, new.company_id, 'urride_company_vehicle_unassigned',
      'Vehicle no longer assigned',
      v_company || ' took ' || v_vehicle || ' off your assignments.',
      'urride-fleet-unassign:' || new.id::text || ':' || v_old_user::text || ':' || v_stamp);
  end if;
  return new;
exception when others then
  raise warning 'notify_transport_company_fleet_assignment skipped: %', sqlerrm;
  return new;
end;
$$;

drop trigger if exists notify_transport_company_fleet_assignment on public.transport_company_fleets;
create trigger notify_transport_company_fleet_assignment
after update of operator_id on public.transport_company_fleets
for each row execute function public.notify_transport_company_fleet_assignment();

revoke all on function public.urride_operator_notify(uuid, uuid, text, text, text, text) from public;
revoke all on function public.notify_transport_company_member_change() from public;
revoke all on function public.notify_transport_company_fleet_assignment() from public;
do $$ begin
  revoke all on function public.urride_operator_notify(uuid, uuid, text, text, text, text) from anon, authenticated;
  revoke all on function public.notify_transport_company_member_change() from anon, authenticated;
  revoke all on function public.notify_transport_company_fleet_assignment() from anon, authenticated;
exception when undefined_object then null;
end $$;

commit;

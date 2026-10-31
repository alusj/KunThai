-- The person a transport company invites to drive one of its vehicles is told
-- (2026-10-31).
--
-- An invitation (transport_company_operator_invites, status 'pending') only
-- appeared on the invited person's UrRide home once they opened UrRide; no
-- notification was written. Each new or reopened invitation now writes one
-- UrRide notification (bell + push via platform_notifications_add_push_channel)
-- that opens UrRide home, where the invitation card is. Reopening the same
-- fleet's invitation gets a new request_id, so it notifies again.
begin;

create or replace function public.notify_transport_company_operator_invite()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_company text;
  v_fleet text;
begin
  if new.operator_user_id is null or new.status <> 'pending' then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'pending' and old.request_id is not distinct from new.request_id then
    return new;
  end if;

  select coalesce(nullif(btrim(company.company_name), ''), 'A transport company')
  into v_company
  from public.transport_companies company
  where company.id = new.company_id;

  select coalesce(nullif(btrim(fleet.fleet_name), ''), nullif(btrim(fleet.fleet_type), ''))
  into v_fleet
  from public.transport_company_fleets fleet
  where fleet.id = new.company_fleet_id;

  insert into public.platform_notifications (
    user_id, sector, notification_type, title, body, priority, status,
    category, workspace, workspace_id, action_target, action_data,
    channels, presentation, dedupe_key
  ) values (
    new.operator_user_id, 'transport', 'urride_company_invite', 'Company invitation',
    coalesce(v_company, 'A transport company') || ' invited you to join as an operator'
      || case when v_fleet is not null then ' for ' || v_fleet else '' end
      || '. Open UrRide to accept or decline.',
    'high', 'unread', 'transport', 'transport', new.company_id,
    'urride:home', jsonb_build_object('inviteId', new.id, 'companyId', new.company_id),
    array['in_app', 'push']::text[], 'floating',
    'urride-company-invite:' || new.id::text || ':' || coalesce(new.request_id, '')
  )
  on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;

  return new;
exception when others then
  -- A notification never blocks the invitation itself.
  return new;
end;
$$;

drop trigger if exists notify_transport_company_operator_invite on public.transport_company_operator_invites;
create trigger notify_transport_company_operator_invite
after insert or update of status, request_id on public.transport_company_operator_invites
for each row execute function public.notify_transport_company_operator_invite();

commit;

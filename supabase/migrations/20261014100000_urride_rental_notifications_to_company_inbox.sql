-- UrRide rental notifications for the company go to the company inbox (2026-10-14).
--
-- Rental reservation updates and renter reviews were written for the company
-- owner and admins with workspace 'transport', the same as the renter's own
-- copy, so they showed up in the passenger UrRide bell. A company copy is now
-- marked workspace 'transport_company' (sector stays 'transport', so push
-- delivery and preferences are unchanged). The app shows those rows in the
-- Fleet HQ notifications, never in the passenger bell.
--
-- "Company copy" = an urride_rental_* row whose recipient owns or is an active
-- admin of the company in workspace_id. A company cannot rent its own vehicle
-- (request_transport_rental refuses managers), so the renter's copy is never
-- caught by this.

create or replace function public.route_urride_rental_notification_to_company()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.sector = 'transport'
     and new.notification_type like 'urride\_rental\_%'
     and new.workspace_id is not null
     and (
       exists (select 1 from public.transport_companies company
               where company.id = new.workspace_id and company.owner_user_id = new.user_id)
       or exists (select 1 from public.transport_company_members member
                  where member.company_id = new.workspace_id and member.user_id = new.user_id
                    and member.role = 'admin' and member.status = 'active'
                    and coalesce(member.service_status, 'active') = 'active')
     ) then
    new.workspace := 'transport_company';
  end if;
  return new;
end;
$$;

revoke all on function public.route_urride_rental_notification_to_company() from public;

drop trigger if exists route_urride_rental_notification_to_company on public.platform_notifications;
create trigger route_urride_rental_notification_to_company
before insert on public.platform_notifications
for each row execute function public.route_urride_rental_notification_to_company();

-- Move company copies already delivered. guard_platform_notification_user_update
-- keeps workspace unchanged unless the caller is the service role, so the
-- backfill runs as the service role and then restores the setting.
select set_config('request.jwt.claim.role', 'service_role', false),
       set_config('request.jwt.claims', '{"role":"service_role"}', false);

update public.platform_notifications notification
   set workspace = 'transport_company'
 where notification.sector = 'transport'
   and notification.notification_type like 'urride\_rental\_%'
   and notification.workspace_id is not null
   and notification.workspace <> 'transport_company'
   and (
     exists (select 1 from public.transport_companies company
             where company.id = notification.workspace_id and company.owner_user_id = notification.user_id)
     or exists (select 1 from public.transport_company_members member
                where member.company_id = notification.workspace_id and member.user_id = notification.user_id
                  and member.role = 'admin')
   );

select set_config('request.jwt.claim.role', '', false),
       set_config('request.jwt.claims', '', false);

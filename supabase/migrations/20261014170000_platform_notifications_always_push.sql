-- Every account notification can reach a closed app (2026-10-14).
--
-- Many server functions write platform_notifications without a channel list
-- (admin messages to owners, enforcement notices and their expiry, case
-- decisions, account status, undo notices, credit grants, Join KunThai
-- application updates, advert created / expired, invite rewards,
-- subscription warnings), so they defaulted to in-app only and never sent a
-- push. This adds the push channel to every non-campaign notification that
-- lacks it, before it is stored; push_queue_platform_notification then
-- queues it as for any other row, still honouring the person's push switch.
-- Campaigns keep the channels the admin chose in the builder. An admin's
-- test send now pushes too when the campaign it tests has the Push channel,
-- so a push campaign can be checked on the admin's own phone first.

create or replace function public.platform_notifications_add_push_channel()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.campaign_id is not null
     or 'push' = any(coalesce(new.channels, array['in_app']::text[])) then
    return new;
  end if;
  if coalesce(new.notification_type, '') = 'admin_test' then
    -- A test pushes only when the campaign it tests would.
    if not exists (
      select 1 from public.admin_notification_campaigns campaign
      where campaign.id::text = coalesce(new.display_config ->> 'testCampaignId', '')
        and 'push' = any(coalesce(campaign.channels, array[]::text[]))
    ) then
      return new;
    end if;
  end if;
  new.channels := array_append(coalesce(new.channels, array['in_app']::text[]), 'push');
  return new;
end;
$$;

drop trigger if exists platform_notifications_add_push_channel on public.platform_notifications;
create trigger platform_notifications_add_push_channel
before insert on public.platform_notifications
for each row execute function public.platform_notifications_add_push_channel();

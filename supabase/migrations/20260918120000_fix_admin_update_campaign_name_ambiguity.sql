-- Fix: column reference "campaign_name" is ambiguous when saving an existing
-- campaign (Approve & send now / Save draft on an edited campaign).
--
-- admin_update_campaign has a parameter named campaign_name, the same as the
-- admin_notification_campaigns column. Inside the UPDATE both are in scope, so
-- Postgres refuses to guess. The parameter is now qualified with the function
-- name; the rest of the function is identical to 20260917120000.

create or replace function public.admin_update_campaign(
  campaign_uuid uuid,
  campaign_title text,
  campaign_body text,
  campaign_sector text default 'platform',
  campaign_audience text default 'all',
  campaign_priority text default 'normal',
  campaign_filter jsonb default '{}'::jsonb,
  campaign_schedule timestamptz default null,
  campaign_channels text[] default array['in_app']::text[],
  campaign_presentation text default 'inbox',
  campaign_category text default 'announcement',
  campaign_action_target text default null,
  campaign_action_data jsonb default '{}'::jsonb,
  campaign_expires_at timestamptz default null,
  campaign_name text default '',
  campaign_configuration jsonb default '{}'::jsonb
)
returns public.admin_notification_campaigns
language plpgsql
security definer
set search_path = public
as $$
declare previous_campaign public.admin_notification_campaigns; updated_campaign public.admin_notification_campaigns; audience_total integer;
begin
  select * into previous_campaign from public.admin_notification_campaigns where id = campaign_uuid for update;
  if previous_campaign.id is null then raise exception 'Campaign not found'; end if;
  if not public.admin_has_permission('notifications.manage', previous_campaign.sector) then raise exception 'Not authorized'; end if;
  if previous_campaign.status not in ('draft','pending_approval','approved','scheduled','failed') then raise exception 'Only unsent campaigns can be edited'; end if;
  if btrim(coalesce(campaign_title, '')) = '' or btrim(coalesce(campaign_body, '')) = '' then raise exception 'Title and message are required'; end if;
  if length(campaign_title) > 120 or length(campaign_body) > 1000 then raise exception 'Title or message is too long'; end if;
  if campaign_schedule is not null and campaign_schedule < now() - interval '2 minutes' then raise exception 'The scheduled time is in the past'; end if;
  if campaign_expires_at is not null and campaign_expires_at <= coalesce(campaign_schedule, now()) then raise exception 'The end time must be after the start time'; end if;
  perform public.admin_validate_campaign_spec(campaign_sector, campaign_audience, campaign_priority, campaign_filter,
    campaign_presentation, campaign_category, campaign_action_target, campaign_action_data, campaign_configuration);
  if campaign_schedule is not null and not (public.admin_has_permission('notifications.schedule', campaign_sector) or public.admin_has_permission('notifications.approve', campaign_sector)) then
    raise exception 'Scheduling permission is required';
  end if;
  audience_total := public.admin_estimate_campaign_audience(campaign_sector, campaign_audience, campaign_filter);
  -- Any edit sends the campaign back through approval.
  update public.admin_notification_campaigns set
    campaign_name = coalesce(nullif(btrim(admin_update_campaign.campaign_name), ''), btrim(campaign_title)),
    title = btrim(campaign_title), body = btrim(campaign_body), sector = campaign_sector,
    audience_type = campaign_audience, audience_filter = coalesce(campaign_filter, '{}'::jsonb),
    priority = campaign_priority, status = case when campaign_schedule is null then 'draft' else 'pending_approval' end,
    scheduled_at = campaign_schedule, channels = coalesce(nullif(campaign_channels, '{}'::text[]), array['in_app']::text[]),
    presentation = campaign_presentation, category = btrim(campaign_category),
    action_target = nullif(btrim(campaign_action_target), ''), action_data = coalesce(campaign_action_data, '{}'::jsonb),
    expires_at = campaign_expires_at, estimated_audience = audience_total,
    configuration = coalesce(campaign_configuration, '{}'::jsonb),
    approved_by = null, approved_at = null, last_error = null, updated_by = auth.uid(), updated_at = now()
  where id = campaign_uuid returning * into updated_campaign;
  perform public.admin_log_action('notification.campaign_updated', campaign_sector, 'notification_campaign', campaign_uuid, null, '', to_jsonb(previous_campaign), to_jsonb(updated_campaign));
  return updated_campaign;
end;
$$;

revoke all on function public.admin_update_campaign(uuid,text,text,text,text,text,jsonb,timestamptz,text[],text,text,text,jsonb,timestamptz,text,jsonb) from public, anon;
grant execute on function public.admin_update_campaign(uuid,text,text,text,text,text,jsonb,timestamptz,text[],text,text,text,jsonb,timestamptz,text,jsonb) to authenticated;

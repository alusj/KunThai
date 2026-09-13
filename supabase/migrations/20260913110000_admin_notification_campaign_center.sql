-- Premium Admin Notification Campaign Center.
--
-- This migration is additive for existing campaigns and deliveries. It keeps
-- the original RPC names, adds structured targeting/display configuration,
-- resolves KTU IDs server-side, and requires explicit confirmation before a
-- large or worldwide publication can materialize recipient rows.

alter table public.admin_notification_campaigns
  add column if not exists campaign_name text not null default '',
  add column if not exists configuration jsonb not null default '{}'::jsonb,
  add column if not exists updated_by uuid references auth.users(id) on delete set null,
  add column if not exists published_by uuid references auth.users(id) on delete set null,
  add column if not exists published_at timestamptz;

update public.admin_notification_campaigns
set campaign_name = title
where btrim(coalesce(campaign_name, '')) = '';

alter table public.admin_notification_campaigns
  drop constraint if exists admin_notification_campaigns_audience_type_check,
  drop constraint if exists admin_notification_campaigns_priority_check;

alter table public.admin_notification_campaigns
  add constraint admin_notification_campaigns_audience_type_check
    check (audience_type in ('all','sector_users','specific_users','region','account_type','segments')),
  add constraint admin_notification_campaigns_priority_check
    check (priority in ('low','normal','important','high','urgent','critical'));

create index if not exists admin_notification_campaigns_status_schedule_idx
on public.admin_notification_campaigns(status, scheduled_at, created_at desc);

create index if not exists admin_notification_campaigns_audience_filter_gin_idx
on public.admin_notification_campaigns using gin(audience_filter);

create index if not exists admin_notification_campaigns_configuration_gin_idx
on public.admin_notification_campaigns using gin(configuration);

alter table public.platform_notifications
  add column if not exists display_config jsonb not null default '{}'::jsonb,
  add column if not exists last_presented_at timestamptz,
  add column if not exists presentation_count integer not null default 0,
  add column if not exists snoozed_until timestamptz,
  add column if not exists clicked_at timestamptz,
  add column if not exists cta_clicked_at timestamptz;

create index if not exists platform_notifications_campaign_presentation_idx
on public.platform_notifications(user_id, presentation, created_at desc)
where campaign_id is not null;

insert into public.admin_permissions(permission_key, name, permission_group) values
  ('notifications.test', 'Send notification campaign tests', 'notifications'),
  ('notifications.schedule', 'Schedule notification campaigns', 'notifications'),
  ('notifications.publish', 'Publish approved notification campaigns', 'notifications'),
  ('notifications.critical', 'Create critical notification campaigns', 'notifications'),
  ('notifications.analytics', 'View notification campaign analytics', 'notifications'),
  ('notifications.settings', 'Manage notification campaign defaults', 'notifications')
on conflict (permission_key) do update
set name = excluded.name, permission_group = excluded.permission_group;

insert into public.admin_role_permissions(role_id, permission_key)
select role.id, permission.permission_key
from public.admin_roles role
cross join public.admin_permissions permission
where role.role_key in ('super_admin','chief_admin')
  and permission.permission_key like 'notifications.%'
on conflict do nothing;

with grants(role_key, permission_key) as (
  values
    ('operations_lead','notifications.test'),
    ('operations_lead','notifications.schedule'),
    ('operations_lead','notifications.publish'),
    ('operations_lead','notifications.analytics'),
    ('notification_officer','notifications.test'),
    ('notification_officer','notifications.schedule'),
    ('notification_officer','notifications.analytics')
)
insert into public.admin_role_permissions(role_id, permission_key)
select role.id, grants.permission_key
from grants join public.admin_roles role on role.role_key = grants.role_key
on conflict do nothing;

-- Admin-only KTU lookup. Email addresses are deliberately not returned.
create or replace function public.admin_lookup_campaign_user(public_kunthai_id text)
returns table(
  user_id uuid,
  public_id text,
  display_name text,
  avatar_url text,
  country text,
  city text
)
language plpgsql
security definer
stable
set search_path = public, auth
as $$
declare
  normalized_id text := upper(regexp_replace(coalesce(public_kunthai_id, ''), '[^A-Za-z0-9]', '', 'g'));
begin
  if not public.admin_has_permission('notifications.manage', 'platform') then
    raise exception 'Not authorized';
  end if;
  if normalized_id = '' then return; end if;
  if left(normalized_id, 3) <> 'KTU' then normalized_id := 'KTU' || normalized_id; end if;

  return query
  select
    users.id,
    identity.public_user_id,
    coalesce(nullif(profile.display_name, ''), nullif(users.raw_user_meta_data->>'display_name', ''),
      nullif(users.raw_user_meta_data->>'full_name', ''), nullif(users.raw_user_meta_data->>'name', ''), 'KunThai account'),
    coalesce(nullif(profile.avatar_url, ''), nullif(users.raw_user_meta_data->>'avatar_url', ''),
      nullif(users.raw_user_meta_data->>'picture', ''), ''),
    coalesce(nullif(users.raw_user_meta_data->>'country', ''), nullif(users.raw_user_meta_data->>'country_name', ''), ''),
    coalesce(nullif(users.raw_user_meta_data->>'city', ''), '')
  from public.kunthai_account_identities identity
  join auth.users users on users.id = identity.user_id
  left join public.explore_profiles profile on profile.user_id = users.id
  where upper(regexp_replace(identity.public_user_id, '[^A-Za-z0-9]', '', 'g')) = normalized_id
  limit 1;
end;
$$;

-- Exact hierarchical target matching. A target is never widened from one
-- business/service subtype into a sibling subtype.
create or replace function public.admin_notification_user_matches_target(input_user_id uuid, target_path text)
returns boolean
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  parts text[] := string_to_array(lower(coalesce(target_path, '')), '.');
  business_kind text := coalesce(parts[3], 'all');
  service_kind text := coalesce(parts[3], 'all');
  fleet_kind text := coalesce(parts[4], 'all');
begin
  if target_path is null or target_path = '' or lower(target_path) = 'all' then return true; end if;
  if parts[1] in ('platform','explore') then return true; end if;
  if parts[1] = 'nearby_area' then return true; end if;

  if parts[1] = 'urmall' then
    if parts[2] in ('sellers','seller_dashboard') then
      return exists(
        select 1 from public.marketplace_businesses business
        where business.user_id = input_user_id
          and (business_kind = 'all' or lower(coalesce(business.business_kind, 'retail')) = business_kind)
      ) or exists(
        select 1
        from public.marketplace_business_admins administrator
        join public.marketplace_businesses business on business.id = administrator.business_id
        where administrator.user_id = input_user_id and administrator.status = 'accepted'
          and (business_kind = 'all' or lower(coalesce(business.business_kind, 'retail')) = business_kind)
      );
    end if;
    if parts[2] in ('buyers','buyer_dashboard') then
      return exists(select 1 from public.marketplace_customer_messages message where message.buyer_id = input_user_id)
        or not exists(select 1 from public.marketplace_businesses business where business.user_id = input_user_id);
    end if;
    return exists(select 1 from public.marketplace_businesses business where business.user_id = input_user_id)
      or exists(select 1 from public.marketplace_business_admins administrator where administrator.user_id = input_user_id and administrator.status = 'accepted')
      or exists(select 1 from public.marketplace_customer_messages message where message.buyer_id = input_user_id);
  end if;

  if parts[1] = 'urride' and parts[2] in ('operator','operator_dashboard') then
    return exists(
      select 1
      from public.transport_operators operator
      join public.transport_fleets fleet on fleet.operator_id = operator.id
      where operator.user_id = input_user_id
        and (
          service_kind = 'all'
          or (service_kind = 'transport' and lower(coalesce(fleet.service_category::text, '')) in ('transport','both'))
          or (service_kind = 'delivery' and lower(coalesce(fleet.service_category::text, '')) in ('delivery','both'))
        )
        and (
          fleet_kind = 'all'
          or (fleet_kind = 'motorbike' and lower(coalesce(fleet.fleet_type::text, '')) in ('motorbike','motorcycle'))
          or (fleet_kind = 'tricycle' and lower(coalesce(fleet.fleet_type::text, '')) = 'tricycle')
          or (fleet_kind = 'taxi' and lower(coalesce(fleet.fleet_type::text, '')) in ('taxi','car'))
          or (fleet_kind = 'van' and lower(coalesce(fleet.fleet_type::text, '')) = 'van')
        )
    );
  end if;

  if parts[1] = 'urride' and parts[2] = 'company_dashboard' then
    return exists(
      select 1
      from public.transport_companies company
      left join public.transport_company_members member
        on member.company_id = company.id and member.user_id = input_user_id and member.status = 'active'
      where (company.owner_user_id = input_user_id or member.user_id is not null)
        and (
          business_kind = 'all'
          or exists(
            select 1 from public.transport_company_fleets fleet
            where fleet.company_id = company.id
              and (business_kind = 'transport' and fleet.service_category in ('Ride only','Ride and delivery')
                or business_kind = 'delivery' and fleet.service_category in ('Delivery only','Ride and delivery'))
          )
        )
    );
  end if;

  if parts[1] = 'urride' and parts[2] = 'passenger' then
    return exists(select 1 from public.transport_trips trip where trip.passenger_id = input_user_id);
  end if;
  if parts[1] = 'urride' then
    return exists(select 1 from public.transport_operators operator where operator.user_id = input_user_id)
      or exists(select 1 from public.transport_companies company where company.owner_user_id = input_user_id)
      or exists(select 1 from public.transport_company_members member where member.user_id = input_user_id and member.status = 'active')
      or exists(select 1 from public.transport_trips trip where trip.passenger_id = input_user_id);
  end if;
  return false;
end;
$$;

create or replace function public.admin_notification_user_matches_location(input_user_id uuid, locations jsonb)
returns boolean
language sql
security definer
stable
set search_path = public, auth
as $$
  select coalesce(jsonb_array_length(locations), 0) = 0 or exists (
    select 1
    from auth.users users
    cross join lateral jsonb_array_elements(locations) selected
    where users.id = input_user_id
      and (
        lower(coalesce(selected->>'country', selected->>'iso', '')) in (
          lower(coalesce(users.raw_user_meta_data->>'country_iso', '')),
          lower(coalesce(users.raw_user_meta_data->>'country_code', '')),
          lower(coalesce(users.raw_user_meta_data->>'country', '')),
          lower(coalesce(users.raw_user_meta_data->>'country_name', ''))
        )
        or lower(coalesce(selected->>'countryName', selected->>'name', '')) in (
          lower(coalesce(users.raw_user_meta_data->>'country_iso', '')),
          lower(coalesce(users.raw_user_meta_data->>'country_code', '')),
          lower(coalesce(users.raw_user_meta_data->>'country', '')),
          lower(coalesce(users.raw_user_meta_data->>'country_name', ''))
        )
      )
      and (
        coalesce((selected->>'entireCountry')::boolean, false)
        or lower(coalesce(users.raw_user_meta_data->>'city', '')) in (
          select lower(jsonb_array_elements_text(coalesce(selected->'cities', '[]'::jsonb)))
        )
      )
  );
$$;

create or replace function public.admin_notification_user_matches_segment(input_user_id uuid, segment_key text)
returns boolean
language sql
security definer
stable
set search_path = public, auth
as $$
  select exists(
    select 1 from auth.users users
    where users.id = input_user_id and case lower(segment_key)
      when 'new_users' then users.created_at >= now() - interval '30 days'
      when 'active_users' then users.last_sign_in_at >= now() - interval '30 days'
      when 'inactive_users' then coalesce(users.last_sign_in_at, users.created_at) < now() - interval '90 days'
      when 'verified_users' then users.email_confirmed_at is not null or users.phone_confirmed_at is not null
      when 'unverified_users' then users.email_confirmed_at is null and users.phone_confirmed_at is null
      when 'premium_users' then exists(
        select 1
        from public.kunthai_business_subscriptions subscription
        left join public.marketplace_businesses business on business.id = subscription.marketplace_business_id
        left join public.marketplace_business_admins administrator on administrator.business_id = business.id and administrator.user_id = users.id and administrator.status = 'accepted'
        left join public.transport_companies company on company.id = subscription.transport_company_id
        left join public.transport_company_members member on member.company_id = company.id and member.user_id = users.id and member.status = 'active'
        where subscription.plan_code in ('pro','premium') and subscription.status in ('active','grace')
          and (subscription.current_period_end is null or subscription.current_period_end > now())
          and (business.user_id = users.id or administrator.user_id is not null or company.owner_user_id = users.id or member.user_id is not null)
      )
      when 'buyers' then exists(select 1 from public.marketplace_customer_messages message where message.buyer_id = users.id)
      when 'sellers' then exists(select 1 from public.marketplace_businesses business where business.user_id = users.id)
        or exists(select 1 from public.marketplace_business_admins administrator where administrator.user_id = users.id and administrator.status = 'accepted')
      when 'operators' then exists(select 1 from public.transport_operators operator where operator.user_id = users.id)
      when 'companies' then exists(select 1 from public.transport_companies company where company.owner_user_id = users.id)
        or exists(select 1 from public.transport_company_members member where member.user_id = users.id and member.status = 'active')
      else false end
  );
$$;

create or replace function public.admin_campaign_recipient_ids(
  campaign_sector text,
  campaign_audience text,
  campaign_filter jsonb default '{}'::jsonb
)
returns setof uuid
language sql
security definer
stable
set search_path = public, auth
as $$
  select users.id
  from auth.users users
  where
    case campaign_audience
      when 'specific_users' then users.id::text in (
        select jsonb_array_elements_text(coalesce(campaign_filter->'userIds', '[]'::jsonb))
      )
      when 'segments' then exists (
        select 1 from jsonb_array_elements_text(coalesce(campaign_filter->'segments', '[]'::jsonb)) segment
        where public.admin_notification_user_matches_segment(users.id, segment)
      )
      when 'account_type' then lower(coalesce(users.raw_user_meta_data->>'account_type', 'personal')) = lower(coalesce(campaign_filter->>'accountType', 'personal'))
      when 'region' then lower(coalesce(users.raw_user_meta_data->>'country', users.raw_user_meta_data->>'city', '')) = lower(coalesce(campaign_filter->>'region', ''))
      when 'sector_users' then
        (campaign_sector = 'explore' and exists(select 1 from public.explore_profiles profile where profile.user_id = users.id))
        or (campaign_sector = 'marketplace' and (exists(select 1 from public.marketplace_businesses business where business.user_id = users.id)
          or exists(select 1 from public.marketplace_customer_messages message where message.buyer_id = users.id)))
        or (campaign_sector = 'transport' and (exists(select 1 from public.transport_operators operator where operator.user_id = users.id)
          or exists(select 1 from public.transport_companies company where company.owner_user_id = users.id)
          or exists(select 1 from public.transport_trips trip where trip.passenger_id = users.id)))
      else true
    end
    and (
      coalesce(jsonb_array_length(campaign_filter->'targets'), 0) = 0
      or exists (
        select 1 from jsonb_array_elements_text(coalesce(campaign_filter->'targets', '[]'::jsonb)) target
        where public.admin_notification_user_matches_target(users.id, target)
      )
    )
    and public.admin_notification_user_matches_location(users.id, coalesce(campaign_filter->'locations', '[]'::jsonb));
$$;

create or replace function public.admin_estimate_campaign_audience(
  campaign_sector text default 'platform',
  campaign_audience text default 'all',
  campaign_filter jsonb default '{}'::jsonb
)
returns integer
language plpgsql
security definer
stable
set search_path = public
as $$
declare total integer;
begin
  if auth.uid() is not null and not public.admin_has_permission('notifications.view', campaign_sector) then raise exception 'Not authorized'; end if;
  select count(*)::integer into total from public.admin_campaign_recipient_ids(campaign_sector, campaign_audience, campaign_filter);
  return coalesce(total, 0);
end;
$$;

create or replace function public.admin_validate_campaign_spec(
  campaign_sector text,
  campaign_audience text,
  campaign_priority text,
  campaign_filter jsonb,
  campaign_presentation text,
  campaign_category text,
  campaign_action_target text,
  campaign_action_data jsonb,
  campaign_configuration jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  allowed_presentations constant text[] := array['inbox','floating','floating_inbox','inline','inline_inbox','banner','bottom_sheet','modal','fullscreen','urgent','critical'];
begin
  if not public.admin_has_permission('notifications.manage', campaign_sector) then raise exception 'Not authorized'; end if;
  if campaign_presentation <> all(allowed_presentations) then raise exception 'Invalid presentation'; end if;
  if coalesce(jsonb_array_length(campaign_filter->'targets'), 0) = 0 then raise exception 'At least one platform target is required'; end if;
  if campaign_audience = 'specific_users' and coalesce(jsonb_array_length(campaign_filter->'userIds'), 0) = 0 then raise exception 'At least one KunThai user is required'; end if;
  if campaign_audience = 'segments' and coalesce(jsonb_array_length(campaign_filter->'segments'), 0) = 0 then raise exception 'At least one audience segment is required'; end if;
  if exists(
    select 1 from jsonb_array_elements(coalesce(campaign_filter->'locations', '[]'::jsonb)) selected
    where coalesce((selected->>'entireCountry')::boolean, false) = false
      and coalesce(jsonb_array_length(selected->'cities'), 0) = 0
  ) then raise exception 'City-targeted countries require at least one city'; end if;
  if campaign_priority = 'critical' and not public.admin_has_permission('notifications.critical', campaign_sector) then raise exception 'Critical campaign permission is required'; end if;
  if campaign_presentation = 'critical' and campaign_priority <> 'critical' then raise exception 'Critical presentation requires critical priority'; end if;
  if campaign_priority = 'critical' and campaign_category not in ('safety','security','account','emergency') then raise exception 'Critical priority is restricted to safety, security, account, or emergency campaigns'; end if;
  if campaign_category in ('promotion','marketplace') and coalesce((campaign_configuration#>>'{behaviour,canDismiss}')::boolean, true) = false then raise exception 'Promotional campaigns must be dismissible'; end if;
  if campaign_action_target = 'external' and coalesce(campaign_action_data->>'url', '') !~* '^https://' then raise exception 'External actions require an HTTPS URL'; end if;
end;
$$;

drop function if exists public.admin_create_campaign(text,text,text,text,text,jsonb,timestamptz,text[],text,text,text,jsonb,timestamptz);
create function public.admin_create_campaign(
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
declare created_campaign public.admin_notification_campaigns; audience_total integer;
begin
  if btrim(coalesce(campaign_title, '')) = '' or btrim(coalesce(campaign_body, '')) = '' then raise exception 'Title and message are required'; end if;
  perform public.admin_validate_campaign_spec(campaign_sector, campaign_audience, campaign_priority, campaign_filter,
    campaign_presentation, campaign_category, campaign_action_target, campaign_action_data, campaign_configuration);
  audience_total := public.admin_estimate_campaign_audience(campaign_sector, campaign_audience, campaign_filter);
  insert into public.admin_notification_campaigns(
    campaign_name, title, body, sector, audience_type, audience_filter, priority, status, scheduled_at,
    created_by, updated_by, channels, presentation, category, action_target, action_data, expires_at,
    estimated_audience, configuration
  ) values (
    coalesce(nullif(btrim(campaign_name), ''), btrim(campaign_title)), btrim(campaign_title), btrim(campaign_body),
    campaign_sector, campaign_audience, coalesce(campaign_filter, '{}'::jsonb), campaign_priority,
    case when campaign_schedule is null then 'draft' else 'pending_approval' end, campaign_schedule,
    auth.uid(), auth.uid(), coalesce(nullif(campaign_channels, '{}'::text[]), array['in_app']::text[]),
    campaign_presentation, btrim(campaign_category), nullif(btrim(campaign_action_target), ''),
    coalesce(campaign_action_data, '{}'::jsonb), campaign_expires_at, audience_total,
    coalesce(campaign_configuration, '{}'::jsonb)
  ) returning * into created_campaign;
  perform public.admin_log_action('notification.campaign_created', campaign_sector, 'notification_campaign', created_campaign.id, null, '', null, to_jsonb(created_campaign));
  return created_campaign;
end;
$$;

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
  if previous_campaign.status not in ('draft','pending_approval','approved','scheduled') then raise exception 'Only unsent campaigns can be edited'; end if;
  if btrim(coalesce(campaign_title, '')) = '' or btrim(coalesce(campaign_body, '')) = '' then raise exception 'Title and message are required'; end if;
  perform public.admin_validate_campaign_spec(campaign_sector, campaign_audience, campaign_priority, campaign_filter,
    campaign_presentation, campaign_category, campaign_action_target, campaign_action_data, campaign_configuration);
  audience_total := public.admin_estimate_campaign_audience(campaign_sector, campaign_audience, campaign_filter);
  update public.admin_notification_campaigns set
    campaign_name = coalesce(nullif(btrim(campaign_name), ''), btrim(campaign_title)),
    title = btrim(campaign_title), body = btrim(campaign_body), sector = campaign_sector,
    audience_type = campaign_audience, audience_filter = coalesce(campaign_filter, '{}'::jsonb),
    priority = campaign_priority, status = case when campaign_schedule is null then 'draft' else 'pending_approval' end,
    scheduled_at = campaign_schedule, channels = campaign_channels, presentation = campaign_presentation,
    category = btrim(campaign_category), action_target = nullif(btrim(campaign_action_target), ''),
    action_data = coalesce(campaign_action_data, '{}'::jsonb), expires_at = campaign_expires_at,
    estimated_audience = audience_total, configuration = coalesce(campaign_configuration, '{}'::jsonb),
    approved_by = null, approved_at = null, updated_by = auth.uid(), updated_at = now()
  where id = campaign_uuid returning * into updated_campaign;
  perform public.admin_log_action('notification.campaign_updated', campaign_sector, 'notification_campaign', campaign_uuid, null, '', to_jsonb(previous_campaign), to_jsonb(updated_campaign));
  return updated_campaign;
end;
$$;

create or replace function public.admin_approve_campaign(campaign_uuid uuid)
returns public.admin_notification_campaigns
language plpgsql
security definer
set search_path = public
as $$
declare previous_campaign public.admin_notification_campaigns; updated_campaign public.admin_notification_campaigns; independent boolean;
begin
  select * into previous_campaign from public.admin_notification_campaigns where id = campaign_uuid for update;
  if previous_campaign.id is null then raise exception 'Campaign not found'; end if;
  if not public.admin_has_permission('notifications.approve', previous_campaign.sector) then raise exception 'Not authorized'; end if;
  if previous_campaign.status not in ('draft','pending_approval') then raise exception 'Only draft campaigns can be approved'; end if;
  independent := previous_campaign.estimated_audience >= 10000
    or previous_campaign.priority = 'critical'
    or coalesce(jsonb_array_length(previous_campaign.audience_filter->'locations'), 0) = 0
    or (previous_campaign.audience_filter->'targets') ? 'all';
  if previous_campaign.created_by = auth.uid() and independent then raise exception 'A different administrator must approve this high-impact campaign'; end if;
  update public.admin_notification_campaigns set
    status = case when scheduled_at is null or scheduled_at <= now() then 'approved' else 'scheduled' end,
    approved_by = auth.uid(), approved_at = now(), updated_by = auth.uid(), updated_at = now()
  where id = campaign_uuid returning * into updated_campaign;
  perform public.admin_log_action('notification.campaign_approved', updated_campaign.sector, 'notification_campaign', campaign_uuid, null, '', to_jsonb(previous_campaign), to_jsonb(updated_campaign), jsonb_build_object('independentApprovalRequired', independent));
  return updated_campaign;
end;
$$;

drop function if exists public.admin_publish_campaign(uuid);
create function public.admin_publish_campaign(
  campaign_uuid uuid,
  confirmed_audience integer default null,
  confirmed_worldwide boolean default false
)
returns public.admin_notification_campaigns
language plpgsql
security definer
set search_path = public, auth
as $$
declare campaign public.admin_notification_campaigns; actual_audience integer; delivered integer := 0; worldwide boolean;
begin
  select * into campaign from public.admin_notification_campaigns where id = campaign_uuid for update;
  if campaign.id is null then raise exception 'Campaign not found'; end if;
  if auth.uid() is not null and not (public.admin_has_permission('notifications.publish', campaign.sector) or public.admin_has_permission('notifications.approve', campaign.sector)) then raise exception 'Not authorized'; end if;
  if campaign.status not in ('approved','scheduled') then raise exception 'Campaign must be approved before publication'; end if;
  if campaign.status = 'scheduled' and campaign.scheduled_at > now() then raise exception 'The scheduled publication time has not arrived'; end if;
  actual_audience := public.admin_estimate_campaign_audience(campaign.sector, campaign.audience_type, campaign.audience_filter);
  worldwide := coalesce(jsonb_array_length(campaign.audience_filter->'locations'), 0) = 0 or (campaign.audience_filter->'targets') ? 'all';
  if auth.uid() is not null and actual_audience >= 10000 and confirmed_audience is distinct from actual_audience then raise exception 'Audience changed: confirm the current % recipients', actual_audience; end if;
  if auth.uid() is not null and worldwide and not confirmed_worldwide then raise exception 'Worldwide publication must be explicitly confirmed'; end if;

  update public.admin_notification_campaigns set status = 'sending', estimated_audience = actual_audience, updated_at = now() where id = campaign_uuid;
  insert into public.platform_notifications(
    user_id, campaign_id, sector, notification_type, title, body, priority, category, workspace,
    action_target, action_data, channels, presentation, display_config, dedupe_key, expires_at
  )
  select recipient_id, campaign.id, campaign.sector, 'admin_message', campaign.title, campaign.body, campaign.priority,
    campaign.category, campaign.sector, campaign.action_target, campaign.action_data, campaign.channels,
    campaign.presentation, campaign.configuration, 'campaign:' || campaign.id::text, campaign.expires_at
  from public.admin_campaign_recipient_ids(campaign.sector, campaign.audience_type, campaign.audience_filter) recipient_id
  on conflict (campaign_id, user_id) where campaign_id is not null do nothing;
  get diagnostics delivered = row_count;
  update public.admin_notification_campaigns set
    status = 'completed', sent_at = now(), published_at = now(), published_by = auth.uid(),
    delivery_count = delivered, failure_count = 0, updated_at = now()
  where id = campaign_uuid returning * into campaign;
  perform public.admin_log_action('notification.campaign_published', campaign.sector, 'notification_campaign', campaign.id, null, '', null, to_jsonb(campaign), jsonb_build_object('recipientRowsCreated', delivered, 'confirmedWorldwide', confirmed_worldwide));
  return campaign;
exception when others then
  update public.admin_notification_campaigns set status = 'failed', failure_count = failure_count + 1, updated_at = now() where id = campaign_uuid;
  raise;
end;
$$;

drop function if exists public.admin_send_campaign_test(uuid);
create function public.admin_send_campaign_test(campaign_uuid uuid, target_user_id uuid default null)
returns public.platform_notifications
language plpgsql
security definer
set search_path = public
as $$
declare campaign public.admin_notification_campaigns; created_notification public.platform_notifications; recipient uuid := coalesce(target_user_id, auth.uid());
begin
  select * into campaign from public.admin_notification_campaigns where id = campaign_uuid;
  if campaign.id is null then raise exception 'Campaign not found'; end if;
  if not (public.admin_has_permission('notifications.test', campaign.sector) or public.admin_has_permission('notifications.manage', campaign.sector)) then raise exception 'Not authorized'; end if;
  if not exists(select 1 from auth.users where id = recipient) then raise exception 'Test recipient not found'; end if;
  insert into public.platform_notifications(
    user_id, sector, notification_type, title, body, priority, category, workspace,
    action_target, action_data, channels, presentation, display_config, dedupe_key, expires_at
  ) values (
    recipient, campaign.sector, 'admin_test', '[TEST] ' || campaign.title, campaign.body, campaign.priority,
    campaign.category, campaign.sector, campaign.action_target, campaign.action_data, campaign.channels,
    campaign.presentation, campaign.configuration,
    'campaign-test:' || campaign.id::text || ':' || recipient::text, now() + interval '1 day'
  )
  on conflict (user_id, dedupe_key) where dedupe_key is not null do update set
    title = excluded.title, body = excluded.body, priority = excluded.priority, category = excluded.category,
    workspace = excluded.workspace, action_target = excluded.action_target, action_data = excluded.action_data,
    channels = excluded.channels, presentation = excluded.presentation, display_config = excluded.display_config,
    status = 'unread', read_at = null, seen_at = null, displayed_at = null, last_presented_at = null,
    presentation_count = 0, actioned_at = null, dismissed_at = null, snoozed_until = null,
    clicked_at = null, cta_clicked_at = null, created_at = now()
  returning * into created_notification;
  perform public.admin_log_action('notification.campaign_tested', campaign.sector, 'notification_campaign', campaign.id, null, '', null, null, jsonb_build_object('targetUserId', recipient));
  return created_notification;
end;
$$;

create or replace function public.admin_get_campaign_metrics(campaign_uuid uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare campaign public.admin_notification_campaigns; result jsonb;
begin
  select * into campaign from public.admin_notification_campaigns where id = campaign_uuid;
  if campaign.id is null then raise exception 'Campaign not found'; end if;
  if not (public.admin_has_permission('notifications.analytics', campaign.sector) or public.admin_has_permission('notifications.view', campaign.sector)) then raise exception 'Not authorized'; end if;
  select jsonb_build_object(
    'targeted', campaign.estimated_audience,
    'created', count(*), 'delivered', count(*),
    'displayed', count(*) filter (where displayed_at is not null),
    'unread', count(*) filter (where status = 'unread'),
    'read', count(*) filter (where read_at is not null),
    'clicked', count(*) filter (where clicked_at is not null),
    'actioned', count(*) filter (where actioned_at is not null),
    'dismissed', count(*) filter (where dismissed_at is not null),
    'ctaClicks', count(*) filter (where cta_clicked_at is not null),
    'pushSent', count(*) filter (where push_sent_at is not null),
    'pushFailures', coalesce(sum(push_failure_count), 0),
    'deliveryRate', case when campaign.estimated_audience > 0 then round(count(*)::numeric * 100 / campaign.estimated_audience, 1) else 0 end,
    'clickThroughRate', case when count(*) filter (where displayed_at is not null) > 0 then round((count(*) filter (where cta_clicked_at is not null))::numeric * 100 / (count(*) filter (where displayed_at is not null)), 1) else 0 end
  ) into result from public.platform_notifications where campaign_id = campaign_uuid;
  return result;
end;
$$;

-- Preserve immutable campaign content while allowing an account to record its
-- own presentation, click, snooze, read, and dismiss receipts.
create or replace function public.guard_platform_notification_user_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' and not public.is_kunthai_admin() then
    new.user_id := old.user_id; new.campaign_id := old.campaign_id; new.sector := old.sector;
    new.notification_type := old.notification_type; new.title := old.title; new.body := old.body;
    new.priority := old.priority; new.category := old.category; new.workspace := old.workspace;
    new.workspace_id := old.workspace_id; new.action_target := old.action_target; new.action_data := old.action_data;
    new.channels := old.channels; new.presentation := old.presentation; new.display_config := old.display_config;
    new.dedupe_key := old.dedupe_key; new.expires_at := old.expires_at; new.push_sent_at := old.push_sent_at;
    new.push_failure_count := old.push_failure_count; new.created_at := old.created_at;
    if new.status not in ('unread','read','archived') then new.status := old.status; end if;
    if old.seen_at is not null then new.seen_at := old.seen_at; elsif new.seen_at is not null then new.seen_at := now(); end if;
    if old.displayed_at is not null then new.displayed_at := old.displayed_at; elsif new.displayed_at is not null then new.displayed_at := now(); end if;
    if new.last_presented_at is not null then new.last_presented_at := now(); end if;
    new.presentation_count := greatest(old.presentation_count, least(old.presentation_count + 1, new.presentation_count));
    if old.actioned_at is not null then new.actioned_at := old.actioned_at; elsif new.actioned_at is not null then new.actioned_at := now(); end if;
    if old.clicked_at is not null then new.clicked_at := old.clicked_at; elsif new.clicked_at is not null then new.clicked_at := now(); end if;
    if old.cta_clicked_at is not null then new.cta_clicked_at := old.cta_clicked_at; elsif new.cta_clicked_at is not null then new.cta_clicked_at := now(); end if;
    if old.dismissed_at is not null then new.dismissed_at := old.dismissed_at; elsif new.dismissed_at is not null then new.dismissed_at := now(); end if;
    if old.read_at is not null then new.read_at := old.read_at; elsif new.read_at is not null or new.status = 'read' then new.read_at := now(); end if;
  end if;
  return new;
end;
$$;

revoke all on function public.admin_lookup_campaign_user(text) from public, anon;
revoke all on function public.admin_notification_user_matches_target(uuid,text) from public, anon, authenticated;
revoke all on function public.admin_notification_user_matches_location(uuid,jsonb) from public, anon, authenticated;
revoke all on function public.admin_notification_user_matches_segment(uuid,text) from public, anon, authenticated;
revoke all on function public.admin_validate_campaign_spec(text,text,text,jsonb,text,text,text,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.admin_lookup_campaign_user(text) to authenticated;
grant execute on function public.admin_estimate_campaign_audience(text,text,jsonb) to authenticated;
grant execute on function public.admin_create_campaign(text,text,text,text,text,jsonb,timestamptz,text[],text,text,text,jsonb,timestamptz,text,jsonb) to authenticated;
grant execute on function public.admin_update_campaign(uuid,text,text,text,text,text,jsonb,timestamptz,text[],text,text,text,jsonb,timestamptz,text,jsonb) to authenticated;
grant execute on function public.admin_approve_campaign(uuid) to authenticated;
grant execute on function public.admin_publish_campaign(uuid,integer,boolean) to authenticated;
grant execute on function public.admin_send_campaign_test(uuid,uuid) to authenticated;
grant execute on function public.admin_cancel_campaign(uuid,text) to authenticated;
grant execute on function public.admin_get_campaign_metrics(uuid) to authenticated;

-- Admin notification campaigns v2: exact audiences, destination-aware
-- delivery, reliable scheduling and truthful analytics.
--
-- Additive and re-runnable. It re-declares everything the campaign center
-- needs (including what 20260913110000 introduced) so it works whether or not
-- that earlier migration reached this database. No rows are deleted and no
-- column is dropped.
--
-- The JavaScript mirror of every rule below is
-- web/src/Backend/services/campaigns/campaignModel.js.

-- ---------------------------------------------------------------------------
-- Schema
-- ---------------------------------------------------------------------------

alter table public.admin_notification_campaigns
  add column if not exists campaign_name text not null default '',
  add column if not exists configuration jsonb not null default '{}'::jsonb,
  add column if not exists updated_by uuid references auth.users(id) on delete set null,
  add column if not exists published_by uuid references auth.users(id) on delete set null,
  add column if not exists published_at timestamptz,
  add column if not exists last_error text,
  add column if not exists ended_at timestamptz,
  add column if not exists ended_by uuid references auth.users(id) on delete set null;

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
  ('notifications.analytics', 'View notification campaign analytics', 'notifications')
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

-- ---------------------------------------------------------------------------
-- Audience resolution
-- ---------------------------------------------------------------------------

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
      when 'buyers' then exists(select 1 from public.marketplace_orders purchase where purchase.buyer_id = users.id)
        or exists(select 1 from public.marketplace_customer_messages message where message.buyer_id = users.id)
      when 'sellers' then exists(select 1 from public.marketplace_businesses business where business.user_id = users.id)
        or exists(select 1 from public.marketplace_business_admins administrator where administrator.user_id = users.id and administrator.status = 'accepted')
      when 'operators' then exists(select 1 from public.transport_operators operator where operator.user_id = users.id)
      when 'companies' then exists(select 1 from public.transport_companies company where company.owner_user_id = users.id)
        or exists(select 1 from public.transport_company_members member where member.user_id = users.id and member.status = 'active')
      else false end
  );
$$;

-- UrMall buyer: an account with real buyer activity (an order or a message
-- to a business). Sellers: owners and accepted business administrators.
-- UrRide operator vehicles map onto transport_fleets.fleet_type
-- (motorcycle / tricycle / car); a taxi is a transport "car" fleet and a van
-- is a delivery "car" fleet. A selection never widens to a sibling subtype.
create or replace function public.admin_notification_user_matches_target(input_user_id uuid, target_path text)
returns boolean
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  parts text[] := string_to_array(lower(btrim(coalesce(target_path, ''))), '.');
  area text := coalesce(nullif(parts[2], ''), 'general');
  kind text := coalesce(nullif(parts[3], ''), 'all');
  vehicle text := coalesce(nullif(parts[4], ''), 'all');
begin
  if target_path is null or btrim(target_path) = '' or lower(btrim(target_path)) = 'all' then return true; end if;
  if parts[1] in ('platform', 'explore') then return true; end if;

  if parts[1] = 'urmall' then
    if area in ('sellers', 'seller', 'seller_dashboard') then
      return exists (
        select 1
        from public.marketplace_businesses business
        where (
            business.user_id = input_user_id
            or exists (
              select 1 from public.marketplace_business_admins administrator
              where administrator.business_id = business.id
                and administrator.user_id = input_user_id
                and administrator.status = 'accepted'
            )
          )
          and (
            kind = 'all'
            or (case lower(coalesce(business.business_kind, 'retail')) when 'hotel' then 'property_agent' else lower(coalesce(business.business_kind, 'retail')) end) = kind
          )
      );
    end if;
    if area in ('buyers', 'buyer', 'buyer_dashboard') then
      return exists (select 1 from public.marketplace_orders purchase where purchase.buyer_id = input_user_id)
        or exists (select 1 from public.marketplace_customer_messages message where message.buyer_id = input_user_id);
    end if;
    return public.admin_notification_user_matches_target(input_user_id, 'urmall.buyers')
      or public.admin_notification_user_matches_target(input_user_id, 'urmall.sellers.all');
  end if;

  if parts[1] = 'nearby_area' then
    return public.admin_notification_user_matches_target(input_user_id, 'urride.general');
  end if;

  if parts[1] = 'urride' then
    if area in ('operator', 'operator_dashboard') then
      return exists (
        select 1
        from public.transport_operators operator
        join public.transport_fleets fleet on fleet.operator_id = operator.id
        where operator.user_id = input_user_id
          and (
            kind = 'all'
            or (kind = 'transport' and lower(coalesce(fleet.service_category::text, '')) in ('transport', 'both'))
            or (kind = 'delivery' and lower(coalesce(fleet.service_category::text, '')) in ('delivery', 'both'))
          )
          and (
            vehicle = 'all'
            or (vehicle in ('motorbike', 'motorcycle') and lower(coalesce(fleet.fleet_type::text, '')) in ('motorcycle', 'motorbike'))
            or (vehicle = 'tricycle' and lower(coalesce(fleet.fleet_type::text, '')) = 'tricycle')
            or (vehicle = 'taxi' and lower(coalesce(fleet.fleet_type::text, '')) in ('car', 'taxi'))
            or (vehicle = 'van' and lower(coalesce(fleet.fleet_type::text, '')) in ('car', 'van'))
          )
      );
    end if;
    if area in ('company', 'company_dashboard') then
      return exists (
        select 1
        from public.transport_companies company
        where (
            company.owner_user_id = input_user_id
            or exists (
              select 1 from public.transport_company_members member
              where member.company_id = company.id and member.user_id = input_user_id and member.status = 'active'
            )
          )
          and (
            kind = 'all'
            or exists (
              select 1 from public.transport_company_fleets fleet
              where fleet.company_id = company.id
                and (
                  (kind = 'transport' and fleet.service_category in ('Ride only', 'Ride and delivery'))
                  or (kind = 'delivery' and fleet.service_category in ('Delivery only', 'Ride and delivery'))
                  or (kind = 'rental' and fleet.service_category = 'Rental')
                )
            )
          )
      );
    end if;
    if area = 'passenger' then
      return exists (select 1 from public.transport_trips trip where trip.passenger_id = input_user_id);
    end if;
    return public.admin_notification_user_matches_target(input_user_id, 'urride.passenger')
      or public.admin_notification_user_matches_target(input_user_id, 'urride.operator.all')
      or public.admin_notification_user_matches_target(input_user_id, 'urride.company_dashboard.all');
  end if;

  return false;
end;
$$;

-- A location matches the account profile (country / country_code / city in
-- auth metadata) or the location of a business the account runs, so
-- "Restaurants in Freetown" reaches restaurants located in Freetown.
create or replace function public.admin_notification_user_matches_location(input_user_id uuid, locations jsonb)
returns boolean
language sql
security definer
stable
set search_path = public, auth
as $$
  with places as (
    select
      lower(btrim(coalesce(nullif(users.raw_user_meta_data->>'country_code', ''), nullif(users.raw_user_meta_data->>'country_iso', ''), ''))) as iso,
      lower(btrim(coalesce(nullif(users.raw_user_meta_data->>'country', ''), nullif(users.raw_user_meta_data->>'country_name', ''), ''))) as country,
      lower(btrim(coalesce(users.raw_user_meta_data->>'city', ''))) as city
    from auth.users users
    where users.id = input_user_id
    union all
    select lower(btrim(coalesce(business.country_iso, ''))), lower(btrim(coalesce(business.country, ''))), lower(btrim(coalesce(business.city, '')))
    from public.marketplace_businesses business
    where business.user_id = input_user_id
      or exists (
        select 1 from public.marketplace_business_admins administrator
        where administrator.business_id = business.id and administrator.user_id = input_user_id and administrator.status = 'accepted'
      )
  )
  select coalesce(jsonb_array_length(locations), 0) = 0 or exists (
    select 1
    from places place
    cross join lateral jsonb_array_elements(locations) selected
    where (
        (place.iso <> '' and place.iso = lower(btrim(coalesce(selected->>'country', ''))))
        or (place.country <> '' and place.country in (
          lower(btrim(coalesce(selected->>'countryName', ''))),
          lower(btrim(coalesce(selected->>'country', '')))
        ))
      )
      and (
        coalesce((selected->>'entireCountry')::boolean, false)
        or (place.city <> '' and place.city in (
          select lower(btrim(city_name)) from jsonb_array_elements_text(coalesce(selected->'cities', '[]'::jsonb)) city_name
        ))
      )
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
  where coalesce(users.is_anonymous, false) = false
    and not exists (
      select 1 from public.platform_account_controls control
      where control.user_id = users.id and control.status = 'banned'
    )
    and case campaign_audience
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
        (campaign_sector = 'explore' and exists (select 1 from public.explore_profiles profile where profile.user_id = users.id))
        or (campaign_sector = 'marketplace' and public.admin_notification_user_matches_target(users.id, 'urmall.general'))
        or (campaign_sector = 'transport' and public.admin_notification_user_matches_target(users.id, 'urride.general'))
      else true
    end
    and (
      coalesce(jsonb_array_length(campaign_filter->'targets'), 0) = 0
      or exists (
        select 1 from jsonb_array_elements_text(coalesce(campaign_filter->'targets', '[]'::jsonb)) target
        where public.admin_notification_user_matches_target(users.id, target)
      )
    )
    -- Exact KunThai IDs are already a precise choice; location applies to
    -- every other audience.
    and (
      campaign_audience = 'specific_users'
      or public.admin_notification_user_matches_location(users.id, coalesce(campaign_filter->'locations', '[]'::jsonb))
    );
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
  if auth.uid() is not null
     and not (public.admin_has_permission('notifications.view', campaign_sector) or public.admin_has_permission('notifications.manage', campaign_sector)) then
    raise exception 'Not authorized';
  end if;
  select count(*)::integer into total
  from public.admin_campaign_recipient_ids(campaign_sector, campaign_audience, campaign_filter);
  return coalesce(total, 0);
end;
$$;

-- Admin-only KunThai ID lookup. Email addresses and phone numbers are never returned.
create or replace function public.admin_lookup_campaign_user(public_kunthai_id text)
returns table(user_id uuid, public_id text, display_name text, avatar_url text, country text, city text)
language plpgsql
security definer
stable
set search_path = public, auth
as $$
declare
  normalized_id text := upper(regexp_replace(coalesce(public_kunthai_id, ''), '[^A-Za-z0-9]', '', 'g'));
begin
  if not (public.admin_has_permission('notifications.manage') or public.admin_has_permission('notifications.test')) then
    raise exception 'Not authorized';
  end if;
  if normalized_id = '' then return; end if;
  if left(normalized_id, 3) <> 'KTU' then normalized_id := 'KTU' || normalized_id; end if;

  return query
  select
    users.id,
    identity.public_user_id,
    coalesce(nullif(profile.display_name, ''), nullif(users.raw_user_meta_data->>'display_name', ''),
      nullif(users.raw_user_meta_data->>'full_name', ''), 'KunThai account'),
    coalesce(nullif(profile.avatar_url, ''), nullif(users.raw_user_meta_data->>'avatar_url', ''), ''),
    coalesce(nullif(users.raw_user_meta_data->>'country', ''), nullif(users.raw_user_meta_data->>'country_name', ''), ''),
    coalesce(nullif(users.raw_user_meta_data->>'city', ''), '')
  from public.kunthai_account_identities identity
  join auth.users users on users.id = identity.user_id
  left join public.explore_profiles profile on profile.user_id = users.id
  where upper(regexp_replace(identity.public_user_id, '[^A-Za-z0-9]', '', 'g')) = normalized_id
  limit 1;
end;
$$;

-- Real country/city choices for location targeting, counted from account
-- profiles and business locations. Only aggregate counts leave the database.
create or replace function public.admin_campaign_location_options()
returns table(country_code text, country_name text, city text, accounts integer)
language plpgsql
security definer
stable
set search_path = public, auth
as $$
begin
  if not (public.admin_has_permission('notifications.manage') or public.admin_has_permission('notifications.view')) then
    raise exception 'Not authorized';
  end if;

  return query
  with places as (
    select
      upper(nullif(btrim(users.raw_user_meta_data->>'country_code'), '')) as iso,
      nullif(btrim(users.raw_user_meta_data->>'country'), '') as country,
      nullif(btrim(users.raw_user_meta_data->>'city'), '') as place_city,
      users.id as account_id
    from auth.users users
    where coalesce(users.is_anonymous, false) = false
    union all
    select upper(nullif(btrim(business.country_iso), '')), nullif(btrim(business.country), ''), nullif(btrim(business.city), ''), business.user_id
    from public.marketplace_businesses business
  )
  select
    coalesce(max(place.iso), '')::text,
    coalesce(max(place.country), '')::text,
    min(place.place_city)::text,
    count(distinct place.account_id)::integer
  from places place
  where place.place_city is not null and (place.iso is not null or place.country is not null)
  group by coalesce(place.iso, lower(place.country)), lower(place.place_city)
  order by count(distinct place.account_id) desc
  limit 3000;
end;
$$;

-- ---------------------------------------------------------------------------
-- Validation (server authority for every campaign payload)
-- ---------------------------------------------------------------------------

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
set search_path = public, auth
as $$
declare
  allowed_presentations constant text[] := array['inbox','floating','floating_inbox','inline','inline_inbox','banner','bottom_sheet','modal','fullscreen','urgent','critical'];
  inbox_presentations constant text[] := array['inbox','floating_inbox','inline_inbox','bottom_sheet','modal','fullscreen','urgent','critical'];
  inline_screens constant text[] := array['any','explore','urmall','urmall.buyer','urride','urride.passenger'];
  action_screens constant text[] := array['notifications','explore:urfeed','explore:swip-tab','messages','settings','verification','urmall','urmall:orders','urmall:messages','urmall:business','urmall:business-messages','urride','urride:notifications','urride:trips','urride:operator-dashboard','urride:company-dashboard','urride:nearby-area'];
  opening_animations constant text[] := array['none','fade','slide_up','slide_down','slide_left','slide_right','scale','spring'];
  closing_animations constant text[] := array['none','fade','slide_down','slide_up','slide_left','slide_right','scale'];
  config jsonb := coalesce(campaign_configuration, '{}'::jsonb);
  version integer := coalesce(nullif(config->>'schemaVersion', '')::integer, 1);
  platform text := coalesce(config#>>'{audience,platform}', '');
  audience_branch text;
  expected_sector text;
  expected_inbox text;
  allowed_screens text[];
  screen text := coalesce(config#>>'{presentation,screen}', '');
  entity_id text;
  media_url text := coalesce(config#>>'{media,url}', '');
begin
  if not public.admin_has_permission('notifications.manage', campaign_sector) then raise exception 'Not authorized'; end if;
  if campaign_presentation <> all(allowed_presentations) then raise exception 'Invalid presentation'; end if;
  if coalesce(jsonb_array_length(campaign_filter->'targets'), 0) = 0 then raise exception 'Choose who this campaign is for'; end if;
  if campaign_audience = 'specific_users' and coalesce(jsonb_array_length(campaign_filter->'userIds'), 0) = 0 then raise exception 'Add at least one KunThai ID'; end if;
  if campaign_audience = 'segments' and coalesce(jsonb_array_length(campaign_filter->'segments'), 0) = 0 then raise exception 'At least one audience segment is required'; end if;
  if exists (
    select 1 from jsonb_array_elements(coalesce(campaign_filter->'locations', '[]'::jsonb)) selected
    where coalesce((selected->>'entireCountry')::boolean, false) = false
      and coalesce(jsonb_array_length(selected->'cities'), 0) = 0
  ) then raise exception 'City-targeted countries require at least one city'; end if;
  if campaign_priority = 'critical' and not public.admin_has_permission('notifications.critical', campaign_sector) then raise exception 'Critical campaign permission is required'; end if;
  if campaign_presentation = 'critical' and campaign_priority <> 'critical' then raise exception 'Critical presentation requires critical priority'; end if;
  if campaign_priority = 'critical' and campaign_category not in ('safety','security','account','emergency') then raise exception 'Critical priority is restricted to safety, security, account, or emergency campaigns'; end if;
  if campaign_category in ('promotion','marketplace') and coalesce((config#>>'{behaviour,canDismiss}')::boolean, true) = false then raise exception 'Promotional campaigns must be dismissible'; end if;
  if campaign_action_target = 'external' and coalesce(campaign_action_data->>'url', '') !~* '^https://[^/@\s]+' then raise exception 'External actions require an HTTPS URL'; end if;
  if media_url <> '' and media_url !~* '^https://[^/@\s]+' then raise exception 'Media must be an HTTPS link'; end if;

  if version < 2 then return; end if;

  -- Audience
  if platform not in ('all','explore','urmall','urride') then raise exception 'Choose a KunThai audience'; end if;
  audience_branch := case platform
    when 'urmall' then 'urmall.' || coalesce(nullif(config#>>'{audience,urmallRole}', ''), 'all')
    when 'urride' then 'urride.' || coalesce(nullif(config#>>'{audience,urrideRole}', ''), 'all')
    else platform
  end;
  if audience_branch not in ('all','explore','urmall.all','urmall.buyer','urmall.seller','urride.all','urride.passenger','urride.operator','urride.company') then
    raise exception 'Unsupported audience';
  end if;
  expected_sector := case platform when 'urmall' then 'marketplace' when 'urride' then 'transport' when 'explore' then 'explore' else 'platform' end;
  if campaign_sector <> expected_sector then raise exception 'Campaign sector does not match its audience'; end if;

  -- Destination
  expected_inbox := case audience_branch
    when 'all' then 'explore' when 'explore' then 'explore'
    when 'urmall.all' then 'urmall' when 'urmall.buyer' then 'urmall' when 'urmall.seller' then 'urmall.seller'
    when 'urride.all' then 'urride' when 'urride.passenger' then 'urride'
    when 'urride.operator' then 'urride.operator' when 'urride.company' then 'urride.company'
  end;
  if coalesce(config->>'inbox', '') <> expected_inbox then raise exception 'Notification inbox does not match the audience'; end if;
  if coalesce(config#>>'{presentation,type}', '') <> campaign_presentation then raise exception 'Presentation settings are out of date'; end if;

  allowed_screens := case audience_branch
    when 'all' then array['any','explore']
    when 'explore' then array['explore']
    when 'urmall.all' then array['urmall','urmall.buyer','urmall.seller']
    when 'urmall.buyer' then array['urmall.buyer']
    when 'urmall.seller' then array['urmall.seller']
    when 'urride.all' then array['urride','urride.passenger','urride.operator','urride.company']
    when 'urride.passenger' then array['urride.passenger']
    when 'urride.operator' then array['urride.operator']
    when 'urride.company' then array['urride.company']
  end;
  if campaign_presentation = 'inbox' then
    if screen <> '' then raise exception 'Inbox-only campaigns do not use a screen'; end if;
  else
    if screen <> all(allowed_screens) then raise exception 'Choose a KunThai screen that this audience uses'; end if;
    if campaign_presentation in ('inline','inline_inbox') and screen <> all(inline_screens) then
      raise exception 'Inline cards are only available on screens with the KunThai navigation bar';
    end if;
  end if;
  if coalesce(config#>>'{presentation,includeInbox}', '') <> ''
     and (config#>>'{presentation,includeInbox}')::boolean <> (campaign_presentation = any(inbox_presentations)) then
    raise exception 'Presentation inbox setting is inconsistent';
  end if;

  if coalesce(config#>>'{presentation,openingAnimation}', 'fade') <> all(opening_animations) then raise exception 'Unsupported opening animation'; end if;
  if coalesce(config#>>'{presentation,closingAnimation}', 'fade') <> all(closing_animations) then raise exception 'Unsupported closing animation'; end if;
  if coalesce(nullif(config#>>'{presentation,animationDurationMs}', '')::integer, 320) not between 0 and 1200 then raise exception 'Animation duration must be between 0 and 1200 ms'; end if;
  if coalesce(nullif(config#>>'{presentation,autoDismissSeconds}', '')::integer, 0) not between 0 and 120 then raise exception 'Auto-dismiss must be between 0 and 120 seconds'; end if;

  -- Action
  if nullif(btrim(coalesce(campaign_action_target, '')), '') is not null then
    if campaign_action_target = any(action_screens) then
      null;
    elsif campaign_action_target in ('explore:post','explore:swip','profile','urmall:product','urmall:store') then
      entity_id := case campaign_action_target
        when 'profile' then campaign_action_data->>'userId'
        when 'urmall:product' then campaign_action_data->>'productId'
        when 'urmall:store' then campaign_action_data->>'businessId'
        else campaign_action_data->>'postId'
      end;
      if coalesce(entity_id, '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        raise exception 'The linked item needs a valid KunThai ID';
      end if;
      if campaign_action_target in ('explore:post','explore:swip') and not exists (select 1 from public.explore_posts post where post.id = entity_id::uuid) then
        raise exception 'The linked post no longer exists';
      end if;
      if campaign_action_target = 'urmall:product' and not exists (select 1 from public.marketplace_products product where product.id = entity_id::uuid) then
        raise exception 'The linked product no longer exists';
      end if;
      if campaign_action_target = 'urmall:store' and not exists (select 1 from public.marketplace_businesses business where business.id = entity_id::uuid) then
        raise exception 'The linked store no longer exists';
      end if;
      if campaign_action_target = 'profile' and not exists (select 1 from auth.users account where account.id = entity_id::uuid) then
        raise exception 'The linked profile no longer exists';
      end if;
    elsif campaign_action_target <> 'external' then
      raise exception 'Unsupported notification action';
    end if;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Create / update
-- ---------------------------------------------------------------------------

drop function if exists public.admin_create_campaign(text,text,text,text,text,jsonb,timestamptz);
drop function if exists public.admin_create_campaign(text,text,text,text,text,jsonb,timestamptz,text[],text,text,text,jsonb,timestamptz);

create or replace function public.admin_create_campaign(
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
  if length(campaign_title) > 120 or length(campaign_body) > 1000 then raise exception 'Title or message is too long'; end if;
  if campaign_schedule is not null and campaign_schedule < now() - interval '2 minutes' then raise exception 'The scheduled time is in the past'; end if;
  if campaign_expires_at is not null and campaign_expires_at <= coalesce(campaign_schedule, now()) then raise exception 'The end time must be after the start time'; end if;
  perform public.admin_validate_campaign_spec(campaign_sector, campaign_audience, campaign_priority, campaign_filter,
    campaign_presentation, campaign_category, campaign_action_target, campaign_action_data, campaign_configuration);
  if campaign_schedule is not null and not (public.admin_has_permission('notifications.schedule', campaign_sector) or public.admin_has_permission('notifications.approve', campaign_sector)) then
    raise exception 'Scheduling permission is required';
  end if;
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
    campaign_name = coalesce(nullif(btrim(campaign_name), ''), btrim(campaign_title)),
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

-- ---------------------------------------------------------------------------
-- Approval
-- ---------------------------------------------------------------------------

-- A second administrator must approve campaigns with a large blast radius:
-- all KunThai accounts, critical priority, or 1,000+ recipients. Exact
-- KunThai-ID campaigns and smaller targeted campaigns can be approved by
-- their author when that author holds notifications.approve.
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
  if previous_campaign.status not in ('draft','pending_approval','failed') then raise exception 'Only unsent campaigns can be approved'; end if;
  if previous_campaign.expires_at is not null and previous_campaign.expires_at <= now() then raise exception 'This campaign has already expired'; end if;
  independent := previous_campaign.priority = 'critical'
    or (previous_campaign.audience_filter->'targets') ? 'all'
    or (previous_campaign.audience_type <> 'specific_users' and previous_campaign.estimated_audience >= 1000);
  if previous_campaign.created_by = auth.uid() and independent then
    raise exception 'A different administrator must approve this high-impact campaign';
  end if;
  update public.admin_notification_campaigns set
    status = case when scheduled_at is null or scheduled_at <= now() then 'approved' else 'scheduled' end,
    approved_by = auth.uid(), approved_at = now(), last_error = null, updated_by = auth.uid(), updated_at = now()
  where id = campaign_uuid returning * into updated_campaign;
  perform public.admin_log_action('notification.campaign_approved', updated_campaign.sector, 'notification_campaign', campaign_uuid, null, '',
    to_jsonb(previous_campaign), to_jsonb(updated_campaign), jsonb_build_object('independentApprovalRequired', independent));
  return updated_campaign;
end;
$$;

-- ---------------------------------------------------------------------------
-- Publication
-- ---------------------------------------------------------------------------

-- Internal: materialise delivery rows. Callers perform authorisation.
create or replace function public.admin_publish_campaign_rows(campaign_uuid uuid)
returns public.admin_notification_campaigns
language plpgsql
security definer
set search_path = public, auth
as $$
declare campaign public.admin_notification_campaigns; created integer := 0; total integer := 0;
begin
  select * into campaign from public.admin_notification_campaigns where id = campaign_uuid for update;
  if campaign.id is null then raise exception 'Campaign not found'; end if;
  if campaign.status not in ('approved','scheduled') then raise exception 'Campaign must be approved before publication'; end if;
  if campaign.scheduled_at is not null and campaign.scheduled_at > now() then raise exception 'The scheduled publication time has not arrived'; end if;
  if campaign.expires_at is not null and campaign.expires_at <= now() then raise exception 'This campaign expired before it could be sent'; end if;

  update public.admin_notification_campaigns set status = 'sending', updated_at = now() where id = campaign_uuid;

  insert into public.platform_notifications(
    user_id, campaign_id, sector, notification_type, title, body, priority, category, workspace,
    action_target, action_data, channels, presentation, display_config, dedupe_key, expires_at
  )
  select recipient_id, campaign.id, campaign.sector, 'admin_message', campaign.title, campaign.body, campaign.priority,
    campaign.category, campaign.sector, campaign.action_target, campaign.action_data, campaign.channels,
    campaign.presentation, campaign.configuration, 'campaign:' || campaign.id::text, campaign.expires_at
  from public.admin_campaign_recipient_ids(campaign.sector, campaign.audience_type, campaign.audience_filter) recipient_id
  on conflict (campaign_id, user_id) where campaign_id is not null do nothing;
  get diagnostics created = row_count;

  select count(*)::integer into total from public.platform_notifications where campaign_id = campaign_uuid;

  update public.admin_notification_campaigns set
    status = 'completed', sent_at = coalesce(sent_at, now()), published_at = now(), published_by = auth.uid(),
    estimated_audience = total, delivery_count = total, last_error = null, updated_at = now()
  where id = campaign_uuid returning * into campaign;

  perform public.admin_log_action('notification.campaign_published', campaign.sector, 'notification_campaign', campaign.id, null, '',
    null, to_jsonb(campaign), jsonb_build_object('recipientRowsCreated', created, 'scheduled', auth.uid() is null));
  return campaign;
end;
$$;

drop function if exists public.admin_publish_campaign(uuid);

create or replace function public.admin_publish_campaign(
  campaign_uuid uuid,
  confirmed_audience integer default null,
  confirmed_worldwide boolean default false
)
returns public.admin_notification_campaigns
language plpgsql
security definer
set search_path = public, auth
as $$
declare campaign public.admin_notification_campaigns; actual_audience integer; worldwide boolean;
begin
  select * into campaign from public.admin_notification_campaigns where id = campaign_uuid;
  if campaign.id is null then raise exception 'Campaign not found'; end if;
  if auth.uid() is not null and not (public.admin_has_permission('notifications.publish', campaign.sector) or public.admin_has_permission('notifications.approve', campaign.sector)) then
    raise exception 'Not authorized';
  end if;
  if auth.uid() is not null then
    actual_audience := public.admin_estimate_campaign_audience(campaign.sector, campaign.audience_type, campaign.audience_filter);
    worldwide := campaign.audience_type <> 'specific_users'
      and (coalesce(jsonb_array_length(campaign.audience_filter->'locations'), 0) = 0 or (campaign.audience_filter->'targets') ? 'all');
    if actual_audience >= 1000 and confirmed_audience is distinct from actual_audience then
      raise exception 'Audience changed: confirm the current % recipients', actual_audience;
    end if;
    if worldwide and not confirmed_worldwide then raise exception 'Worldwide publication must be explicitly confirmed'; end if;
  end if;
  return public.admin_publish_campaign_rows(campaign_uuid);
end;
$$;

-- Runs every due scheduled campaign. A campaign that cannot be sent is marked
-- failed with its reason instead of silently retrying forever.
create or replace function public.admin_publish_due_campaigns()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare due_campaign record; published integer := 0;
begin
  for due_campaign in
    select id from public.admin_notification_campaigns
    where status = 'scheduled' and scheduled_at <= now()
    order by scheduled_at
    for update skip locked
  loop
    begin
      perform public.admin_publish_campaign_rows(due_campaign.id);
      published := published + 1;
    exception when others then
      update public.admin_notification_campaigns
      set status = 'failed', failure_count = failure_count + 1, last_error = left(sqlerrm, 500), updated_at = now()
      where id = due_campaign.id;
    end;
  end loop;
  return published;
end;
$$;

-- Lets the admin app release due campaigns immediately (for example when the
-- campaign center opens). It can only send campaigns that were already
-- approved for that time.
create or replace function public.admin_run_due_campaigns()
returns integer
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_kunthai_admin() then raise exception 'Not authorized'; end if;
  return public.admin_publish_due_campaigns();
end;
$$;

-- Ends a live campaign: every undelivered or unseen presentation stops and the
-- inbox copies expire. Delivery rows and analytics are kept.
create or replace function public.admin_end_campaign(campaign_uuid uuid, end_reason text)
returns public.admin_notification_campaigns
language plpgsql
security definer
set search_path = public
as $$
declare previous_campaign public.admin_notification_campaigns; updated_campaign public.admin_notification_campaigns;
begin
  select * into previous_campaign from public.admin_notification_campaigns where id = campaign_uuid for update;
  if previous_campaign.id is null then raise exception 'Campaign not found'; end if;
  if not (public.admin_has_permission('notifications.manage', previous_campaign.sector) or public.admin_has_permission('notifications.publish', previous_campaign.sector)) then
    raise exception 'Not authorized';
  end if;
  if previous_campaign.status <> 'completed' then raise exception 'Only sent campaigns can be ended'; end if;
  if length(btrim(coalesce(end_reason, ''))) < 5 then raise exception 'Give a short reason for ending this campaign'; end if;

  update public.platform_notifications
  set expires_at = now()
  where campaign_id = campaign_uuid and (expires_at is null or expires_at > now());

  update public.admin_notification_campaigns
  set expires_at = now(), ended_at = now(), ended_by = auth.uid(), updated_by = auth.uid(), updated_at = now()
  where id = campaign_uuid returning * into updated_campaign;

  perform public.admin_log_action('notification.campaign_ended', updated_campaign.sector, 'notification_campaign', campaign_uuid, null, btrim(end_reason),
    to_jsonb(previous_campaign), to_jsonb(updated_campaign));
  return updated_campaign;
end;
$$;

create or replace function public.admin_cancel_campaign(campaign_uuid uuid, cancel_reason text)
returns public.admin_notification_campaigns
language plpgsql
security definer
set search_path = public
as $$
declare campaign public.admin_notification_campaigns;
begin
  select * into campaign from public.admin_notification_campaigns where id = campaign_uuid for update;
  if campaign.id is null then raise exception 'Campaign not found'; end if;
  if not public.admin_has_permission('notifications.manage', campaign.sector) then raise exception 'Not authorized'; end if;
  if campaign.status in ('completed','cancelled','sending') then raise exception 'This campaign can no longer be cancelled'; end if;
  if length(btrim(coalesce(cancel_reason, ''))) < 5 then raise exception 'A cancellation reason is required'; end if;
  update public.admin_notification_campaigns
  set status = 'cancelled', cancelled_by = auth.uid(), cancelled_at = now(), updated_at = now()
  where id = campaign_uuid returning * into campaign;
  perform public.admin_log_action('notification.campaign_cancelled', campaign.sector, 'notification_campaign', campaign.id, null, btrim(cancel_reason));
  return campaign;
end;
$$;

-- ---------------------------------------------------------------------------
-- Test delivery
-- ---------------------------------------------------------------------------

drop function if exists public.admin_send_campaign_test(uuid);

-- Sends the real campaign (same presentation, destination, content and
-- action) to one account through the normal delivery table. Test rows carry
-- no campaign_id, so they never count in campaign analytics.
create or replace function public.admin_send_campaign_test(campaign_uuid uuid, target_user_id uuid default null)
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
  if not exists (select 1 from auth.users where id = recipient) then raise exception 'Test recipient not found'; end if;
  insert into public.platform_notifications(
    user_id, sector, notification_type, title, body, priority, category, workspace,
    action_target, action_data, channels, presentation, display_config, dedupe_key, expires_at
  ) values (
    recipient, campaign.sector, 'admin_test', '[TEST] ' || campaign.title, campaign.body, campaign.priority,
    campaign.category, campaign.sector, campaign.action_target, campaign.action_data, array['in_app']::text[],
    campaign.presentation, campaign.configuration || jsonb_build_object('testCampaignId', campaign.id),
    'campaign-test:' || campaign.id::text || ':' || recipient::text, now() + interval '1 day'
  )
  on conflict (user_id, dedupe_key) where dedupe_key is not null do update set
    title = excluded.title, body = excluded.body, priority = excluded.priority, category = excluded.category,
    workspace = excluded.workspace, action_target = excluded.action_target, action_data = excluded.action_data,
    channels = excluded.channels, presentation = excluded.presentation, display_config = excluded.display_config,
    status = 'unread', read_at = null, seen_at = null, displayed_at = null, last_presented_at = null,
    presentation_count = 0, actioned_at = null, dismissed_at = null, snoozed_until = null,
    clicked_at = null, cta_clicked_at = null, expires_at = excluded.expires_at, created_at = now()
  returning * into created_notification;
  perform public.admin_log_action('notification.campaign_tested', campaign.sector, 'notification_campaign', campaign.id, null, '', null, null,
    jsonb_build_object('targetUserId', recipient));
  return created_notification;
end;
$$;

-- Tells the admin whether a test account is actually in the campaign's
-- audience, so a test that lands on the wrong interface is explained.
create or replace function public.admin_check_campaign_test_recipient(campaign_uuid uuid, target_user_id uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare campaign public.admin_notification_campaigns;
begin
  select * into campaign from public.admin_notification_campaigns where id = campaign_uuid;
  if campaign.id is null then raise exception 'Campaign not found'; end if;
  if not (public.admin_has_permission('notifications.test', campaign.sector) or public.admin_has_permission('notifications.manage', campaign.sector)) then raise exception 'Not authorized'; end if;
  return jsonb_build_object(
    'matchesAudience', exists (
      select 1 from jsonb_array_elements_text(coalesce(campaign.audience_filter->'targets', '[]'::jsonb)) target
      where public.admin_notification_user_matches_target(target_user_id, target)
    ),
    'matchesLocation', campaign.audience_type = 'specific_users'
      or public.admin_notification_user_matches_location(target_user_id, coalesce(campaign.audience_filter->'locations', '[]'::jsonb))
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Analytics
-- ---------------------------------------------------------------------------

-- Every figure is counted from delivery rows. Rates are null (shown as
-- "unavailable") whenever their denominator is zero. Push figures are null
-- unless the campaign used the push channel.
create or replace function public.admin_get_campaign_metrics(campaign_uuid uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare campaign public.admin_notification_campaigns; result jsonb; in_app_presented boolean;
begin
  select * into campaign from public.admin_notification_campaigns where id = campaign_uuid;
  if campaign.id is null then raise exception 'Campaign not found'; end if;
  if not (public.admin_has_permission('notifications.analytics', campaign.sector) or public.admin_has_permission('notifications.view', campaign.sector)) then raise exception 'Not authorized'; end if;
  in_app_presented := campaign.presentation <> 'inbox';

  with delivery_rows as (
    select * from public.platform_notifications where campaign_id = campaign_uuid
  ), counts as (
    select
      count(*)::integer as delivered,
      (count(*) filter (where displayed_at is not null or seen_at is not null))::integer as viewed,
      (count(*) filter (where clicked_at is not null or cta_clicked_at is not null or actioned_at is not null))::integer as clicked,
      (count(*) filter (where cta_clicked_at is not null or actioned_at is not null))::integer as cta_clicked,
      (count(*) filter (where dismissed_at is not null))::integer as dismissed,
      (count(*) filter (where read_at is not null))::integer as inbox_read,
      (count(*) filter (where displayed_at is null and seen_at is null and read_at is null and dismissed_at is null))::integer as pending,
      (count(*) filter (where push_sent_at is not null))::integer as push_sent,
      coalesce(sum(push_failure_count), 0)::integer as push_failures,
      (count(*) filter (where coalesce(presentation_count, 0) > 0))::integer as presented
    from delivery_rows
  )
  select jsonb_build_object(
    'status', campaign.status,
    'sentAt', campaign.sent_at,
    'lastError', campaign.last_error,
    'targeted', case when campaign.status in ('completed','sending') then counts.delivered else campaign.estimated_audience end,
    'queued', case when campaign.status in ('approved','scheduled') then campaign.estimated_audience else 0 end,
    'delivered', counts.delivered,
    'failed', case when campaign.status = 'failed' then greatest(campaign.estimated_audience, 1) else 0 end,
    'viewed', counts.viewed,
    'presented', case when in_app_presented then counts.presented else null end,
    'clicked', counts.clicked,
    'ctaClicks', counts.cta_clicked,
    'dismissed', counts.dismissed,
    'inboxRead', counts.inbox_read,
    'pending', counts.pending,
    'pushSent', case when 'push' = any(campaign.channels) then counts.push_sent else null end,
    'pushFailures', case when 'push' = any(campaign.channels) then counts.push_failures else null end,
    'viewRate', case when counts.delivered > 0 then round(counts.viewed::numeric * 100 / counts.delivered, 1) else null end,
    'clickRate', case when counts.viewed > 0 then round(counts.clicked::numeric * 100 / counts.viewed, 1) else null end,
    'dismissRate', case when counts.viewed > 0 then round(counts.dismissed::numeric * 100 / counts.viewed, 1) else null end,
    'readRate', case when counts.delivered > 0 then round(counts.inbox_read::numeric * 100 / counts.delivered, 1) else null end,
    -- Legacy keys kept for older admin builds.
    'created', counts.delivered,
    'displayed', counts.viewed,
    'read', counts.inbox_read,
    'actioned', counts.cta_clicked
  ) into result
  from counts;
  return result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Delivery receipts and retention
-- ---------------------------------------------------------------------------

-- Accounts may record their own presentation, click, snooze, read and dismiss
-- receipts; message content, targeting and accounting stay immutable.
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
    if new.last_presented_at is distinct from old.last_presented_at and new.last_presented_at is not null then new.last_presented_at := now(); end if;
    new.presentation_count := greatest(coalesce(old.presentation_count, 0), least(coalesce(old.presentation_count, 0) + 1, coalesce(new.presentation_count, 0)));
    if new.snoozed_until is not null and new.snoozed_until > now() + interval '7 days' then new.snoozed_until := old.snoozed_until; end if;
    if old.actioned_at is not null then new.actioned_at := old.actioned_at; elsif new.actioned_at is not null then new.actioned_at := now(); end if;
    if old.clicked_at is not null then new.clicked_at := old.clicked_at; elsif new.clicked_at is not null then new.clicked_at := now(); end if;
    if old.cta_clicked_at is not null then new.cta_clicked_at := old.cta_clicked_at; elsif new.cta_clicked_at is not null then new.cta_clicked_at := now(); end if;
    if old.dismissed_at is not null then new.dismissed_at := old.dismissed_at; elsif new.dismissed_at is not null then new.dismissed_at := now(); end if;
    if old.read_at is not null then new.read_at := old.read_at; elsif new.read_at is not null or new.status = 'read' then new.read_at := now(); end if;
  end if;
  return new;
end;
$$;

-- Campaign delivery rows are the analytics record, so they are kept for a
-- year even after the campaign expires (expired rows are hidden by every
-- KunThai screen). Other notifications keep their previous retention.
create or replace function public.cleanup_expired_user_notifications()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  removed integer := 0;
  affected integer := 0;
begin
  if to_regclass('public.explore_notifications') is not null then
    delete from public.explore_notifications where created_at < now() - interval '30 days';
    get diagnostics affected = row_count;
    removed := removed + affected;
  end if;

  delete from public.platform_notifications
  where (
      campaign_id is not null
      and created_at < now() - interval '365 days'
    )
    or (
      campaign_id is null
      and (
        (expires_at is not null and expires_at < now())
        or (
          expires_at is null
          and created_at < now() - case
            when category in ('payment','account','safety','security') then interval '365 days'
            else interval '90 days'
          end
        )
      )
    );
  get diagnostics affected = row_count;
  return removed + affected;
end;
$$;

-- ---------------------------------------------------------------------------
-- Reliable scheduling
-- ---------------------------------------------------------------------------

-- pg_cron runs inside the database, so scheduled campaigns never depend on an
-- admin's browser or on the once-a-day Vercel cron (which stays as a backup
-- and still triggers device push). Skipped quietly where pg_cron is missing.
do $$
begin
  begin
    create extension if not exists pg_cron;
  exception when others then
    raise notice 'pg_cron is not available (%); scheduled campaigns rely on /api/admin-publish-scheduled', sqlerrm;
  end;

  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    begin
      perform cron.unschedule(job.jobid) from cron.job job where job.jobname = 'kunthai-publish-due-campaigns';
      perform cron.schedule('kunthai-publish-due-campaigns', '* * * * *', 'select public.admin_publish_due_campaigns()');
    exception when others then
      raise notice 'Could not schedule kunthai-publish-due-campaigns (%)', sqlerrm;
    end;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke all on function public.admin_notification_user_matches_segment(uuid,text) from public, anon, authenticated;
revoke all on function public.admin_notification_user_matches_target(uuid,text) from public, anon, authenticated;
revoke all on function public.admin_notification_user_matches_location(uuid,jsonb) from public, anon, authenticated;
revoke all on function public.admin_campaign_recipient_ids(text,text,jsonb) from public, anon, authenticated;
revoke all on function public.admin_validate_campaign_spec(text,text,text,jsonb,text,text,text,jsonb,jsonb) from public, anon, authenticated;
revoke all on function public.admin_publish_campaign_rows(uuid) from public, anon, authenticated;
revoke all on function public.admin_publish_due_campaigns() from public, anon, authenticated;
revoke all on function public.admin_lookup_campaign_user(text) from public, anon;
revoke all on function public.admin_campaign_location_options() from public, anon;
revoke all on function public.admin_estimate_campaign_audience(text,text,jsonb) from public, anon;
revoke all on function public.admin_create_campaign(text,text,text,text,text,jsonb,timestamptz,text[],text,text,text,jsonb,timestamptz,text,jsonb) from public, anon;
revoke all on function public.admin_update_campaign(uuid,text,text,text,text,text,jsonb,timestamptz,text[],text,text,text,jsonb,timestamptz,text,jsonb) from public, anon;
revoke all on function public.admin_approve_campaign(uuid) from public, anon;
revoke all on function public.admin_publish_campaign(uuid,integer,boolean) from public, anon;
revoke all on function public.admin_run_due_campaigns() from public, anon;
revoke all on function public.admin_end_campaign(uuid,text) from public, anon;
revoke all on function public.admin_cancel_campaign(uuid,text) from public, anon;
revoke all on function public.admin_send_campaign_test(uuid,uuid) from public, anon;
revoke all on function public.admin_check_campaign_test_recipient(uuid,uuid) from public, anon;
revoke all on function public.admin_get_campaign_metrics(uuid) from public, anon;

grant execute on function public.admin_lookup_campaign_user(text) to authenticated;
grant execute on function public.admin_campaign_location_options() to authenticated;
grant execute on function public.admin_estimate_campaign_audience(text,text,jsonb) to authenticated;
grant execute on function public.admin_create_campaign(text,text,text,text,text,jsonb,timestamptz,text[],text,text,text,jsonb,timestamptz,text,jsonb) to authenticated;
grant execute on function public.admin_update_campaign(uuid,text,text,text,text,text,jsonb,timestamptz,text[],text,text,text,jsonb,timestamptz,text,jsonb) to authenticated;
grant execute on function public.admin_approve_campaign(uuid) to authenticated;
grant execute on function public.admin_publish_campaign(uuid,integer,boolean) to authenticated;
grant execute on function public.admin_run_due_campaigns() to authenticated;
grant execute on function public.admin_end_campaign(uuid,text) to authenticated;
grant execute on function public.admin_cancel_campaign(uuid,text) to authenticated;
grant execute on function public.admin_send_campaign_test(uuid,uuid) to authenticated;
grant execute on function public.admin_check_campaign_test_recipient(uuid,uuid) to authenticated;
grant execute on function public.admin_get_campaign_metrics(uuid) to authenticated;

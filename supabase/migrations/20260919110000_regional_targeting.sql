-- ============================================================================
-- Regional targeting: states / districts for Explore adverts, UrMall
-- promotions and admin notification campaigns, plus live admin user search.
--
-- Requires 20260919100000_kunthai_country_regions.sql (regions, account
-- regions and the kunthai_* region helpers).
--
-- REUSABLE: every statement is idempotent (add column if not exists, create or
-- replace). Existing functions are wrapped rather than rewritten where
-- possible, so earlier behaviour (credit spending, moderation, idempotent
-- boosts) is unchanged.
--
-- The rule everywhere: when a campaign names states/districts, only accounts
-- located inside one of them receive it. A person's location is
-- kunthai_account_regions (profile choice, else matched from their city).
-- Picking a province/state also covers every district inside it.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Explore adverts
-- ----------------------------------------------------------------------------
alter table public.explore_ad_campaigns
  add column if not exists target_region_ids uuid[] not null default '{}';
create index if not exists explore_ad_campaigns_target_regions_idx
  on public.explore_ad_campaigns using gin (target_region_ids);

comment on column public.explore_ad_campaigns.target_region_ids is
  'States/districts (kunthai_country_regions) this advert is limited to. Empty = no regional limit.';

-- Same arguments as create_explore_ad_campaign plus the regions. Runs the
-- original (credits, moderation, caps) and then stores the regions in the same
-- transaction, so a regional advert is never briefly delivered everywhere.
create or replace function public.create_explore_ad_campaign_in_regions(
  p_post_id uuid,
  p_placement text default 'urfeed',
  p_objective text default 'brand_awareness',
  p_audience_type text default 'recommended',
  p_minimum_age integer default 13,
  p_maximum_age integer default null,
  p_gender_target text default 'all',
  p_interest_categories text[] default '{}',
  p_target_area text default null,
  p_duration_days integer default 14,
  p_starts_at timestamptz default null,
  p_ends_at timestamptz default null,
  p_budget_type text default 'total',
  p_budget_amount numeric default 0,
  p_currency text default null,
  p_credit_budget integer default null,
  p_target_region_ids uuid[] default '{}'
)
returns public.explore_ad_campaigns
language plpgsql
security definer
set search_path = public
as $$
declare
  v_regions uuid[] := public.kunthai_clean_region_ids(p_target_region_ids, 30);
  v_campaign public.explore_ad_campaigns;
begin
  if coalesce(cardinality(p_target_region_ids), 0) > 0 and cardinality(v_regions) = 0 then
    raise exception 'Choose at least one valid state or district.';
  end if;
  if coalesce(cardinality(p_target_region_ids), 0) > 30 then
    raise exception 'Choose at most 30 states or districts.';
  end if;

  v_campaign := public.create_explore_ad_campaign(
    p_post_id => p_post_id,
    p_placement => p_placement,
    p_objective => p_objective,
    p_audience_type => p_audience_type,
    p_minimum_age => p_minimum_age,
    p_maximum_age => p_maximum_age,
    p_gender_target => p_gender_target,
    p_interest_categories => p_interest_categories,
    p_target_area => p_target_area,
    p_duration_days => p_duration_days,
    p_starts_at => p_starts_at,
    p_ends_at => p_ends_at,
    p_budget_type => p_budget_type,
    p_budget_amount => p_budget_amount,
    p_currency => p_currency,
    p_credit_budget => p_credit_budget
  );

  update public.explore_ad_campaigns
  set target_region_ids = v_regions
  where id = v_campaign.id
  returning * into v_campaign;

  return v_campaign;
end;
$$;

revoke all on function public.create_explore_ad_campaign_in_regions(uuid,text,text,text,integer,integer,text,text[],text,integer,timestamptz,timestamptz,text,numeric,text,integer,uuid[]) from public, anon;
grant execute on function public.create_explore_ad_campaign_in_regions(uuid,text,text,text,integer,integer,text,text[],text,integer,timestamptz,timestamptz,text,numeric,text,integer,uuid[]) to authenticated;

-- Delivery: identical ranking to before; regional adverts only reach viewers
-- located in one of the chosen states/districts.
CREATE OR REPLACE FUNCTION public.get_recommended_explore_ads(p_user_id uuid, p_surface text DEFAULT 'urfeed'::text, p_limit integer DEFAULT 6)
 RETURNS TABLE(campaign_id uuid, post_id uuid, score double precision, reason text, campaign jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with viewer as (
    select
      users.id,
      case
        when coalesce(
          nullif(users.raw_user_meta_data->>'date_of_birth', ''),
          nullif(users.raw_user_meta_data->>'birth_date', ''),
          ''
        )
          ~ '^\d{4}-\d{2}-\d{2}$'
        then extract(year from age(
          current_date,
          to_date(coalesce(
            nullif(users.raw_user_meta_data->>'date_of_birth', ''),
            nullif(users.raw_user_meta_data->>'birth_date', '')
          ), 'YYYY-MM-DD')
        ))::integer
        else null
      end as viewer_age,
      lower(coalesce(users.raw_user_meta_data->>'gender', '')) as viewer_gender
    from auth.users users
    where users.id = p_user_id and auth.uid() = p_user_id
  ),
  candidates as (
    select
      ad.*,
      post.likes_count,
      post.comments_count,
      post.saves_count,
      coalesce(personal.impressions, 0) as prior_impressions,
      coalesce(personal.watch_time_seconds, 0) as watch_seconds,
      coalesce(personal.max_completion_rate, 0) as completion_rate,
      coalesce(personal.skips, 0) as skips,
      coalesce(personal.hides, 0) as hides,
      coalesce(personal.reports, 0) as reports,
      coalesce(creator.interaction_score, 0) as creator_score,
      coalesce(topic_match.topic_score, 0) as topic_score,
      coalesce(topic_match.match_count, 0) as topic_matches,
      exists (
        select 1 from public.explore_follows follow
        where follow.follower_id = p_user_id and follow.following_id = ad.advertiser_id
      ) as follows_advertiser,
      frequency.today_count,
      frequency.total_count
    from public.explore_ad_campaigns ad
    join public.explore_posts post on post.id = ad.creative_post_id
    cross join viewer
    left join public.explore_content_signals personal
      on personal.user_id = p_user_id and personal.post_id = ad.creative_post_id
    left join public.explore_creator_interactions creator
      on creator.user_id = p_user_id and creator.creator_id = ad.advertiser_id
    left join lateral (
      select
        count(*)::integer as match_count,
        coalesce(sum(greatest(interest.interest_score, 0)), 0)::double precision as topic_score
      from public.explore_topic_interests interest
      where interest.user_id = p_user_id
        and lower(interest.topic) = any(coalesce(ad.interest_categories, '{}'::text[]))
    ) topic_match on true
    left join lateral (
      select
        count(*) filter (where event.created_at >= date_trunc('day', timezone('utc', now())))::integer as today_count,
        count(*)::integer as total_count
      from public.explore_ad_events event
      where event.user_id = p_user_id
        and event.campaign_id = ad.id
        and event.event_type = 'impression'
    ) frequency on true
    where ad.status = 'active'
      and ad.moderation_status = 'approved'
      and ad.starts_at <= timezone('utc', now())
      and ad.ends_at > timezone('utc', now())
      and ad.advertiser_id <> p_user_id
      and coalesce(post.post_privacy, 'public') = 'public'
      and post.post_type = 'advert'
      and post.category = 'advert'
      and post.moderation_status in ('not_required', 'approved', 'legacy')
      and (
        (lower(p_surface) = 'urfeed' and ad.placement in ('urfeed', 'both')
          and (nullif(btrim(coalesce(post.video_url, '')), '') is null or nullif(btrim(coalesce(post.image_url, '')), '') is not null))
        or
        (lower(p_surface) = 'swip' and ad.placement in ('swip', 'both')
          and nullif(btrim(coalesce(post.video_url, '')), '') is not null)
      )
      and not exists (
        select 1 from public.explore_user_blocks block
        where (block.blocker_id = p_user_id and block.blocked_id = ad.advertiser_id)
           or (block.blocker_id = ad.advertiser_id and block.blocked_id = p_user_id)
      )
      and not exists (
        select 1 from public.explore_post_reports report
        where report.post_id = post.id and report.status in ('open', 'reviewed')
      )
      and not exists (
        select 1 from public.explore_ad_user_controls control
        where control.user_id = p_user_id
          and (
            control.campaign_id = ad.id
            or (control.advertiser_id = ad.advertiser_id and control.action = 'mute_advertiser')
          )
      )
      and (
        ad.minimum_age <= 13
        or (viewer.viewer_age is not null and viewer.viewer_age >= ad.minimum_age)
      )
      and (
        ad.maximum_age is null
        or (viewer.viewer_age is not null and viewer.viewer_age <= ad.maximum_age)
      )
      and (
        ad.gender_target = 'all'
        or (viewer.viewer_gender <> '' and viewer.viewer_gender = ad.gender_target)
      )
      and (
        ad.audience_type in ('everyone', 'recommended')
        or (ad.audience_type = 'followers' and exists (
          select 1 from public.explore_follows f where f.follower_id = p_user_id and f.following_id = ad.advertiser_id
        ))
        or (ad.audience_type = 'followers_similar' and (
          exists (select 1 from public.explore_follows f where f.follower_id = p_user_id and f.following_id = ad.advertiser_id)
          or coalesce(creator.interaction_score, 0) > 0
          or coalesce(topic_match.match_count, 0) > 0
        ))
        or (ad.audience_type = 'nearby' and nullif(btrim(coalesce(ad.target_area, '')), '') is not null and exists (
          select 1 from public.explore_recommendation_privacy location
          where location.user_id = p_user_id
            and location.location_personalization_enabled = true
            and (
              (nullif(btrim(coalesce(location.coarse_city, '')), '') is not null and (
                lower(location.coarse_city) = lower(ad.target_area)
                or lower(ad.target_area) like '%' || lower(btrim(location.coarse_city)) || '%'
                or lower(btrim(location.coarse_city)) like '%' || lower(ad.target_area) || '%'
              ))
              or (nullif(btrim(coalesce(location.coarse_area, '')), '') is not null and (
                lower(location.coarse_area) = lower(ad.target_area)
                or lower(ad.target_area) like '%' || lower(btrim(location.coarse_area)) || '%'
                or lower(btrim(location.coarse_area)) like '%' || lower(ad.target_area) || '%'
              ))
            )
        ))
      )
      -- Regional adverts: only viewers located in a chosen state/district.
      and (
        coalesce(cardinality(ad.target_region_ids), 0) = 0
        or public.kunthai_account_in_regions(p_user_id, ad.target_region_ids)
      )
      and frequency.today_count < ad.daily_impression_cap
      and frequency.total_count < ad.total_impression_cap
      and frequency.total_count <= ceil(
        ad.total_impression_cap * least(
          1,
          greatest(
            0.15,
            extract(epoch from (timezone('utc', now()) - ad.starts_at))
              / greatest(extract(epoch from (ad.ends_at - ad.starts_at)), 1)
              + 0.15
          )
        )
      )
  ),
  scored as (
    select candidate.*,
      (
        35
        + least(24, candidate.topic_score * 0.8)
        + least(18, greatest(-18, candidate.creator_score * 0.22))
        + case when candidate.follows_advertiser then 12 else 0 end
        + case when candidate.audience_type = 'recommended' then 5 else 0 end
        + case when candidate.prior_impressions = 0 then 12 else 0 end
        + least(12, candidate.completion_rate * 12)
        + least(8, candidate.watch_seconds * 0.35)
        + ln(1 + greatest(candidate.likes_count, 0)) * 1.2
        + ln(1 + greatest(candidate.comments_count, 0)) * 1.6
        + ln(1 + greatest(candidate.saves_count, 0)) * 2.0
        -- Visibility Credit boost: bigger budgets rank higher (diminishing
        -- returns, capped at +60) so paid reach is real but never fully buries a
        -- smaller, highly relevant advert or overrides the safety penalties.
        + least(60, 12 * ln(1 + greatest(coalesce(candidate.credit_budget, 0), 0) / 5.0))
        -- Objective bias: video-view campaigns favour proven watchers; profile
        -- visit / connection campaigns favour people not yet connected.
        + case when candidate.objective = 'video_views'
               then least(16, candidate.completion_rate * 10 + candidate.watch_seconds * 0.4)
               else 0 end
        + case when candidate.objective in ('profile_visits', 'followers') and not candidate.follows_advertiser
               then 10 else 0 end
        - least(candidate.skips, 3) * 12
        - least(candidate.hides + candidate.reports, 1) * 80
        - candidate.today_count * 14
        - candidate.total_count * 1.5
      )::double precision as delivery_score
    from candidates candidate
  )
  select
    ranked.id,
    ranked.creative_post_id,
    ranked.delivery_score,
    case
      when ranked.follows_advertiser then 'You follow this advertiser'
      when ranked.topic_matches > 0 then 'Matched to topics you engage with'
      when coalesce(cardinality(ranked.target_region_ids), 0) > 0 then 'Promoted to people in your area'
      when ranked.audience_type = 'nearby' then 'Relevant to an area you chose to personalize'
      when ranked.audience_type = 'recommended' then 'Recommended from your Explore activity'
      else 'Promoted across KunThai Explore'
    end,
    jsonb_build_object(
      'id', ranked.id,
      'placement', ranked.placement,
      'objective', ranked.objective,
      'audienceType', ranked.audience_type,
      'regional', coalesce(cardinality(ranked.target_region_ids), 0) > 0,
      'interests', ranked.interest_categories,
      'startsAt', ranked.starts_at,
      'endsAt', ranked.ends_at,
      'reason', case
        when ranked.follows_advertiser then 'You follow this advertiser'
        when ranked.topic_matches > 0 then 'Matched to topics you engage with'
        when coalesce(cardinality(ranked.target_region_ids), 0) > 0 then 'Promoted to people in your area'
        when ranked.audience_type = 'nearby' then 'Relevant to an area you chose to personalize'
        when ranked.audience_type = 'recommended' then 'Recommended from your Explore activity'
        else 'Promoted across KunThai Explore'
      end
    )
  from scored ranked
  order by ranked.delivery_score desc, ranked.last_delivery_at nulls first, ranked.created_at desc
  limit greatest(1, least(coalesce(p_limit, 6), 12));
$function$;

grant execute on function public.get_recommended_explore_ads(uuid, text, integer) to authenticated;

-- ----------------------------------------------------------------------------
-- 2. UrMall promotions (products, meals, properties)
-- ----------------------------------------------------------------------------
alter table public.marketplace_promotions
  add column if not exists target_region_ids uuid[] not null default '{}';
create index if not exists marketplace_promotions_target_regions_idx
  on public.marketplace_promotions using gin (target_region_ids);

comment on column public.marketplace_promotions.target_region_ids is
  'States/districts this boost is shown in. Empty = the whole country.';

create or replace function public.kunthai_promotion_region_metadata(p_regions uuid[])
returns jsonb
language sql
stable
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', region.id, 'name', region.display_name, 'type', region.type_label) order by position), '[]'::jsonb)
  from unnest(coalesce(p_regions, '{}')) with ordinality as chosen(region_id, position)
  join public.kunthai_country_regions region on region.id = chosen.region_id;
$$;

create or replace function public.create_marketplace_visibility_promotion_in_regions(
  p_product_id uuid,
  p_credit_budget integer default 5,
  p_audience_type text default 'countrywide',
  p_target_region_ids uuid[] default '{}'
)
returns public.marketplace_promotions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_regions uuid[] := public.kunthai_clean_region_ids(p_target_region_ids, 30);
  v_promotion public.marketplace_promotions;
begin
  if coalesce(cardinality(p_target_region_ids), 0) > 0 and cardinality(v_regions) = 0 then
    raise exception 'Choose at least one valid state or district.';
  end if;
  if coalesce(cardinality(p_target_region_ids), 0) > 30 then
    raise exception 'Choose at most 30 states or districts.';
  end if;

  v_promotion := public.create_marketplace_visibility_promotion(p_product_id, p_credit_budget, p_audience_type);

  update public.marketplace_promotions
  set target_region_ids = v_regions,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'audienceType', case when cardinality(v_regions) > 0 then 'regions' else lower(coalesce(nullif(btrim(p_audience_type), ''), 'countrywide')) end,
        'targetRegions', public.kunthai_promotion_region_metadata(v_regions)
      ),
      updated_at = timezone('utc', now())
  where id = v_promotion.id
  returning * into v_promotion;

  return v_promotion;
end;
$$;

create or replace function public.create_marketplace_listing_promotion_in_regions(
  p_listing_type text,
  p_listing_id uuid,
  p_credit_budget integer default 5,
  p_audience_type text default 'countrywide',
  p_target_region_ids uuid[] default '{}'
)
returns public.marketplace_promotions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_regions uuid[] := public.kunthai_clean_region_ids(p_target_region_ids, 30);
  v_promotion public.marketplace_promotions;
begin
  if coalesce(cardinality(p_target_region_ids), 0) > 0 and cardinality(v_regions) = 0 then
    raise exception 'Choose at least one valid state or district.';
  end if;
  if coalesce(cardinality(p_target_region_ids), 0) > 30 then
    raise exception 'Choose at most 30 states or districts.';
  end if;

  v_promotion := public.create_marketplace_listing_promotion(p_listing_type, p_listing_id, p_credit_budget, p_audience_type);

  update public.marketplace_promotions
  set target_region_ids = v_regions,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'audienceType', case when cardinality(v_regions) > 0 then 'regions' else lower(coalesce(nullif(btrim(p_audience_type), ''), 'countrywide')) end,
        'targetRegions', public.kunthai_promotion_region_metadata(v_regions)
      ),
      updated_at = timezone('utc', now())
  where id = v_promotion.id
  returning * into v_promotion;

  return v_promotion;
end;
$$;

revoke all on function public.create_marketplace_visibility_promotion_in_regions(uuid, integer, text, uuid[]) from public, anon;
revoke all on function public.create_marketplace_listing_promotion_in_regions(text, uuid, integer, text, uuid[]) from public, anon;
grant execute on function public.create_marketplace_visibility_promotion_in_regions(uuid, integer, text, uuid[]) to authenticated;
grant execute on function public.create_marketplace_listing_promotion_in_regions(text, uuid, integer, text, uuid[]) to authenticated;
grant execute on function public.kunthai_promotion_region_metadata(uuid[]) to authenticated;

-- ----------------------------------------------------------------------------
-- 3. Admin notification campaigns
-- ----------------------------------------------------------------------------
-- A location entry is {country, countryName, entireCountry, cities[], regionIds[], regions[]}.
-- A person matches when (a) their account region or the region of a business
-- (or business branch) they run lies inside a chosen state/district, or
-- (b) the country matches and the entry is the entire country or one of its cities.
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
      lower(btrim(coalesce(users.raw_user_meta_data->>'city', ''))) as city,
      coalesce((select account.region_path from public.kunthai_account_regions account where account.user_id = users.id), '{}'::uuid[]) as region_path
    from auth.users users
    where users.id = input_user_id
    union all
    select
      lower(btrim(coalesce(business.country_iso, ''))),
      lower(btrim(coalesce(business.country, ''))),
      lower(btrim(coalesce(business.city, ''))),
      coalesce((
        select region.path_ids from public.kunthai_country_regions region
        where region.id = public.kunthai_resolve_region(
          coalesce(nullif(business.country_iso, ''), business.country),
          concat_ws(', ', nullif(btrim(business.city), ''), nullif(btrim(business.address), ''))
        )
      ), '{}'::uuid[])
    from public.marketplace_businesses business
    where business.user_id = input_user_id
      or exists (
        select 1 from public.marketplace_business_admins administrator
        where administrator.business_id = business.id and administrator.user_id = input_user_id and administrator.status = 'accepted'
      )
    union all
    select
      lower(btrim(coalesce(business.country_iso, ''))),
      lower(btrim(coalesce(branch.country, business.country, ''))),
      lower(btrim(coalesce(branch.city, ''))),
      coalesce((
        select region.path_ids from public.kunthai_country_regions region
        where region.id = public.kunthai_resolve_region(
          coalesce(nullif(business.country_iso, ''), branch.country, business.country),
          concat_ws(', ', nullif(btrim(branch.city), ''), nullif(btrim(branch.address), ''))
        )
      ), '{}'::uuid[])
    from public.marketplace_business_locations branch
    join public.marketplace_businesses business on business.id = branch.business_id
    where business.user_id = input_user_id
      or exists (
        select 1 from public.marketplace_business_admins administrator
        where administrator.business_id = business.id and administrator.user_id = input_user_id and administrator.status = 'accepted'
      )
  ),
  wanted as (
    select
      selected,
      array(
        select value::uuid
        from jsonb_array_elements_text(coalesce(selected->'regionIds', '[]'::jsonb)) value
        where value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      ) as region_ids
    from jsonb_array_elements(coalesce(locations, '[]'::jsonb)) selected
  )
  select coalesce(jsonb_array_length(locations), 0) = 0 or exists (
    select 1
    from places place
    cross join wanted
    where (
        cardinality(wanted.region_ids) > 0
        and place.region_path && wanted.region_ids
      )
      or (
        (
          (place.iso <> '' and place.iso = lower(btrim(coalesce(wanted.selected->>'country', ''))))
          or (place.country <> '' and place.country in (
            lower(btrim(coalesce(wanted.selected->>'countryName', ''))),
            lower(btrim(coalesce(wanted.selected->>'country', '')))
          ))
        )
        and (
          coalesce((wanted.selected->>'entireCountry')::boolean, false)
          or (place.city <> '' and place.city in (
            select lower(btrim(city_name)) from jsonb_array_elements_text(coalesce(wanted.selected->'cities', '[]'::jsonb)) city_name
          ))
        )
      )
  );
$$;

revoke all on function public.admin_notification_user_matches_location(uuid, jsonb) from public, anon, authenticated;

-- Same as 20260917120000 except the location rule: an entry may now name
-- states/districts (regionIds) instead of cities.
CREATE OR REPLACE FUNCTION public.admin_validate_campaign_spec(campaign_sector text, campaign_audience text, campaign_priority text, campaign_filter jsonb, campaign_presentation text, campaign_category text, campaign_action_target text, campaign_action_data jsonb, campaign_configuration jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
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
      and coalesce(jsonb_array_length(selected->'regionIds'), 0) = 0
  ) then raise exception 'Choose at least one state, district or city for each country, or the entire country'; end if;
  -- Every chosen state/district must be a real, active region (at most 50 per country).
  if exists (
    select 1 from jsonb_array_elements(coalesce(campaign_filter->'locations', '[]'::jsonb)) selected
    where coalesce(jsonb_array_length(selected->'regionIds'), 0) > 50
       or exists (
         select 1 from jsonb_array_elements_text(coalesce(selected->'regionIds', '[]'::jsonb)) chosen
         where chosen !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            or not exists (select 1 from public.kunthai_country_regions region where region.id = chosen::uuid and region.is_active)
       )
  ) then raise exception 'One of the chosen states or districts is not valid'; end if;
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
$function$;

-- How many KunThai accounts are located in each state/district of a country
-- (a district's accounts also count towards its province). Aggregates only.
create or replace function public.admin_campaign_region_counts(p_country text)
returns table(region_id uuid, accounts integer)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if not (public.admin_has_permission('notifications.manage') or public.admin_has_permission('notifications.view')) then
    raise exception 'Not authorized';
  end if;

  return query
  select region.id, count(distinct account.user_id)::integer
  from public.kunthai_country_regions region
  join public.kunthai_account_regions account on account.region_path @> array[region.id]
  where region.country_iso = public.kunthai_normalize_country_iso(p_country)
    and region.is_active
  group by region.id;
end;
$$;

-- Live admin search for campaign recipients by KunThai ID (any part of it) or
-- name / username. Email addresses and phone numbers are never searched or
-- returned.
create or replace function public.admin_search_campaign_users(search_text text, result_limit integer default 12)
returns table(
  user_id uuid,
  public_id text,
  display_name text,
  username text,
  avatar_url text,
  country text,
  city text,
  region_name text
)
language plpgsql
security definer
stable
set search_path = public, auth
as $$
declare
  raw_query text := btrim(coalesce(search_text, ''));
  id_query text := upper(regexp_replace(coalesce(search_text, ''), '[^A-Za-z0-9]', '', 'g'));
  name_query text := lower(regexp_replace(btrim(coalesce(search_text, '')), '^@', ''));
  escaped_name text;
  like_name text;
  prefix_name text;
  -- An ID-style query starts with KTU or contains a digit; it matches any part of
  -- the ID from the first character ("KTU" alone lists accounts by name).
  id_mode boolean := btrim(coalesce(search_text, '')) ~* '^ktu' or coalesce(search_text, '') ~ '[0-9]';
  safe_limit integer := greatest(1, least(coalesce(result_limit, 12), 25));
begin
  if not (public.admin_has_permission('notifications.manage') or public.admin_has_permission('notifications.test')) then
    raise exception 'Not authorized';
  end if;
  if char_length(raw_query) < 2 then return; end if;

  escaped_name := replace(replace(replace(name_query, '\', '\\'), '%', '\%'), '_', '\_');
  like_name := '%' || escaped_name || '%';
  prefix_name := escaped_name || '%';
  -- "KTU-1234" and "1234" both search the ID digits.
  if left(id_query, 3) = 'KTU' then id_query := substr(id_query, 4); end if;

  return query
  with candidates as (
    select
      users.id,
      identity.public_user_id,
      coalesce(nullif(profile.display_name, ''), nullif(users.raw_user_meta_data->>'display_name', ''),
        nullif(users.raw_user_meta_data->>'full_name', ''), 'KunThai account') as shown_name,
      coalesce(nullif(profile.username, ''), nullif(users.raw_user_meta_data->>'username', ''), '') as handle,
      coalesce(nullif(profile.avatar_url, ''), nullif(users.raw_user_meta_data->>'avatar_url', ''), '') as avatar,
      coalesce(nullif(users.raw_user_meta_data->>'country', ''), nullif(users.raw_user_meta_data->>'country_name', ''), '') as country_name,
      coalesce(nullif(users.raw_user_meta_data->>'city', ''), '') as city_name,
      upper(regexp_replace(coalesce(identity.public_user_id, ''), '[^A-Za-z0-9]', '', 'g')) as id_key,
      lower(concat_ws(' ',
        profile.display_name,
        users.raw_user_meta_data->>'display_name',
        users.raw_user_meta_data->>'full_name',
        users.raw_user_meta_data->>'first_name',
        users.raw_user_meta_data->>'last_name',
        concat_ws(' ', users.raw_user_meta_data->>'first_name', users.raw_user_meta_data->>'last_name'),
        profile.username,
        users.raw_user_meta_data->>'username'
      )) as name_blob
    from auth.users users
    left join public.kunthai_account_identities identity on identity.user_id = users.id
    left join public.explore_profiles profile on profile.user_id = users.id
    where coalesce(users.is_anonymous, false) = false
  )
  select
    candidate.id,
    candidate.public_user_id,
    candidate.shown_name,
    candidate.handle,
    candidate.avatar,
    candidate.country_name,
    candidate.city_name,
    coalesce(region.display_name, '')
  from candidates candidate
  left join public.kunthai_account_regions account on account.user_id = candidate.id
  left join public.kunthai_country_regions region on region.id = account.region_id
  where (id_mode and candidate.id_key <> '' and position(id_query in substr(candidate.id_key, 4)) > 0)
     or candidate.name_blob like like_name escape '\'
  order by
    case
      when id_query <> '' and candidate.id_key = 'KTU' || id_query then 0
      when id_mode and id_query <> '' and substr(candidate.id_key, 4) like id_query || '%' then 1
      when lower(candidate.shown_name) = name_query or lower(candidate.handle) = name_query then 2
      when lower(candidate.shown_name) like prefix_name escape '\' or lower(candidate.handle) like prefix_name escape '\' then 3
      else 4
    end,
    lower(candidate.shown_name)
  limit safe_limit;
end;
$$;

revoke all on function public.admin_campaign_region_counts(text) from public, anon;
revoke all on function public.admin_search_campaign_users(text, integer) from public, anon;
grant execute on function public.admin_campaign_region_counts(text) to authenticated;
grant execute on function public.admin_search_campaign_users(text, integer) to authenticated;

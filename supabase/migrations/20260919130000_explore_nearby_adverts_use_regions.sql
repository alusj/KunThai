-- ============================================================================
-- Explore "Nearby Reach" adverts now use KunThai states / districts.
--
-- Before: nearby adverts matched a free-text target_area against
-- explore_recommendation_privacy.coarse_city/coarse_area, which nothing writes,
-- so they were never delivered while still spending Visibility Credits.
--
-- Now:
--   * A trigger resolves target_area ("Freetown", "Lagos State", "Kambia") to a
--     kunthai_country_regions row in the advertiser's country and stores it in
--     target_region_ids. An area that cannot be resolved is refused when the
--     campaign is created or its area changes, i.e. before any credits are spent.
--   * get_recommended_explore_ads delivers nearby adverts through those regions
--     (viewer's kunthai_account_regions path), exactly like regional adverts.
--   * Existing nearby campaigns are backfilled.
-- The composer no longer offers "Nearby Reach"; advertisers choose states or
-- districts directly. Old clients that still send nearby keep working.
--
-- REUSABLE: create or replace + idempotent backfill. Requires
-- 20260919100000_kunthai_country_regions.sql and 20260919110000_regional_targeting.sql.
-- ============================================================================

create or replace function public.explore_ad_nearby_region_ids(p_advertiser_id uuid, p_target_area text)
returns uuid[]
language sql
stable
security definer
set search_path = public, auth
as $$
  select coalesce(array_remove(array[public.kunthai_resolve_region(
    public.kunthai_resolve_country_iso(coalesce(
      nullif(users.raw_user_meta_data->>'country_code', ''),
      nullif(users.raw_user_meta_data->>'country', '')
    )),
    p_target_area
  )], null), '{}')
  from auth.users users
  where users.id = p_advertiser_id and nullif(btrim(coalesce(p_target_area, '')), '') is not null;
$$;

revoke all on function public.explore_ad_nearby_region_ids(uuid, text) from public, anon, authenticated;

create or replace function public.explore_ad_campaigns_resolve_nearby()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.audience_type <> 'nearby' then
    return new;
  end if;
  -- A re-boost with a new area text replaces the regions resolved from the old one.
  if tg_op = 'UPDATE'
     and new.target_area is distinct from old.target_area
     and new.target_region_ids is not distinct from old.target_region_ids then
    new.target_region_ids := '{}';
  end if;
  if coalesce(cardinality(new.target_region_ids), 0) > 0 then
    return new;
  end if;
  new.target_region_ids := coalesce(public.explore_ad_nearby_region_ids(new.advertiser_id, new.target_area), '{}');
  -- Refuse an area nobody can be matched to, but only when it is being chosen
  -- (new campaign or changed area), never when an old row is merely touched.
  if cardinality(new.target_region_ids) = 0
     and (tg_op = 'INSERT' or new.target_area is distinct from old.target_area) then
    raise exception 'Choose the nearby area as a state or district so the advert can reach people there.';
  end if;
  return new;
end;
$$;

drop trigger if exists explore_ad_campaigns_resolve_nearby on public.explore_ad_campaigns;
create trigger explore_ad_campaigns_resolve_nearby
  before insert or update of audience_type, target_area, target_region_ids on public.explore_ad_campaigns
  for each row execute function public.explore_ad_campaigns_resolve_nearby();

-- Backfill existing nearby campaigns (unresolvable old rows stay as they are).
update public.explore_ad_campaigns
set target_region_ids = public.explore_ad_nearby_region_ids(advertiser_id, target_area)
where audience_type = 'nearby'
  and coalesce(cardinality(target_region_ids), 0) = 0
  and coalesce(cardinality(public.explore_ad_nearby_region_ids(advertiser_id, target_area)), 0) > 0;

-- Delivery: identical to 20260919110000 except the nearby branch.
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
        -- Nearby adverts are delivered through their resolved states/districts; the
        -- regional filter below admits only viewers located inside them.
        or (ad.audience_type = 'nearby' and coalesce(cardinality(ad.target_region_ids), 0) > 0)
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

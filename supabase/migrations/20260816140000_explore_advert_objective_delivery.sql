-- Explore advertising: make the campaign OBJECTIVE change real delivery, and
-- make Nearby targeting resilient to loose area strings.
--
-- Supersedes get_recommended_explore_ads from
-- 20260816130000_explore_advert_credit_weighted_delivery.sql. It keeps the
-- credit-budget ranking term and adds:
--   * Objective bias -- "More Video Views" prioritizes viewers who actually
--     watch/complete videos; "More Profile Visits" and "More Connections"
--     prioritize people not already connected to the advertiser (the audience
--     that can still act on the objective). Other objectives keep neutral reach.
--   * Nearby robustness -- the coarse city/area no longer has to match the
--     advertiser's free-text target area exactly; a case-insensitive substring
--     match either way lets "Freetown" reach a viewer in "Freetown, Western
--     Area" (and vice versa), while empty coarse values never match-all.
create or replace function public.get_recommended_explore_ads(
  p_user_id uuid,
  p_surface text default 'urfeed',
  p_limit integer default 6
)
returns table (
  campaign_id uuid,
  post_id uuid,
  score double precision,
  reason text,
  campaign jsonb
)
language sql
stable
security definer
set search_path = public
as $$
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
      when ranked.audience_type = 'nearby' then 'Relevant to an area you chose to personalize'
      when ranked.audience_type = 'recommended' then 'Recommended from your Explore activity'
      else 'Promoted across KunThai Explore'
    end,
    jsonb_build_object(
      'id', ranked.id,
      'placement', ranked.placement,
      'objective', ranked.objective,
      'audienceType', ranked.audience_type,
      'interests', ranked.interest_categories,
      'startsAt', ranked.starts_at,
      'endsAt', ranked.ends_at,
      'reason', case
        when ranked.follows_advertiser then 'You follow this advertiser'
        when ranked.topic_matches > 0 then 'Matched to topics you engage with'
        when ranked.audience_type = 'nearby' then 'Relevant to an area you chose to personalize'
        when ranked.audience_type = 'recommended' then 'Recommended from your Explore activity'
        else 'Promoted across KunThai Explore'
      end
    )
  from scored ranked
  order by ranked.delivery_score desc, ranked.last_delivery_at nulls first, ranked.created_at desc
  limit greatest(1, least(coalesce(p_limit, 6), 12));
$$;

grant execute on function public.get_recommended_explore_ads(uuid, text, integer) to authenticated;

-- Explore advertising: make Visibility Credits actually buy reach.
--
-- Before this migration, credit_budget was stored and spent from the wallet but
-- had ZERO effect on delivery: get_recommended_explore_ads never referenced it,
-- and daily/total impression caps used fixed defaults (3/day, 30 total per
-- viewer). A 5-credit boost and a 500-credit boost reached the same people in
-- the same rank order. This change ties budget to BOTH levers the product
-- promises:
--   1. Higher ranking  -> a budget term is added to the delivery score, so a
--      bigger boost wins more feed slots across viewers (more distinct reach).
--   2. More impressions -> per-viewer frequency caps scale with budget, so a
--      bigger boost can recur more often for each eligible viewer.
-- The budget term uses a logarithmic curve (diminishing returns) and is capped,
-- so a large budget consistently out-delivers a small one without fully burying
-- a smaller, highly relevant advert, and never overrides the hide/report safety
-- penalties.

create or replace function public.create_explore_ad_campaign(
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
  p_credit_budget integer default null
)
returns public.explore_ad_campaigns
language plpgsql
security definer
set search_path = public
as $$
declare
  v_post public.explore_posts;
  v_start timestamptz := coalesce(p_starts_at, timezone('utc', now()));
  v_end timestamptz;
  v_campaign public.explore_ad_campaigns;
  v_post_safe boolean;
  v_advertiser_country text;
  v_currency text;
  v_credit_budget integer := greatest(0, coalesce(p_credit_budget, floor(greatest(0, coalesce(p_budget_amount, 0)))::integer, 0));
  v_previous_credit_budget integer := 0;
  v_credit_delta integer := 0;
  -- Per-viewer frequency caps scale with the boost. Both stay inside the table
  -- CHECK bounds (daily 1-20, total 1-500). At 5 credits these equal the old
  -- defaults (3/day, 30 total); larger budgets earn proportionally more.
  v_daily_cap integer := least(20, greatest(3, ceil(v_credit_budget / 20.0)::integer));
  v_total_cap integer := least(500, greatest(30, v_credit_budget * 2));
begin
  if auth.uid() is null then
    raise exception 'Sign in to boost adverts.';
  end if;

  if v_credit_budget < 5 then
    raise exception 'Choose at least 5 Visibility Credits for an advert boost.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('kunthai_visibility_boost:' || auth.uid()::text, 0));

  v_advertiser_country := public.kunthai_resolve_country_iso(
    coalesce(
      nullif(auth.jwt() -> 'user_metadata' ->> 'country_code', ''),
      nullif(auth.jwt() -> 'user_metadata' ->> 'country', ''),
      (
        select coalesce(
          nullif(auth_user.raw_user_meta_data ->> 'country_code', ''),
          nullif(auth_user.raw_user_meta_data ->> 'country', '')
        )
        from auth.users auth_user
        where auth_user.id = auth.uid()
      )
    )
  );

  if not public.kunthai_country_feature_enabled(v_advertiser_country, 'adverts') then
    raise exception 'Advertising is not yet available in your country.';
  end if;

  v_currency := public.kunthai_resolve_currency(v_advertiser_country, p_currency);

  select * into v_post from public.explore_posts where id = p_post_id;
  if v_post.id is null or v_post.user_id is distinct from auth.uid() then
    raise exception 'Advertisement creative was not found or is not owned by the current user';
  end if;

  if not (v_post.post_type = 'advert' or v_post.category = 'advert' or coalesce(v_post.media_meta, '{}'::jsonb) ? 'advert') then
    raise exception 'Only Explore advertisement creatives can create campaigns';
  end if;

  if p_placement in ('swip', 'both') and nullif(btrim(coalesce(v_post.video_url, '')), '') is null then
    raise exception 'Swip placement requires a reviewed video';
  end if;

  if p_placement in ('urfeed', 'both')
    and nullif(btrim(coalesce(v_post.video_url, '')), '') is not null
    and nullif(btrim(coalesce(v_post.image_url, '')), '') is null
  then
    raise exception 'UrFeed placement for a video advertisement requires an image';
  end if;

  select coalesce(credit_budget, 0) into v_previous_credit_budget
  from public.explore_ad_campaigns
  where creative_post_id = v_post.id and advertiser_id = auth.uid();

  v_end := coalesce(p_ends_at, v_start + make_interval(days => greatest(1, least(coalesce(p_duration_days, 14), 365))));
  v_post_safe := coalesce(v_post.moderation_status, 'not_required') in ('not_required', 'approved', 'legacy');

  insert into public.explore_ad_campaigns (
    creative_post_id, advertiser_id, placement, objective, audience_type,
    minimum_age, maximum_age, gender_target, interest_categories, target_area,
    duration_days, starts_at, ends_at, budget_type, budget_amount, currency,
    credit_budget, credits_spent, daily_impression_cap, total_impression_cap,
    status, moderation_status, updated_at
  ) values (
    v_post.id, auth.uid(), lower(coalesce(p_placement, 'urfeed')),
    lower(coalesce(p_objective, 'brand_awareness')),
    lower(coalesce(p_audience_type, 'recommended')),
    greatest(13, least(coalesce(p_minimum_age, 13), 120)),
    case when p_maximum_age is null then null else greatest(coalesce(p_minimum_age, 13), least(p_maximum_age, 120)) end,
    lower(coalesce(p_gender_target, 'all')),
    coalesce(p_interest_categories, '{}'::text[]), nullif(btrim(coalesce(p_target_area, '')), ''),
    greatest(1, least(coalesce(p_duration_days, 14), 365)), v_start, v_end,
    'total', v_credit_budget, v_currency,
    v_credit_budget, v_credit_budget, v_daily_cap, v_total_cap,
    case when v_post_safe then 'active' else 'pending_review' end,
    case when v_post_safe then 'approved' else 'pending' end,
    timezone('utc', now())
  )
  on conflict (creative_post_id) do update set
    placement = excluded.placement,
    objective = excluded.objective,
    audience_type = excluded.audience_type,
    minimum_age = excluded.minimum_age,
    maximum_age = excluded.maximum_age,
    gender_target = excluded.gender_target,
    interest_categories = excluded.interest_categories,
    target_area = excluded.target_area,
    duration_days = excluded.duration_days,
    starts_at = excluded.starts_at,
    ends_at = excluded.ends_at,
    budget_type = excluded.budget_type,
    budget_amount = excluded.budget_amount,
    currency = excluded.currency,
    credit_budget = excluded.credit_budget,
    credits_spent = excluded.credits_spent,
    daily_impression_cap = excluded.daily_impression_cap,
    total_impression_cap = excluded.total_impression_cap,
    status = excluded.status,
    moderation_status = excluded.moderation_status,
    updated_at = timezone('utc', now())
  returning * into v_campaign;

  v_credit_delta := greatest(0, v_credit_budget - coalesce(v_previous_credit_budget, 0));
  if v_credit_delta > 0 then
    perform public.spend_visibility_credits(
      v_credit_delta,
      'explore',
      'explore_ad_campaign',
      v_campaign.id,
      jsonb_build_object('postId', v_post.id, 'placement', lower(coalesce(p_placement, 'urfeed')))
    );
  end if;

  update public.explore_posts
  set post_privacy = 'public', post_type = 'advert', category = 'advert'
  where id = v_post.id;

  return v_campaign;
end;
$$;

grant execute on function public.create_explore_ad_campaign(uuid, text, text, text, integer, integer, text, text[], text, integer, timestamptz, timestamptz, text, numeric, text, integer) to authenticated;

-- Ranking: identical to explore_advertising_v1 with one added term in the
-- `scored` CTE -- a logarithmic budget boost so higher spend ranks higher.
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
        or (ad.audience_type = 'nearby' and exists (
          select 1 from public.explore_recommendation_privacy location
          where location.user_id = p_user_id
            and location.location_personalization_enabled = true
            and nullif(btrim(coalesce(ad.target_area, '')), '') is not null
            and (
              lower(location.coarse_city) = lower(ad.target_area)
              or lower(location.coarse_area) = lower(ad.target_area)
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

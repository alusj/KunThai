-- Explore recommendation hardening:
--   * strongly prefers followed and consented nearby creators
--   * keeps engagement/watch quality meaningful
--   * adds low-impression and creator-diversity boosts so new content rotates
--   * improves people suggestions without exposing private phone data

create or replace function public.get_recommended_feed_v2(
  p_user_id uuid,
  p_limit integer default 24,
  p_offset integer default 0
)
returns table (
  id uuid, user_id uuid, author_name text, author_username text, author_avatar_url text,
  feed_scope text, body text, image_url text, audio_url text, video_url text,
  video_trim_start numeric, video_trim_end numeric, post_type text, category text,
  moderation_status text, audio_duration_seconds integer, post_privacy text,
  hashtags text[], mentions text[], media_meta jsonb, likes_count integer,
  comments_count integer, saves_count integer, created_at timestamptz, score double precision
)
language sql
stable
security definer
set search_path = public
as $$
  with settings as (
    select greatest(1, least(coalesce(p_limit, 24), 50)) as page_limit,
           greatest(0, least(coalesce(p_offset, 0), 49)) as page_offset
    where auth.uid() = p_user_id
  ),
  pool as (
    select * from public.get_recommended_feed(p_user_id, 50, 0)
  ),
  signals as (
    select signal.post_id,
      sum(greatest(signal.views, 0))::double precision as views,
      sum(greatest(signal.impressions, 0))::double precision as impressions,
      sum(greatest(signal.likes, 0) + greatest(signal.comments, 0) + greatest(signal.saves, 0) + greatest(signal.shares, 0))::double precision as reactions
    from public.explore_content_signals signal
    where signal.post_id in (select pool.id from pool)
    group by signal.post_id
  ),
  enriched as (
    select pool.*,
      exists (
        select 1 from public.explore_follows follow
        where follow.follower_id = p_user_id and follow.following_id = pool.user_id
      ) as is_followed,
      coalesce(local_match.is_local, false) as is_local,
      coalesce(signals.views, 0) as signal_views,
      coalesce(signals.impressions, 0) as signal_impressions,
      coalesce(signals.reactions, 0) as signal_reactions,
      row_number() over (
        partition by pool.user_id
        order by coalesce(pool.score, 0) desc, pool.created_at desc, pool.id
      ) as creator_position
    from pool
    left join signals on signals.post_id = pool.id
    left join lateral (
      select (
        mine.location_personalization_enabled
        and theirs.location_personalization_enabled
        and nullif(lower(mine.coarse_city), '') is not null
        and lower(mine.coarse_city) = lower(theirs.coarse_city)
        and (
          nullif(lower(mine.coarse_country_code), '') is null
          or lower(mine.coarse_country_code) = lower(theirs.coarse_country_code)
        )
      ) as is_local
      from public.explore_recommendation_privacy mine
      join public.explore_recommendation_privacy theirs on theirs.user_id = pool.user_id
      where mine.user_id = p_user_id
    ) local_match on true
  ),
  ranked as (
    select enriched.*,
      (
        coalesce(enriched.score, 0)
        + case when enriched.is_followed then 64 else 0 end
        + case when enriched.is_local then 28 else 0 end
        + ln(1 + enriched.signal_reactions) * 5.2
        + ln(1 + enriched.signal_views) * 2.4
        + 18 / sqrt(1 + enriched.signal_impressions)
        + greatest(0, 12 - extract(epoch from (timezone('utc', now()) - enriched.created_at)) / 43200)
        - greatest(enriched.creator_position - 1, 0) * 7
        + mod(abs(hashtext(enriched.id::text || current_date::text))::bigint, 100)::double precision / 25
      )::double precision as hardened_score
    from enriched
  )
  select ranked.id, ranked.user_id, ranked.author_name, ranked.author_username, ranked.author_avatar_url,
    ranked.feed_scope, ranked.body, ranked.image_url, ranked.audio_url, ranked.video_url,
    ranked.video_trim_start, ranked.video_trim_end, ranked.post_type, ranked.category,
    ranked.moderation_status, ranked.audio_duration_seconds, ranked.post_privacy,
    ranked.hashtags, ranked.mentions, ranked.media_meta, ranked.likes_count,
    ranked.comments_count, ranked.saves_count, ranked.created_at, ranked.hardened_score
  from ranked, settings
  order by ranked.hardened_score desc, ranked.created_at desc, ranked.id
  limit (select page_limit from settings)
  offset (select page_offset from settings);
$$;

create or replace function public.get_recommended_swip_v2(
  p_user_id uuid,
  p_limit integer default 18,
  p_offset integer default 0
)
returns table (
  id uuid, user_id uuid, author_name text, author_username text, author_avatar_url text,
  feed_scope text, body text, image_url text, audio_url text, video_url text,
  video_trim_start numeric, video_trim_end numeric, post_type text, category text,
  moderation_status text, audio_duration_seconds integer, post_privacy text,
  hashtags text[], mentions text[], media_meta jsonb, likes_count integer,
  comments_count integer, saves_count integer, created_at timestamptz, score double precision
)
language sql
stable
security definer
set search_path = public
as $$
  with settings as (
    select greatest(1, least(coalesce(p_limit, 18), 36)) as page_limit,
           greatest(0, least(coalesce(p_offset, 0), 35)) as page_offset
    where auth.uid() = p_user_id
  ),
  pool as (
    select * from public.get_recommended_swip(p_user_id, 36, 0)
  ),
  signals as (
    select signal.post_id,
      sum(greatest(signal.views, 0))::double precision as views,
      sum(greatest(signal.impressions, 0))::double precision as impressions,
      sum(greatest(signal.likes, 0) + greatest(signal.comments, 0) + greatest(signal.saves, 0) + greatest(signal.shares, 0) + greatest(signal.rewatches, 0))::double precision as positive_actions,
      avg(case when signal.views > 0 then signal.max_completion_rate end)::double precision as completion_rate
    from public.explore_content_signals signal
    where signal.post_id in (select pool.id from pool)
    group by signal.post_id
  ),
  enriched as (
    select pool.*,
      exists (
        select 1 from public.explore_follows follow
        where follow.follower_id = p_user_id and follow.following_id = pool.user_id
      ) as is_followed,
      coalesce(local_match.is_local, false) as is_local,
      coalesce(signals.views, 0) as signal_views,
      coalesce(signals.impressions, 0) as signal_impressions,
      coalesce(signals.positive_actions, 0) as positive_actions,
      coalesce(signals.completion_rate, 0) as completion_rate,
      row_number() over (
        partition by pool.user_id
        order by coalesce(pool.score, 0) desc, pool.created_at desc, pool.id
      ) as creator_position
    from pool
    left join signals on signals.post_id = pool.id
    left join lateral (
      select (
        mine.location_personalization_enabled
        and theirs.location_personalization_enabled
        and nullif(lower(mine.coarse_city), '') is not null
        and lower(mine.coarse_city) = lower(theirs.coarse_city)
        and (
          nullif(lower(mine.coarse_country_code), '') is null
          or lower(mine.coarse_country_code) = lower(theirs.coarse_country_code)
        )
      ) as is_local
      from public.explore_recommendation_privacy mine
      join public.explore_recommendation_privacy theirs on theirs.user_id = pool.user_id
      where mine.user_id = p_user_id
    ) local_match on true
  ),
  ranked as (
    select enriched.*,
      (
        coalesce(enriched.score, 0)
        + case when enriched.is_followed then 48 else 0 end
        + case when enriched.is_local then 22 else 0 end
        + enriched.completion_rate * 18
        + ln(1 + enriched.positive_actions) * 4.5
        + ln(1 + enriched.signal_views) * 1.8
        + 20 / sqrt(1 + enriched.signal_impressions)
        + greatest(0, 10 - extract(epoch from (timezone('utc', now()) - enriched.created_at)) / 64800)
        - greatest(enriched.creator_position - 1, 0) * 8
        + mod(abs(hashtext(enriched.id::text || current_date::text))::bigint, 100)::double precision / 25
      )::double precision as hardened_score
    from enriched
  )
  select ranked.id, ranked.user_id, ranked.author_name, ranked.author_username, ranked.author_avatar_url,
    ranked.feed_scope, ranked.body, ranked.image_url, ranked.audio_url, ranked.video_url,
    ranked.video_trim_start, ranked.video_trim_end, ranked.post_type, ranked.category,
    ranked.moderation_status, ranked.audio_duration_seconds, ranked.post_privacy,
    ranked.hashtags, ranked.mentions, ranked.media_meta, ranked.likes_count,
    ranked.comments_count, ranked.saves_count, ranked.created_at, ranked.hardened_score
  from ranked, settings
  order by ranked.hardened_score desc, ranked.created_at desc, ranked.id
  limit (select page_limit from settings)
  offset (select page_offset from settings);
$$;

create or replace function public.get_people_you_may_know_v2(
  p_user_id uuid,
  p_limit integer default 20
)
returns table (
  user_id uuid, display_name text, username text, avatar_url text, bio text,
  account_type text, verified boolean, mutual_count bigint, score double precision, reason text
)
language sql
stable
security definer
set search_path = public
as $$
  with settings as (
    select greatest(1, least(coalesce(p_limit, 20), 50)) as result_limit
    where auth.uid() = p_user_id
  ),
  pool as (
    select * from public.get_people_you_may_know(p_user_id, 50)
  ),
  viewer as (
    select profile.display_name,
      lower(split_part(btrim(coalesce(profile.display_name, '')), ' ', 1)) as first_name,
      lower(regexp_replace(btrim(coalesce(profile.display_name, '')), '^.*\s+', '')) as surname
    from public.explore_profiles profile
    where profile.user_id = p_user_id
  ),
  viewer_identity as (
    select left(regexp_replace(coalesce(identity.normalized_phone, ''), '[^0-9]', '', 'g'), 3) as phone_region
    from public.kunthai_account_identities identity
    where identity.user_id = p_user_id
  ),
  ranked as (
    select pool.*,
      (pool.reason = 'In your area') as same_area,
      (
        length(viewer.surname) >= 3
        and viewer.surname = lower(regexp_replace(btrim(coalesce(pool.display_name, '')), '^.*\s+', ''))
      ) as same_surname,
      (
        length(viewer.first_name) >= 3
        and viewer.first_name = lower(split_part(btrim(coalesce(pool.display_name, '')), ' ', 1))
      ) as same_first_name,
      (
        nullif(viewer_identity.phone_region, '') is not null
        and viewer_identity.phone_region = left(regexp_replace(coalesce(candidate_identity.normalized_phone, ''), '[^0-9]', '', 'g'), 3)
      ) as same_phone_region
    from pool
    cross join viewer
    left join viewer_identity on true
    left join public.kunthai_account_identities candidate_identity on candidate_identity.user_id = pool.user_id
  ),
  scored as (
    select ranked.*,
      (
        coalesce(ranked.score, 0)
        + case when ranked.same_area then 42 else 0 end
        + case when ranked.same_phone_region then 14 else 0 end
        + case when ranked.same_surname then 18 else 0 end
        + case when ranked.same_first_name then 8 else 0 end
        + mod(abs(hashtext(ranked.user_id::text || current_date::text))::bigint, 100)::double precision / 40
      )::double precision as hardened_score,
      case
        when ranked.same_area then 'Near you'
        when ranked.mutual_count > 0 then ranked.mutual_count::text || ' mutual connection' || case when ranked.mutual_count = 1 then '' else 's' end
        when ranked.same_surname then 'You may share a family name'
        when ranked.same_phone_region then 'Same mobile region'
        when ranked.same_first_name then 'Similar name'
        else ranked.reason
      end as hardened_reason
    from ranked
  )
  select scored.user_id, scored.display_name, scored.username, scored.avatar_url,
    scored.bio, scored.account_type, scored.verified, scored.mutual_count,
    scored.hardened_score, scored.hardened_reason
  from scored, settings
  order by scored.hardened_score desc, scored.user_id
  limit (select result_limit from settings);
$$;

revoke all on function public.get_recommended_feed_v2(uuid, integer, integer) from public;
revoke all on function public.get_recommended_swip_v2(uuid, integer, integer) from public;
revoke all on function public.get_people_you_may_know_v2(uuid, integer) from public;

grant execute on function public.get_recommended_feed_v2(uuid, integer, integer) to authenticated;
grant execute on function public.get_recommended_swip_v2(uuid, integer, integer) to authenticated;
grant execute on function public.get_people_you_may_know_v2(uuid, integer) to authenticated;


-- Advanced Post Controls: target locations are now a limit, not a boost
-- (2026-11-05). A post with target locations is shown only to viewers whose
-- KunThai account area (kunthai_account_regions.region_path: country, state,
-- city...) includes one of those places; a place also covers everything
-- inside it. A viewer with no account area is outside every target. The
-- owner and KunThai admins always see the post. Enforced on the same paths
-- as the age range: table reads, the ranked feeds, likes, comments and
-- notifications. Builds on 20261104160000_explore_post_audience_age.sql
-- (function bodies are that file's, which match production, plus the area
-- checks).

-- 1. Is this person inside one of the post's places? No places = everyone.
create or replace function public.explore_post_region_allows_user(p_region_ids uuid[], p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select coalesce(cardinality(p_region_ids), 0) = 0
      or exists (
           select 1
             from public.kunthai_account_regions account
            where account.user_id = p_user_id
              and account.region_path && p_region_ids
         );
$$;

revoke execute on function public.explore_post_region_allows_user(uuid[], uuid) from public, anon, authenticated;

-- The signed-in viewer only (auth.uid()), for the read policy.
create or replace function public.explore_post_region_allows_viewer(p_region_ids uuid[])
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select public.explore_post_region_allows_user(p_region_ids, auth.uid());
$$;

revoke execute on function public.explore_post_region_allows_viewer(uuid[]) from public, anon;
grant execute on function public.explore_post_region_allows_viewer(uuid[]) to authenticated;

-- 2. Table reads. Restrictive, like the age range: Public never bypasses it.
drop policy if exists "location-targeted posts only for viewers in those places" on public.explore_posts;
create policy "location-targeted posts only for viewers in those places"
  on public.explore_posts
  as restrictive
  for select
  using (
    cardinality(target_region_ids) = 0
    or user_id = auth.uid()
    or public.is_kunthai_admin()
    or public.explore_post_region_allows_viewer(target_region_ids)
  );

-- 3. Comments and likes: refused outside the post's places.
create or replace function public.explore_guard_post_interaction()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  post record;
begin
  select p.id, p.user_id, p.actor_type, coalesce(p.space_id, p.actor_id) as space_id,
         p.comments_disabled, p.comments_followers_only, p.likes_disabled, p.has_exclusions,
         p.publish_at, p.expires_at, p.audience_age_min, p.audience_age_max, p.target_region_ids
    into post
    from public.explore_posts p
   where p.id = new.post_id;

  if not found or post.user_id is not distinct from new.user_id then
    return new;
  end if;

  if (post.has_exclusions and public.explore_post_excludes_user(post.id, new.user_id))
     or not public.explore_post_is_live(post.publish_at, post.expires_at)
     or not public.explore_post_age_allows_user(post.audience_age_min, post.audience_age_max, new.user_id)
     or not public.explore_post_region_allows_user(post.target_region_ids, new.user_id) then
    raise exception 'KT_POST_UNAVAILABLE' using errcode = '42501';
  end if;

  if tg_table_name = 'explore_post_comments' then
    if post.comments_disabled then
      raise exception 'KT_COMMENTS_DISABLED' using errcode = '42501';
    end if;
    if post.comments_followers_only
       and not public.explore_user_follows_post_author(new.user_id, post.user_id, post.actor_type, post.space_id) then
      raise exception 'KT_COMMENTS_FOLLOWERS_ONLY' using errcode = '42501';
    end if;
  elsif tg_table_name = 'explore_post_likes' then
    if post.likes_disabled then
      raise exception 'KT_LIKES_DISABLED' using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

-- 4. Notifications: nobody outside the post's places is told about it.
create or replace function public.explore_notifications_respect_post_controls()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  post record;
begin
  if new.post_id is null or new.user_id is null then
    return new;
  end if;

  select p.user_id, p.has_exclusions, p.comments_hidden, p.publish_at, p.expires_at,
         p.audience_age_min, p.audience_age_max, p.target_region_ids
    into post
    from public.explore_posts p
   where p.id = new.post_id;

  if not found or post.user_id is not distinct from new.user_id then
    return new;
  end if;

  if post.has_exclusions and public.explore_post_excludes_user(new.post_id, new.user_id) then
    return null;
  end if;

  if not public.explore_post_is_live(post.publish_at, post.expires_at) then
    return null;
  end if;

  -- Nobody outside the post's age range is told about it.
  if not public.explore_post_age_allows_user(post.audience_age_min, post.audience_age_max, new.user_id) then
    return null;
  end if;

  -- Nobody outside the post's target places is told about it.
  if not public.explore_post_region_allows_user(post.target_region_ids, new.user_id) then
    return null;
  end if;

  if post.comments_hidden
     and (lower(coalesce(new.type, '')) like '%comment%'
          or lower(coalesce(new.type, '')) like '%repl%'
          or lower(coalesce(new.media_type, '')) = 'comment') then
    return null;
  end if;

  return new;
end;
$$;

-- 5. Recommended feed: location-targeted posts only for viewers in those places.
CREATE OR REPLACE FUNCTION public.get_recommended_feed(p_user_id uuid, p_limit integer DEFAULT 24, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, user_id uuid, author_name text, author_username text, author_avatar_url text, feed_scope text, body text, image_url text, audio_url text, video_url text, video_trim_start numeric, video_trim_end numeric, post_type text, category text, moderation_status text, audio_duration_seconds integer, post_privacy text, hashtags text[], mentions text[], media_meta jsonb, likes_count integer, comments_count integer, saves_count integer, created_at timestamp with time zone, score double precision)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with viewer as (
    select greatest(1, least(coalesce(p_limit, 24), 50)) as page_limit,
           greatest(0, least(coalesce(p_offset, 0), 1000)) as page_offset
    where auth.uid() = p_user_id
  ),
  followed as (
    select following_id
    from public.explore_follows
    where follower_id = p_user_id
  ),
  mutual_users as (
    select mine.following_id as user_id
    from public.explore_follows mine
    join public.explore_follows theirs
      on theirs.follower_id = mine.following_id
     and theirs.following_id = p_user_id
    where mine.follower_id = p_user_id
  ),
  candidates as (
    select post.*
    from public.explore_posts post
    where (post.user_id = p_user_id or not post.has_exclusions or not public.explore_post_excludes_viewer(post.id))
      and (post.user_id = p_user_id or public.explore_post_is_live(post.publish_at, post.expires_at))
      and (post.user_id = p_user_id or (post.audience_age_min is null and post.audience_age_max is null) or public.explore_post_age_allows_user(post.audience_age_min, post.audience_age_max, p_user_id))
      and (post.user_id = p_user_id or cardinality(post.target_region_ids) = 0 or public.explore_post_region_allows_user(post.target_region_ids, p_user_id))
      and post.feed_scope in ('feed', 'connections')
      and (
        nullif(btrim(coalesce(post.video_url, '')), '') is null
        or (post.post_type = 'advert' and nullif(btrim(coalesce(post.image_url, '')), '') is not null)
      )
      and post.moderation_status <> 'blocked'
      and (
        nullif(btrim(coalesce(post.video_url, '')), '') is null
        or post.moderation_status in ('approved', 'legacy')
      )
      and (post.created_at >= timezone('utc', now()) - interval '90 days' or post.user_id = p_user_id)
      and (
        coalesce(post.post_privacy, 'public') = 'public'
        or post.user_id = p_user_id
        or (
          coalesce(post.post_privacy, 'public') in ('circle', 'followers')
          and exists (select 1 from followed where following_id = post.user_id)
        )
      )
      and not exists (
        select 1 from public.explore_user_blocks block
        where (block.blocker_id = p_user_id and block.blocked_id = post.user_id)
           or (block.blocker_id = post.user_id and block.blocked_id = p_user_id)
      )
      and not exists (
        select 1 from public.explore_post_reports report
        where report.post_id = post.id and report.status in ('open', 'reviewed')
      )
      and not exists (
        select 1 from public.explore_content_signals hidden
        where hidden.user_id = p_user_id and hidden.post_id = post.id
          and (hidden.hides > 0 or hidden.reports > 0)
      )
  ),
  global_signals as (
    select signal.post_id,
           sum(least(signal.shares, 5))::double precision as shares,
           sum(least(signal.skips, 5))::double precision as skips,
           sum(case when signal.views > 0 then 1 else 0 end)::double precision as viewers
    from public.explore_content_signals signal
    join candidates candidate on candidate.id = signal.post_id
    group by signal.post_id
  ),
  mutual_activity as (
    select activity.post_id, count(*)::double precision as activity_count
    from (
      select post_like.post_id, post_like.user_id
      from public.explore_post_likes post_like
      join mutual_users mutual on mutual.user_id = post_like.user_id
      union all
      select comment.post_id, comment.user_id
      from public.explore_post_comments comment
      join mutual_users mutual on mutual.user_id = comment.user_id
    ) activity
    group by activity.post_id
  ),
  scored as (
    select candidate.*,
      (
        case when candidate.user_id in (select following_id from followed) then 22 else 0 end
        + case when candidate.user_id = p_user_id then 2 else 0 end
        + least(coalesce(mutual.activity_count, 0), 5) * 2
        + ln(1 + greatest(candidate.likes_count, 0)) * 2.0
        + ln(1 + greatest(candidate.comments_count, 0)) * 2.8
        + ln(1 + greatest(candidate.saves_count, 0)) * 3.2
        + ln(1 + coalesce(global_stats.shares, 0)) * 4.0
        + greatest(0, 12 - extract(epoch from (timezone('utc', now()) - candidate.created_at)) / 43200)
        + least(12, greatest(-12, coalesce(topic_match.interest_score, 0)))
        + least(12, greatest(-12, coalesce(creator.interaction_score, 0) * 0.18))
        + case when local_match.is_local then 5 else 0 end
        - least(coalesce(personal.skips, 0), 3) * 9
        - least(coalesce(personal.impressions, 0), 8) * 0.35
        - least(coalesce(global_stats.skips, 0) / greatest(coalesce(global_stats.viewers, 1), 1), 1) * 4
      )::double precision as recommendation_score
    from candidates candidate
    left join public.explore_content_signals personal
      on personal.user_id = p_user_id and personal.post_id = candidate.id
    left join global_signals global_stats on global_stats.post_id = candidate.id
    left join mutual_activity mutual on mutual.post_id = candidate.id
    left join public.explore_creator_interactions creator
      on creator.user_id = p_user_id and creator.creator_id = candidate.user_id
    left join lateral (
      select max(interest.interest_score)::double precision as interest_score
      from public.explore_topic_interests interest
      where interest.user_id = p_user_id
        and (
          interest.topic = lower(coalesce(candidate.category, ''))
          or exists (
            select 1 from unnest(coalesce(candidate.hashtags, '{}'::text[])) hashtag
            where interest.topic = lower(btrim(hashtag, ' #'))
          )
        )
    ) topic_match on true
    left join lateral (
      select (
        viewer_location.location_personalization_enabled
        and creator_location.location_personalization_enabled
        and nullif(lower(viewer_location.coarse_city), '') is not null
        and lower(viewer_location.coarse_city) = lower(creator_location.coarse_city)
        and (
          nullif(lower(viewer_location.coarse_country_code), '') is null
          or lower(viewer_location.coarse_country_code) = lower(creator_location.coarse_country_code)
        )
      ) as is_local
      from public.explore_recommendation_privacy viewer_location
      join public.explore_recommendation_privacy creator_location on creator_location.user_id = candidate.user_id
      where viewer_location.user_id = p_user_id
    ) local_match on true
  )
  select
    ranked.id, ranked.user_id, ranked.author_name, ranked.author_username, ranked.author_avatar_url,
    ranked.feed_scope, ranked.body, ranked.image_url, ranked.audio_url, ranked.video_url,
    ranked.video_trim_start, ranked.video_trim_end, ranked.post_type, ranked.category,
    ranked.moderation_status, ranked.audio_duration_seconds, ranked.post_privacy,
    ranked.hashtags, ranked.mentions,
    coalesce(ranked.media_meta, '{}'::jsonb) || jsonb_build_object('postControls', jsonb_build_object(
      'commentsDisabled', ranked.comments_disabled,
      'commentsHidden', ranked.comments_hidden,
      'commentsFollowersOnly', ranked.comments_followers_only,
      'likesDisabled', ranked.likes_disabled,
      'likeCountHidden', ranked.like_count_hidden,
      'repostsDisabled', ranked.reposts_disabled,
      'downloadsDisabled', ranked.downloads_disabled,
      'contentWarning', ranked.content_warning,
      'hiddenFromProfile', ranked.hidden_from_profile,
      'expiresAfter', ranked.expires_after,
      'expiresAt', ranked.expires_at,
      'publishAt', ranked.publish_at,
      'targetRegions', case when ranked.user_id = p_user_id then ranked.target_regions else '[]'::jsonb end
    )) as media_meta,
    case when ranked.like_count_hidden and ranked.user_id = p_user_id
      then (select count(*)::integer from public.explore_post_likes l where l.post_id = ranked.id)
      else ranked.likes_count end as likes_count,
    case when ranked.comments_hidden and ranked.user_id = p_user_id
      then (select count(*)::integer from public.explore_post_comments c where c.post_id = ranked.id)
      else ranked.comments_count end as comments_count,
    ranked.saves_count, ranked.created_at,
    (ranked.recommendation_score + case
      when cardinality(ranked.target_region_ids) > 0
       and ranked.target_region_ids && coalesce((select region.region_path from public.kunthai_account_regions region where region.user_id = p_user_id), '{}'::uuid[])
      then 8 else 0 end)::double precision as score
  from scored ranked, viewer
  order by (ranked.recommendation_score + case
      when cardinality(ranked.target_region_ids) > 0
       and ranked.target_region_ids && coalesce((select region.region_path from public.kunthai_account_regions region where region.user_id = p_user_id), '{}'::uuid[])
      then 8 else 0 end) desc, ranked.created_at desc, ranked.id
  limit (select page_limit from viewer)
  offset (select page_offset from viewer);
$function$;

-- 6. Recommended swip: location-targeted posts only for viewers in those places.
CREATE OR REPLACE FUNCTION public.get_recommended_swip(p_user_id uuid, p_limit integer DEFAULT 18, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, user_id uuid, author_name text, author_username text, author_avatar_url text, feed_scope text, body text, image_url text, audio_url text, video_url text, video_trim_start numeric, video_trim_end numeric, post_type text, category text, moderation_status text, audio_duration_seconds integer, post_privacy text, hashtags text[], mentions text[], media_meta jsonb, likes_count integer, comments_count integer, saves_count integer, created_at timestamp with time zone, score double precision)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with viewer as (
    select greatest(1, least(coalesce(p_limit, 18), 36)) as page_limit,
           greatest(0, least(coalesce(p_offset, 0), 1000)) as page_offset
    where auth.uid() = p_user_id
  ),
  followed as (
    select following_id from public.explore_follows where follower_id = p_user_id
  ),
  candidates as (
    select post.*,
           greatest(0.5, least(15,
             coalesce(post.video_trim_end, 15) - coalesce(post.video_trim_start, 0)
           ))::double precision as clip_seconds
    from public.explore_posts post
    where (post.user_id = p_user_id or not post.has_exclusions or not public.explore_post_excludes_viewer(post.id))
      and (post.user_id = p_user_id or public.explore_post_is_live(post.publish_at, post.expires_at))
      and (post.user_id = p_user_id or (post.audience_age_min is null and post.audience_age_max is null) or public.explore_post_age_allows_user(post.audience_age_min, post.audience_age_max, p_user_id))
      and (post.user_id = p_user_id or cardinality(post.target_region_ids) = 0 or public.explore_post_region_allows_user(post.target_region_ids, p_user_id))
      and nullif(btrim(coalesce(post.video_url, '')), '') is not null
      and post.moderation_status in ('approved', 'legacy')
      and (post.created_at >= timezone('utc', now()) - interval '120 days' or post.user_id = p_user_id)
      and (
        coalesce(post.post_privacy, 'public') = 'public'
        or post.user_id = p_user_id
        or (
          coalesce(post.post_privacy, 'public') in ('circle', 'followers')
          and exists (select 1 from followed where following_id = post.user_id)
        )
      )
      and not exists (
        select 1 from public.explore_user_blocks block
        where (block.blocker_id = p_user_id and block.blocked_id = post.user_id)
           or (block.blocker_id = post.user_id and block.blocked_id = p_user_id)
      )
      and not exists (
        select 1 from public.explore_post_reports report
        where report.post_id = post.id and report.status in ('open', 'reviewed')
      )
      and not exists (
        select 1 from public.explore_content_signals hidden
        where hidden.user_id = p_user_id and hidden.post_id = post.id
          and (hidden.hides > 0 or hidden.reports > 0)
      )
  ),
  global_quality as (
    select signal.creator_id,
      avg(case when signal.views > 0 then signal.max_completion_rate end)::double precision as completion_quality,
      avg(case when signal.views > 0 then least(signal.skips, 1) else 0 end)::double precision as skip_rate,
      avg(case when signal.views > 0 then least(signal.reports, 1) else 0 end)::double precision as report_rate,
      count(*) filter (where signal.shares > 0 or signal.saves > 0 or signal.likes > 0 or signal.comments > 0)::double precision as positive_viewers
    from public.explore_content_signals signal
    where signal.creator_id in (select distinct candidate.user_id from candidates candidate where candidate.user_id is not null)
    group by signal.creator_id
  ),
  global_post as (
    select signal.post_id,
      avg(case when signal.views > 0 then signal.max_completion_rate end)::double precision as completion_rate,
      sum(case when signal.shares > 0 then 1 else 0 end)::double precision as sharers,
      sum(case when signal.rewatches > 0 then 1 else 0 end)::double precision as rewatchers
    from public.explore_content_signals signal
    join candidates candidate on candidate.id = signal.post_id
    group by signal.post_id
  ),
  scored as (
    select candidate.*,
      (
        -- Watch behavior intentionally outweighs likes in Swip v1.
        least(2, coalesce(personal.watch_time_seconds, 0) / greatest(candidate.clip_seconds * greatest(personal.views, 1), 1)) * 20
        + coalesce(personal.max_completion_rate, 0) * 26
        + least(coalesce(personal.completions, 0), 3) * 6
        + least(coalesce(personal.rewatches, 0), 3) * 9
        + least(coalesce(personal.shares, 0), 3) * 7
        + least(coalesce(personal.saves, 0), 3) * 5
        + least(coalesce(personal.comments, 0), 3) * 4
        + least(coalesce(personal.likes, 0), 3) * 2.5
        - least(coalesce(personal.skips, 0), 3) * 18
        - least(coalesce(personal.hides, 0) + coalesce(personal.reports, 0), 1) * 60
        + least(14, greatest(-14, coalesce(creator.interaction_score, 0) * 0.2))
        + least(14, greatest(-14, coalesce(topic_match.interest_score, 0)))
        + coalesce(quality.completion_quality, 0) * 14
        - coalesce(quality.skip_rate, 0) * 10
        - coalesce(quality.report_rate, 0) * 30
        + ln(1 + coalesce(quality.positive_viewers, 0)) * 1.5
        + coalesce(global_stats.completion_rate, 0) * 8
        + ln(1 + coalesce(global_stats.sharers, 0)) * 3
        + ln(1 + coalesce(global_stats.rewatchers, 0)) * 3
        + ln(1 + greatest(candidate.comments_count, 0)) * 1.8
        + ln(1 + greatest(candidate.saves_count, 0)) * 2.2
        + ln(1 + greatest(candidate.likes_count, 0)) * 1.1
        + case when personal.post_id is null then 6 else 0 end
        + case when candidate.user_id in (select following_id from followed) then 5 else 0 end
        + greatest(0, 8 - extract(epoch from (timezone('utc', now()) - candidate.created_at)) / 64800)
      )::double precision as recommendation_score
    from candidates candidate
    left join public.explore_content_signals personal
      on personal.user_id = p_user_id and personal.post_id = candidate.id
    left join public.explore_creator_interactions creator
      on creator.user_id = p_user_id and creator.creator_id = candidate.user_id
    left join global_quality quality on quality.creator_id = candidate.user_id
    left join global_post global_stats on global_stats.post_id = candidate.id
    left join lateral (
      select max(interest.interest_score)::double precision as interest_score
      from public.explore_topic_interests interest
      where interest.user_id = p_user_id
        and (
          interest.topic = lower(coalesce(candidate.category, ''))
          or exists (
            select 1 from unnest(coalesce(candidate.hashtags, '{}'::text[])) hashtag
            where interest.topic = lower(btrim(hashtag, ' #'))
          )
        )
    ) topic_match on true
  )
  select
    ranked.id, ranked.user_id, ranked.author_name, ranked.author_username, ranked.author_avatar_url,
    ranked.feed_scope, ranked.body, ranked.image_url, ranked.audio_url, ranked.video_url,
    ranked.video_trim_start, ranked.video_trim_end, ranked.post_type, ranked.category,
    ranked.moderation_status, ranked.audio_duration_seconds, ranked.post_privacy,
    ranked.hashtags, ranked.mentions,
    coalesce(ranked.media_meta, '{}'::jsonb) || jsonb_build_object('postControls', jsonb_build_object(
      'commentsDisabled', ranked.comments_disabled,
      'commentsHidden', ranked.comments_hidden,
      'commentsFollowersOnly', ranked.comments_followers_only,
      'likesDisabled', ranked.likes_disabled,
      'likeCountHidden', ranked.like_count_hidden,
      'repostsDisabled', ranked.reposts_disabled,
      'downloadsDisabled', ranked.downloads_disabled,
      'contentWarning', ranked.content_warning,
      'hiddenFromProfile', ranked.hidden_from_profile,
      'expiresAfter', ranked.expires_after,
      'expiresAt', ranked.expires_at,
      'publishAt', ranked.publish_at,
      'targetRegions', case when ranked.user_id = p_user_id then ranked.target_regions else '[]'::jsonb end
    )) as media_meta,
    case when ranked.like_count_hidden and ranked.user_id = p_user_id
      then (select count(*)::integer from public.explore_post_likes l where l.post_id = ranked.id)
      else ranked.likes_count end as likes_count,
    case when ranked.comments_hidden and ranked.user_id = p_user_id
      then (select count(*)::integer from public.explore_post_comments c where c.post_id = ranked.id)
      else ranked.comments_count end as comments_count,
    ranked.saves_count, ranked.created_at,
    (ranked.recommendation_score + case
      when cardinality(ranked.target_region_ids) > 0
       and ranked.target_region_ids && coalesce((select region.region_path from public.kunthai_account_regions region where region.user_id = p_user_id), '{}'::uuid[])
      then 8 else 0 end)::double precision as score
  from scored ranked, viewer
  order by (ranked.recommendation_score + case
      when cardinality(ranked.target_region_ids) > 0
       and ranked.target_region_ids && coalesce((select region.region_path from public.kunthai_account_regions region where region.user_id = p_user_id), '{}'::uuid[])
      then 8 else 0 end) desc, ranked.created_at desc, ranked.id
  limit (select page_limit from viewer)
  offset (select page_offset from viewer);
$function$;

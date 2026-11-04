-- Advanced Post Controls, phase 2: expiry, hide from profile, content
-- warnings, downloads off, scheduled publishing and target locations.
--
-- Access precedence (with phase 1):
--   owner > audience (Public / Circle) > exclusions > schedule / expiry >
--   interaction rules.
-- A scheduled post is visible only to its owner until publish_at (enforced
-- by time in RLS, so it can never appear early even if a job runs late).
-- An expired post stays in the table for its owner (archive); nobody else
-- can read or act on it. Nothing is deleted.

-- 1. Columns. Defaults change nothing for existing posts.
alter table public.explore_posts
  add column if not exists expires_after text,
  add column if not exists expires_at timestamptz,
  add column if not exists hidden_from_profile boolean not null default false,
  add column if not exists downloads_disabled boolean not null default false,
  add column if not exists content_warning text,
  add column if not exists publish_at timestamptz,
  add column if not exists published_at timestamptz,
  add column if not exists target_regions jsonb not null default '[]'::jsonb,
  add column if not exists target_region_ids uuid[] not null default '{}'::uuid[];

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'explore_posts_expires_after_check') then
    alter table public.explore_posts add constraint explore_posts_expires_after_check
      check (expires_after is null or expires_after in ('24h', '7d', '30d'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'explore_posts_content_warning_check') then
    alter table public.explore_posts add constraint explore_posts_content_warning_check
      check (content_warning is null or content_warning in ('sensitive', 'graphic', 'spoilers'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'explore_posts_target_regions_check') then
    alter table public.explore_posts add constraint explore_posts_target_regions_check
      check (jsonb_typeof(target_regions) = 'array' and jsonb_array_length(target_regions) <= 5 and cardinality(target_region_ids) <= 5);
  end if;
end $$;

create index if not exists explore_posts_due_schedule_idx
  on public.explore_posts (publish_at)
  where publish_at is not null and published_at is null;

create index if not exists explore_posts_expires_at_idx
  on public.explore_posts (expires_at)
  where expires_at is not null;

create index if not exists explore_posts_target_region_ids_idx
  on public.explore_posts using gin (target_region_ids);

-- 2. Is the post live right now (published and not expired)?
create or replace function public.explore_post_is_live(p_publish_at timestamptz, p_expires_at timestamptz)
returns boolean
language sql
stable
as $$
  select (p_publish_at is null or p_publish_at <= now())
     and (p_expires_at is null or p_expires_at > now());
$$;

-- 3. Nobody but the owner (and admins) can read a scheduled or expired post,
--    on any read path. Comments, likes and notifications follow the post.
drop policy if exists "scheduled and expired posts are owner only" on public.explore_posts;
create policy "scheduled and expired posts are owner only"
  on public.explore_posts
  as restrictive
  for select
  using (
    user_id = auth.uid()
    or public.is_kunthai_admin()
    or public.explore_post_is_live(publish_at, expires_at)
  );

-- 4. The post row: phase 1 (exclusions, hidden counts, reposts) plus
--    schedule, expiry and target locations.
create or replace function public.explore_posts_apply_controls()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  requested uuid[];
  source_id uuid;
  source_post record;
  actor uuid := coalesce(auth.uid(), new.user_id);
  live_from timestamptz;
  region_ids uuid[];
  regions jsonb;
begin
  -- Excluded accounts (null = leave as is; [] = clear).
  if new.excluded_user_ids is not null then
    select coalesce(array_agg(distinct value), '{}'::uuid[])
      into requested
      from unnest(new.excluded_user_ids) as value
     where value is not null and value is distinct from new.user_id;

    if coalesce(array_length(requested, 1), 0) > 100 then
      raise exception 'KT_TOO_MANY_EXCLUSIONS' using errcode = '22023';
    end if;

    if tg_op = 'UPDATE' then
      delete from public.explore_post_exclusions exclusion
       where exclusion.post_id = new.id
         and not (exclusion.excluded_user_id = any(requested));
    end if;

    insert into public.explore_post_exclusions (post_id, excluded_user_id)
    select new.id, account.id
      from auth.users account
     where account.id = any(requested)
    on conflict do nothing;

    new.has_exclusions := exists (
      select 1 from auth.users account where account.id = any(requested)
    );
    new.excluded_user_ids := null;

    if tg_op = 'UPDATE' and new.has_exclusions then
      update public.explore_posts repost
         set media_meta = jsonb_set(
               repost.media_meta,
               '{repost}',
               jsonb_build_object(
                 'sourcePostId', repost.media_meta -> 'repost' ->> 'sourcePostId',
                 'sourceType', repost.media_meta -> 'repost' ->> 'sourceType',
                 'createdAt', repost.media_meta -> 'repost' -> 'createdAt',
                 'live', true
               )
             )
       where repost.id <> new.id
         and repost.media_meta -> 'repost' ->> 'sourcePostId' = new.id::text
         and coalesce((repost.media_meta -> 'repost' ->> 'live')::boolean, false) = false;

      update public.explore_notifications notification
         set post_preview = ''
       where notification.post_id = new.id
         and notification.user_id = any(requested)
         and coalesce(notification.post_preview, '') <> '';
    end if;
  end if;

  -- Hidden counts are never published on the row.
  if new.like_count_hidden then
    new.likes_count := 0;
  elsif tg_op = 'UPDATE' and old.like_count_hidden then
    new.likes_count := (select count(*)::integer from public.explore_post_likes l where l.post_id = new.id);
  end if;

  if new.comments_hidden then
    new.comments_count := 0;
  elsif tg_op = 'UPDATE' and old.comments_hidden then
    new.comments_count := (select count(*)::integer from public.explore_post_comments c where c.post_id = new.id);
  end if;

  -- Scheduling. A time in the past (or within a minute) means "now".
  if tg_op = 'INSERT' then
    new.published_at := null;
    if new.publish_at is not null and new.publish_at <= now() + interval '1 minute' then
      new.publish_at := null;
    end if;
  elsif old.published_at is null and new.published_at is not null then
    -- The publishing job going live: keep the scheduled time as it is.
    new.publish_at := old.publish_at;
  elsif old.published_at is not null or (old.publish_at is null and new.publish_at is not null) then
    -- Already live: the publish time can no longer change.
    new.publish_at := old.publish_at;
    new.published_at := old.published_at;
  elsif old.publish_at is not null and new.publish_at is not null and new.publish_at <= now() then
    new.publish_at := now(); -- "publish now": the job sends it within a minute
  elsif old.publish_at is not null and new.publish_at is null then
    new.publish_at := now();
  end if;

  if new.publish_at is not null and new.publish_at > now() + interval '366 days' then
    raise exception 'KT_SCHEDULE_TOO_FAR' using errcode = '22023';
  end if;

  -- Expiry: always computed here from the chosen option.
  live_from := coalesce(new.publish_at, new.created_at, now());
  new.expires_at := case new.expires_after
    when '24h' then live_from + interval '24 hours'
    when '7d' then live_from + interval '7 days'
    when '30d' then live_from + interval '30 days'
    else null
  end;

  -- Target locations: at most 5 known KunThai regions; labels only, never coordinates.
  if tg_op = 'INSERT' or new.target_regions is distinct from old.target_regions then
    select
      coalesce(jsonb_agg(jsonb_build_object(
        'id', region.id,
        'label', left(coalesce(nullif(btrim(item ->> 'label'), ''), region.display_name), 120),
        'regionName', region.display_name,
        'countryIso', region.country_iso
      ) order by ord), '[]'::jsonb),
      coalesce(array_agg(distinct region.id), '{}'::uuid[])
      into regions, region_ids
      from (
        select distinct on (public.explore_try_uuid(item ->> 'id'), lower(btrim(item ->> 'label'))) item, ord
          from jsonb_array_elements(case when jsonb_typeof(new.target_regions) = 'array' then new.target_regions else '[]'::jsonb end)
               with ordinality as entries(item, ord)
         order by public.explore_try_uuid(item ->> 'id'), lower(btrim(item ->> 'label')), ord
      ) picked
      join public.kunthai_country_regions region
        on region.id = public.explore_try_uuid(picked.item ->> 'id');

    if jsonb_array_length(regions) > 5 then
      raise exception 'KT_TOO_MANY_LOCATIONS' using errcode = '22023';
    end if;
    new.target_regions := regions;
    new.target_region_ids := region_ids;
  end if;

  -- Reposts: the original (always the first post in a chain) must allow it.
  if tg_op = 'INSERT' and new.media_meta ? 'repost' then
    source_id := public.explore_try_uuid(new.media_meta -> 'repost' ->> 'sourcePostId');
    if source_id is not null then
      select post.id, post.user_id, post.reposts_disabled, post.has_exclusions, post.publish_at, post.expires_at
        into source_post
        from public.explore_posts post
       where post.id = source_id;

      if found and source_post.user_id is distinct from actor then
        if public.explore_post_excludes_user(source_post.id, actor)
           or not public.explore_post_is_live(source_post.publish_at, source_post.expires_at) then
          raise exception 'KT_POST_UNAVAILABLE' using errcode = '42501';
        end if;
        if source_post.reposts_disabled then
          raise exception 'KT_REPOSTS_DISABLED' using errcode = '42501';
        end if;
      end if;

      if found and source_post.has_exclusions then
        new.media_meta := jsonb_set(
          new.media_meta,
          '{repost}',
          jsonb_build_object(
            'sourcePostId', source_post.id::text,
            'sourceType', new.media_meta -> 'repost' ->> 'sourceType',
            'createdAt', new.media_meta -> 'repost' -> 'createdAt',
            'live', true
          )
        );
      end if;
    end if;
  end if;

  return new;
end;
$$;

-- 5. Comments and likes: also refused on scheduled or expired posts.
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
         p.publish_at, p.expires_at
    into post
    from public.explore_posts p
   where p.id = new.post_id;

  if not found or post.user_id is not distinct from new.user_id then
    return new;
  end if;

  if (post.has_exclusions and public.explore_post_excludes_user(post.id, new.user_id))
     or not public.explore_post_is_live(post.publish_at, post.expires_at) then
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

-- 6. Notifications about a post that is not live yet are held back; the
--    publishing job sends them when it goes live.
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

  select p.user_id, p.has_exclusions, p.comments_hidden, p.publish_at, p.expires_at
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

  if post.comments_hidden
     and (lower(coalesce(new.type, '')) like '%comment%'
          or lower(coalesce(new.type, '')) like '%repl%'
          or lower(coalesce(new.media_type, '')) = 'comment') then
    return null;
  end if;

  return new;
end;
$$;

-- 7. Scheduled publishing, on the server (pg_cron, every minute). The post
--    becomes readable at publish_at by the policy above; this job moves it
--    to the top of feeds (created_at = publish time) and tells followers
--    and mentioned people, as the app does for an immediate post.
create or replace function public.explore_publish_due_posts()
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  published_count integer := 0;
begin
  create temporary table if not exists explore_due_posts (id uuid primary key) on commit drop;
  truncate explore_due_posts;

  with due as (
    update public.explore_posts post
       set published_at = now(),
           created_at = post.publish_at
     where post.publish_at is not null
       and post.published_at is null
       and post.publish_at <= now()
    returning post.id
  )
  insert into explore_due_posts select id from due;

  get diagnostics published_count = row_count;
  if published_count = 0 then
    return 0;
  end if;

  -- Followers (or Space connections) hear about it.
  insert into public.explore_notifications (
    user_id, actor_user_id, actor_type, actor_id, actor_space_id, actor_name, actor_avatar_url,
    type, media_type, message, priority, category, group_key, read, post_id, post_preview
  )
  select distinct on (target.user_id, post.id)
    target.user_id, post.user_id, coalesce(post.actor_type, 'profile'), coalesce(post.actor_id, post.user_id), post.space_id,
    post.author_name, post.author_avatar_url,
    'post',
    case when coalesce(post.video_url, '') <> '' then 'Swip video' when coalesce(post.image_url, '') <> '' then 'photo post' else 'post' end,
    coalesce(nullif(post.author_name, ''), 'Someone') || ' published a new '
      || case when coalesce(post.video_url, '') <> '' then 'Swip video' when coalesce(post.image_url, '') <> '' then 'photo post' else 'post' end,
    'normal', 'activity', 'post:' || post.id::text, false, post.id, coalesce(post.body, '')
  from public.explore_posts post
  join explore_due_posts due on due.id = post.id
  join lateral (
    select follow.follower_id as user_id
      from public.explore_follows follow
     where coalesce(post.actor_type, 'profile') <> 'space' and follow.following_id = post.user_id
    union
    select connection.connector_user_id
      from public.explore_identity_connections connection
     where post.actor_type = 'space'
       and connection.target_type = 'space'
       and connection.target_space_id = coalesce(post.space_id, post.actor_id)
  ) target on target.user_id is not null and target.user_id <> post.user_id
  where coalesce(post.post_type, '') <> 'advert';

  -- Mentioned people (their mention settings apply).
  insert into public.explore_notifications (
    user_id, actor_user_id, actor_name, actor_avatar_url, type, media_type, message,
    priority, category, group_key, read, post_id, post_preview
  )
  select distinct on (profile.user_id, post.id)
    profile.user_id, post.user_id, coalesce(nullif(post.author_name, ''), 'Someone'), coalesce(post.author_avatar_url, ''),
    'mention', case when coalesce(post.video_url, '') <> '' then 'video post' else 'post' end,
    coalesce(nullif(post.author_name, ''), 'Someone') || ' mentioned you',
    'high', 'mentions', 'mention:' || post.id::text || ':post:' || profile.user_id::text, false, post.id,
    coalesce(nullif(post.body, ''), 'You were mentioned on Explore')
  from public.explore_posts post
  join explore_due_posts due on due.id = post.id
  cross join lateral unnest(coalesce(post.mentions, '{}'::text[])) as mention(username)
  join public.explore_profiles profile on lower(profile.username) = lower(trim(leading '@' from trim(mention.username)))
  left join public.explore_user_privacy_settings privacy on privacy.user_id = profile.user_id
  left join public.explore_user_preferences preference on preference.user_id = profile.user_id
  where profile.user_id <> post.user_id
    and coalesce((privacy.settings ->> 'allowMentions')::boolean, true)
    and coalesce((preference.settings -> 'notifications' ->> 'mentions')::boolean, true);

  return published_count;
end;
$$;

revoke execute on function public.explore_publish_due_posts() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'kunthai-explore-publish-scheduled') then
    perform cron.unschedule('kunthai-explore-publish-scheduled');
  end if;
  perform cron.schedule('kunthai-explore-publish-scheduled', '* * * * *', 'select public.explore_publish_due_posts()');
end $$;


-- 8. Recommended feed: scheduled / expired posts only for their owner; posts
--    targeted at the viewer's area rank higher; the new controls ride along
--    in media_meta.postControls (target areas only for the owner).
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


-- 8. Recommended swip: scheduled / expired posts only for their owner; posts
--    targeted at the viewer's area rank higher; the new controls ride along
--    in media_meta.postControls (target areas only for the owner).
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

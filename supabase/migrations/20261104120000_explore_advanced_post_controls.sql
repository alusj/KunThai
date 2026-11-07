-- Advanced Post Controls, phase 1: interaction controls, hidden counts,
-- reposts off and excluded accounts, all enforced in the database.
--
-- Precedence for whoever reads or acts on a post:
--   owner > audience (Public / Circle, existing policies) > exclusions >
--   interaction rules (comments, likes, reposts).
-- Comments: "off" blocks every new comment (followers too). "Followers only"
-- limits who may add one. "Hidden" lets comments in, but only the post owner
-- and each commenter (their own comments) can read them; counts read 0.
-- Existing likes, comments and reposts are never deleted.

-- 1. Settings live on the post row, so the post and its settings are written
--    by one insert. Defaults change nothing for existing or new posts.
alter table public.explore_posts
  add column if not exists comments_disabled boolean not null default false,
  add column if not exists comments_hidden boolean not null default false,
  add column if not exists comments_followers_only boolean not null default false,
  add column if not exists likes_disabled boolean not null default false,
  add column if not exists like_count_hidden boolean not null default false,
  add column if not exists reposts_disabled boolean not null default false,
  add column if not exists has_exclusions boolean not null default false,
  -- Write-only hand-off: a client sends the excluded account ids here on
  -- insert / update; the trigger below moves them into
  -- explore_post_exclusions and clears it, so it is always null when read.
  add column if not exists excluded_user_ids uuid[];

-- 2. Excluded accounts. Only the post owner can read the list; it is written
--    only through the post row (trigger below), never directly.
create table if not exists public.explore_post_exclusions (
  post_id uuid not null references public.explore_posts(id) on delete cascade deferrable initially deferred,
  excluded_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (post_id, excluded_user_id)
);

create index if not exists explore_post_exclusions_user_idx
  on public.explore_post_exclusions (excluded_user_id);

alter table public.explore_post_exclusions enable row level security;

drop policy if exists "post owners read their exclusions" on public.explore_post_exclusions;
create policy "post owners read their exclusions"
  on public.explore_post_exclusions for select
  using (exists (
    select 1 from public.explore_posts post
    where post.id = explore_post_exclusions.post_id and post.user_id = auth.uid()
  ));

revoke insert, update, delete on public.explore_post_exclusions from anon, authenticated;
grant select on public.explore_post_exclusions to authenticated;

-- 3. Is the signed-in viewer excluded from this post? Uses auth.uid() only,
--    so nobody can ask about another account.
create or replace function public.explore_post_excludes_viewer(p_post_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select auth.uid() is not null and exists (
    select 1 from public.explore_post_exclusions exclusion
    where exclusion.post_id = p_post_id and exclusion.excluded_user_id = auth.uid()
  );
$$;

-- Same check for a given account, for server code only (notifications).
create or replace function public.explore_post_excludes_user(p_post_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select p_user_id is not null and exists (
    select 1 from public.explore_post_exclusions exclusion
    where exclusion.post_id = p_post_id and exclusion.excluded_user_id = p_user_id
  );
$$;

revoke execute on function public.explore_post_excludes_user(uuid, uuid) from public, anon, authenticated;

-- Does this account follow the post's author (or its Space)?
create or replace function public.explore_user_follows_post_author(p_user_id uuid, p_author uuid, p_actor_type text, p_space_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select p_user_id is not null and (
    exists (
      select 1 from public.explore_follows follow
      where follow.follower_id = p_user_id and follow.following_id = p_author
    )
    or (
      p_actor_type = 'space' and p_space_id is not null and exists (
        select 1 from public.explore_identity_connections connection
        where connection.connector_user_id = p_user_id
          and connection.target_type = 'space'
          and connection.target_space_id = p_space_id
      )
    )
  );
$$;

revoke execute on function public.explore_user_follows_post_author(uuid, uuid, text, uuid) from public, anon;

-- 4. Excluded accounts cannot read the post through any table read
--    (feed, link, search, profile, saved). Restrictive: it narrows every
--    existing "visible by privacy" policy, so Public never bypasses it.
drop policy if exists "excluded accounts cannot read posts" on public.explore_posts;
create policy "excluded accounts cannot read posts"
  on public.explore_posts
  as restrictive
  for select
  using (
    user_id = auth.uid()
    or not has_exclusions
    or public.is_kunthai_admin()
    or not public.explore_post_excludes_viewer(id)
  );

-- 5. Comments and likes follow their post: if you cannot read the post you
--    cannot read its comments or likes. Hidden comments / like counts are
--    readable only by the post owner and by whoever wrote that row.
drop policy if exists "comments follow post visibility" on public.explore_post_comments;
create policy "comments follow post visibility"
  on public.explore_post_comments
  as restrictive
  for select
  using (
    exists (
      select 1 from public.explore_posts post
      where post.id = explore_post_comments.post_id
        and (
          not post.comments_hidden
          or post.user_id = auth.uid()
          or explore_post_comments.user_id = auth.uid()
        )
    )
  );

drop policy if exists "likes follow post visibility" on public.explore_post_likes;
create policy "likes follow post visibility"
  on public.explore_post_likes
  as restrictive
  for select
  using (
    exists (
      select 1 from public.explore_posts post
      where post.id = explore_post_likes.post_id
        and (
          not post.like_count_hidden
          or post.user_id = auth.uid()
          or explore_post_likes.user_id = auth.uid()
        )
    )
  );

-- 6. The post row: move excluded ids into the table, keep hidden counts at 0
--    on the public row, check reposts.
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

    -- Unknown ids are dropped (deleted accounts); the FK guards the rest.
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
      -- Reposts of this post stop carrying a copy of it: their preview is
      -- read live from this post, so the exclusion applies to them too.
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

      -- Notifications the excluded accounts already have lose their preview.
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

  -- Reposts: the original (always the first post in a chain) must allow it.
  if tg_op = 'INSERT' and new.media_meta ? 'repost' then
    source_id := public.explore_try_uuid(new.media_meta -> 'repost' ->> 'sourcePostId');
    if source_id is not null then
      select post.id, post.user_id, post.reposts_disabled, post.has_exclusions
        into source_post
        from public.explore_posts post
       where post.id = source_id;

      if found and source_post.user_id is distinct from actor then
        if public.explore_post_excludes_user(source_post.id, actor) then
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

drop trigger if exists explore_posts_zz_apply_controls on public.explore_posts;
create trigger explore_posts_zz_apply_controls
  before insert or update on public.explore_posts
  for each row execute function public.explore_posts_apply_controls();

-- 7. New comments and likes respect the post's rules and exclusions, even
--    when sent straight to the API.
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
         p.comments_disabled, p.comments_followers_only, p.likes_disabled, p.has_exclusions
    into post
    from public.explore_posts p
   where p.id = new.post_id;

  if not found or post.user_id is not distinct from new.user_id then
    return new;
  end if;

  if post.has_exclusions and public.explore_post_excludes_user(post.id, new.user_id) then
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

drop trigger if exists explore_comments_guard_controls on public.explore_post_comments;
create trigger explore_comments_guard_controls
  before insert on public.explore_post_comments
  for each row execute function public.explore_guard_post_interaction();

drop trigger if exists explore_likes_guard_controls on public.explore_post_likes;
create trigger explore_likes_guard_controls
  before insert on public.explore_post_likes
  for each row execute function public.explore_guard_post_interaction();

-- 8. Notifications: an excluded account is never told about the post, and
--    on a post with hidden comments only the owner hears about comments.
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

  select p.user_id, p.has_exclusions, p.comments_hidden
    into post
    from public.explore_posts p
   where p.id = new.post_id;

  if not found or post.user_id is not distinct from new.user_id then
    return new;
  end if;

  if post.has_exclusions and public.explore_post_excludes_user(new.post_id, new.user_id) then
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

drop trigger if exists explore_notifications_post_controls on public.explore_notifications;
create trigger explore_notifications_post_controls
  before insert on public.explore_notifications
  for each row execute function public.explore_notifications_respect_post_controls();

-- 9. Counts: follow the post's visibility, hide counts the owner hid.
create or replace function public.explore_get_post_action_counts(target_post_ids uuid[])
returns table(post_id uuid, likes_count integer, comments_count integer, saves_count integer)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select
    posts.id as post_id,
    case when posts.like_count_hidden and posts.user_id is distinct from auth.uid() then 0
         else coalesce(likes.total, 0)::integer end as likes_count,
    case when posts.comments_hidden and posts.user_id is distinct from auth.uid() then 0
         else coalesce(comments.total, 0)::integer end as comments_count,
    coalesce(saves.total, 0)::integer as saves_count
  from public.explore_posts posts
  left join (
    select explore_post_likes.post_id, count(*) as total
    from public.explore_post_likes
    where explore_post_likes.post_id = any(target_post_ids)
    group by explore_post_likes.post_id
  ) likes on likes.post_id = posts.id
  left join (
    select explore_post_comments.post_id, count(*) as total
    from public.explore_post_comments
    where explore_post_comments.post_id = any(target_post_ids)
    group by explore_post_comments.post_id
  ) comments on comments.post_id = posts.id
  left join (
    select explore_post_saves.post_id, count(*) as total
    from public.explore_post_saves
    where explore_post_saves.post_id = any(target_post_ids)
    group by explore_post_saves.post_id
  ) saves on saves.post_id = posts.id
  where posts.id = any(target_post_ids)
    and (
      posts.user_id = auth.uid()
      or not posts.has_exclusions
      or not public.explore_post_excludes_viewer(posts.id)
    );
$function$;


-- 10. Recommended feed: same exclusion check (this function skips RLS),
--     the post's controls ride along in media_meta.postControls, and the
--     owner sees their real counts.
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
      'repostsDisabled', ranked.reposts_disabled
    )) as media_meta,
    case when ranked.like_count_hidden and ranked.user_id = p_user_id
      then (select count(*)::integer from public.explore_post_likes l where l.post_id = ranked.id)
      else ranked.likes_count end as likes_count,
    case when ranked.comments_hidden and ranked.user_id = p_user_id
      then (select count(*)::integer from public.explore_post_comments c where c.post_id = ranked.id)
      else ranked.comments_count end as comments_count,
    ranked.saves_count, ranked.created_at,
    ranked.recommendation_score as score
  from scored ranked, viewer
  order by ranked.recommendation_score desc, ranked.created_at desc, ranked.id
  limit (select page_limit from viewer)
  offset (select page_offset from viewer);
$function$;


-- 10. Recommended swip: same exclusion check (this function skips RLS),
--     the post's controls ride along in media_meta.postControls, and the
--     owner sees their real counts.
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
      'repostsDisabled', ranked.reposts_disabled
    )) as media_meta,
    case when ranked.like_count_hidden and ranked.user_id = p_user_id
      then (select count(*)::integer from public.explore_post_likes l where l.post_id = ranked.id)
      else ranked.likes_count end as likes_count,
    case when ranked.comments_hidden and ranked.user_id = p_user_id
      then (select count(*)::integer from public.explore_post_comments c where c.post_id = ranked.id)
      else ranked.comments_count end as comments_count,
    ranked.saves_count, ranked.created_at,
    ranked.recommendation_score as score
  from scored ranked, viewer
  order by ranked.recommendation_score desc, ranked.created_at desc, ranked.id
  limit (select page_limit from viewer)
  offset (select page_offset from viewer);
$function$;

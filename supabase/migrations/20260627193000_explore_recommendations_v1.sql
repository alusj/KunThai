-- KunThai Explore recommendations v1
--
-- This is deliberately a transparent SQL scoring system, not ML. Passive
-- activity is stored as bounded per-user/per-post aggregates: no contacts,
-- precise coordinates, device identifiers, or raw activity timeline.

create table if not exists public.explore_content_signals (
  user_id uuid not null references auth.users(id) on delete cascade,
  post_id uuid not null references public.explore_posts(id) on delete cascade,
  creator_id uuid references auth.users(id) on delete cascade,
  impressions integer not null default 0 check (impressions >= 0),
  views integer not null default 0 check (views >= 0),
  watch_time_seconds numeric(12, 3) not null default 0 check (watch_time_seconds >= 0),
  max_completion_rate numeric(6, 5) not null default 0 check (max_completion_rate between 0 and 1),
  completions integer not null default 0 check (completions >= 0),
  rewatches integer not null default 0 check (rewatches >= 0),
  likes integer not null default 0 check (likes >= 0),
  comments integer not null default 0 check (comments >= 0),
  shares integer not null default 0 check (shares >= 0),
  saves integer not null default 0 check (saves >= 0),
  skips integer not null default 0 check (skips >= 0),
  hides integer not null default 0 check (hides >= 0),
  reports integer not null default 0 check (reports >= 0),
  first_seen_at timestamptz not null default timezone('utc', now()),
  last_interacted_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, post_id)
);

create table if not exists public.explore_topic_interests (
  user_id uuid not null references auth.users(id) on delete cascade,
  topic text not null check (char_length(topic) between 1 and 80),
  interest_score numeric(9, 3) not null default 0,
  positive_signals integer not null default 0 check (positive_signals >= 0),
  negative_signals integer not null default 0 check (negative_signals >= 0),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, topic)
);

create table if not exists public.explore_creator_interactions (
  user_id uuid not null references auth.users(id) on delete cascade,
  creator_id uuid not null references auth.users(id) on delete cascade,
  interaction_score numeric(9, 3) not null default 0,
  positive_signals integer not null default 0 check (positive_signals >= 0),
  negative_signals integer not null default 0 check (negative_signals >= 0),
  follows boolean not null default false,
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, creator_id),
  check (user_id <> creator_id)
);

-- Local ranking is opt-in and coarse. Nothing writes this table implicitly.
-- A future permission screen may populate it after explicit consent.
create table if not exists public.explore_recommendation_privacy (
  user_id uuid primary key references auth.users(id) on delete cascade,
  location_personalization_enabled boolean not null default false,
  coarse_country_code text,
  coarse_city text,
  coarse_area text,
  permission_granted_at timestamptz,
  updated_at timestamptz not null default timezone('utc', now()),
  check (
    location_personalization_enabled = false
    or permission_granted_at is not null
  )
);

comment on table public.explore_content_signals is
  'Bounded recommendation aggregates. Deliberately excludes contacts, precise location, IP address, and device identifiers.';
comment on table public.explore_recommendation_privacy is
  'Optional coarse location used only after explicit location-personalization permission. No precise coordinates are stored.';

create index if not exists explore_content_signals_post_idx
  on public.explore_content_signals (post_id);
create index if not exists explore_content_signals_creator_idx
  on public.explore_content_signals (creator_id, last_interacted_at desc);
create index if not exists explore_content_signals_user_recent_idx
  on public.explore_content_signals (user_id, last_interacted_at desc);
create index if not exists explore_topic_interests_user_score_idx
  on public.explore_topic_interests (user_id, interest_score desc);
create index if not exists explore_creator_interactions_user_score_idx
  on public.explore_creator_interactions (user_id, interaction_score desc);
create index if not exists explore_posts_recommendation_feed_idx
  on public.explore_posts (feed_scope, moderation_status, created_at desc);
create index if not exists explore_posts_recommendation_swip_idx
  on public.explore_posts (created_at desc)
  where nullif(btrim(coalesce(video_url, '')), '') is not null;
create index if not exists explore_post_reports_post_status_idx
  on public.explore_post_reports (post_id, status);
create index if not exists explore_post_comments_user_post_idx
  on public.explore_post_comments (user_id, post_id);
create index if not exists explore_conversation_members_user_conversation_idx
  on public.explore_conversation_members (user_id, conversation_id);
create index if not exists explore_recommendation_privacy_city_idx
  on public.explore_recommendation_privacy (lower(coarse_country_code), lower(coarse_city), lower(coarse_area))
  where location_personalization_enabled = true;

alter table public.explore_content_signals enable row level security;
alter table public.explore_topic_interests enable row level security;
alter table public.explore_creator_interactions enable row level security;
alter table public.explore_recommendation_privacy enable row level security;

drop policy if exists "Users read own recommendation signals" on public.explore_content_signals;
create policy "Users read own recommendation signals"
on public.explore_content_signals for select to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users read own topic interests" on public.explore_topic_interests;
create policy "Users read own topic interests"
on public.explore_topic_interests for select to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users read own creator interactions" on public.explore_creator_interactions;
create policy "Users read own creator interactions"
on public.explore_creator_interactions for select to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users manage own recommendation privacy" on public.explore_recommendation_privacy;
create policy "Users manage own recommendation privacy"
on public.explore_recommendation_privacy for all to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- Existing relational interactions remain the source of truth. These triggers
-- mirror them into compact preference aggregates for fast ranking.
create or replace function public.explore_sync_recommendation_interaction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_post_id uuid;
  v_user_id uuid;
  v_creator_id uuid;
  v_delta integer := case when tg_op = 'DELETE' then -1 else 1 end;
  v_kind text;
  v_base_weight numeric;
  v_weight numeric;
  v_topic text;
  v_category text;
begin
  v_post_id := coalesce(new.post_id, old.post_id);
  v_user_id := coalesce(new.user_id, old.user_id);

  select post.user_id, lower(coalesce(nullif(post.category, ''), 'general'))
  into v_creator_id, v_category
  from public.explore_posts post
  where post.id = v_post_id;

  if v_creator_id is null or v_user_id is null then
    return coalesce(new, old);
  end if;

  v_kind := case tg_table_name
    when 'explore_post_likes' then 'like'
    when 'explore_post_saves' then 'save'
    when 'explore_post_comments' then 'comment'
    when 'explore_post_reports' then 'report'
    else null
  end;

  if v_kind is null then
    return coalesce(new, old);
  end if;

  if tg_table_name = 'explore_post_reports' and tg_op = 'UPDATE' then
    if old.status in ('open', 'reviewed') and new.status not in ('open', 'reviewed') then
      v_delta := -1;
    elsif old.status not in ('open', 'reviewed') and new.status in ('open', 'reviewed') then
      v_delta := 1;
    else
      return new;
    end if;
  end if;

  v_base_weight := case v_kind
    when 'like' then 2.5
    when 'save' then 5
    when 'comment' then 4
    when 'report' then -35
    else 0
  end;
  v_weight := v_base_weight * v_delta;

  insert into public.explore_content_signals (
    user_id, post_id, creator_id, likes, comments, saves, reports, last_interacted_at
  ) values (
    v_user_id,
    v_post_id,
    v_creator_id,
    case when v_kind = 'like' and v_delta > 0 then 1 else 0 end,
    case when v_kind = 'comment' and v_delta > 0 then 1 else 0 end,
    case when v_kind = 'save' and v_delta > 0 then 1 else 0 end,
    case when v_kind = 'report' and v_delta > 0 then 1 else 0 end,
    timezone('utc', now())
  )
  on conflict (user_id, post_id) do update set
    creator_id = excluded.creator_id,
    likes = greatest(0, explore_content_signals.likes + case when v_kind = 'like' then v_delta else 0 end),
    comments = greatest(0, explore_content_signals.comments + case when v_kind = 'comment' then v_delta else 0 end),
    saves = greatest(0, explore_content_signals.saves + case when v_kind = 'save' then v_delta else 0 end),
    reports = greatest(0, explore_content_signals.reports + case when v_kind = 'report' then v_delta else 0 end),
    last_interacted_at = timezone('utc', now());

  if v_user_id <> v_creator_id then
    insert into public.explore_creator_interactions (
      user_id, creator_id, interaction_score, positive_signals, negative_signals, updated_at
    ) values (
      v_user_id,
      v_creator_id,
      case when v_delta > 0 then greatest(-100, least(100, v_base_weight)) else 0 end,
      case when v_base_weight > 0 and v_delta > 0 then 1 else 0 end,
      case when v_base_weight < 0 and v_delta > 0 then 1 else 0 end,
      timezone('utc', now())
    )
    on conflict (user_id, creator_id) do update set
      interaction_score = greatest(-100, least(100, explore_creator_interactions.interaction_score + v_weight)),
      positive_signals = greatest(0, explore_creator_interactions.positive_signals + case when v_base_weight > 0 then v_delta else 0 end),
      negative_signals = greatest(0, explore_creator_interactions.negative_signals + case when v_base_weight < 0 then v_delta else 0 end),
      updated_at = timezone('utc', now());
  end if;

  for v_topic in
    select distinct normalized.topic
    from (
      select lower(btrim(v_category)) as topic
      union all
      select lower(btrim(hashtag, ' #'))
      from public.explore_posts source_post,
           unnest(coalesce(source_post.hashtags, '{}'::text[])) as hashtag
      where source_post.id = v_post_id
    ) normalized
    where nullif(normalized.topic, '') is not null
  loop
    insert into public.explore_topic_interests (
      user_id, topic, interest_score, positive_signals, negative_signals, updated_at
    ) values (
      v_user_id,
      left(v_topic, 80),
      case when v_delta > 0 then greatest(-100, least(100, v_base_weight)) else 0 end,
      case when v_base_weight > 0 and v_delta > 0 then 1 else 0 end,
      case when v_base_weight < 0 and v_delta > 0 then 1 else 0 end,
      timezone('utc', now())
    )
    on conflict (user_id, topic) do update set
      interest_score = greatest(-100, least(100, explore_topic_interests.interest_score + v_weight)),
      positive_signals = greatest(0, explore_topic_interests.positive_signals + case when v_base_weight > 0 then v_delta else 0 end),
      negative_signals = greatest(0, explore_topic_interests.negative_signals + case when v_base_weight < 0 then v_delta else 0 end),
      updated_at = timezone('utc', now());
  end loop;

  return coalesce(new, old);
end;
$$;

drop trigger if exists explore_likes_recommendation_signal on public.explore_post_likes;
create trigger explore_likes_recommendation_signal
after insert or delete on public.explore_post_likes
for each row execute function public.explore_sync_recommendation_interaction();

drop trigger if exists explore_saves_recommendation_signal on public.explore_post_saves;
create trigger explore_saves_recommendation_signal
after insert or delete on public.explore_post_saves
for each row execute function public.explore_sync_recommendation_interaction();

drop trigger if exists explore_comments_recommendation_signal on public.explore_post_comments;
create trigger explore_comments_recommendation_signal
after insert or delete on public.explore_post_comments
for each row execute function public.explore_sync_recommendation_interaction();

drop trigger if exists explore_reports_recommendation_signal on public.explore_post_reports;
create trigger explore_reports_recommendation_signal
after insert or delete or update of status on public.explore_post_reports
for each row execute function public.explore_sync_recommendation_interaction();

create or replace function public.explore_sync_recommendation_follow()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_follower uuid := coalesce(new.follower_id, old.follower_id);
  v_creator uuid := coalesce(new.following_id, old.following_id);
  v_active boolean := tg_op <> 'DELETE';
begin
  if v_follower is null or v_creator is null or v_follower = v_creator then
    return coalesce(new, old);
  end if;

  insert into public.explore_creator_interactions (
    user_id, creator_id, interaction_score, positive_signals, follows, updated_at
  ) values (
    v_follower, v_creator, case when v_active then 8 else 0 end,
    case when v_active then 1 else 0 end, v_active, timezone('utc', now())
  )
  on conflict (user_id, creator_id) do update set
    interaction_score = greatest(-100, least(100,
      explore_creator_interactions.interaction_score + case when v_active then 8 else -8 end
    )),
    positive_signals = greatest(0,
      explore_creator_interactions.positive_signals + case when v_active then 1 else -1 end
    ),
    follows = v_active,
    updated_at = timezone('utc', now());

  return coalesce(new, old);
end;
$$;

drop trigger if exists explore_follows_recommendation_signal on public.explore_follows;
create trigger explore_follows_recommendation_signal
after insert or delete on public.explore_follows
for each row execute function public.explore_sync_recommendation_follow();

-- Passive client signals use one authenticated RPC. Values are clamped so a
-- broken client cannot create unbounded counters or dominate global quality.
create or replace function public.record_explore_recommendation_signal(
  p_post_id uuid,
  p_signal_type text,
  p_value numeric default 1,
  p_completion_rate numeric default null,
  p_surface text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_creator_id uuid;
  v_category text;
  v_topic text;
  v_signal text := lower(btrim(coalesce(p_signal_type, '')));
  v_amount numeric := greatest(0, least(coalesce(p_value, 0), 60));
  v_completion numeric := greatest(0, least(coalesce(p_completion_rate, 0), 1));
  v_weight numeric := 0;
  v_positive integer := 0;
  v_negative integer := 0;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if v_signal not in ('impression', 'view', 'watch', 'complete', 'rewatch', 'share', 'skip', 'hide') then
    raise exception 'Unsupported recommendation signal';
  end if;

  select post.user_id, lower(coalesce(nullif(post.category, ''), 'general'))
  into v_creator_id, v_category
  from public.explore_posts post
  where post.id = p_post_id;

  if not found then
    return;
  end if;

  insert into public.explore_content_signals (
    user_id, post_id, creator_id,
    impressions, views, watch_time_seconds, max_completion_rate,
    completions, rewatches, shares, skips, hides, last_interacted_at
  ) values (
    v_user_id,
    p_post_id,
    v_creator_id,
    case when v_signal = 'impression' then 1 else 0 end,
    case when v_signal = 'view' then 1 else 0 end,
    case when v_signal = 'watch' then v_amount else 0 end,
    case when v_signal in ('watch', 'complete', 'rewatch') then v_completion else 0 end,
    case when v_signal = 'complete' then 1 else 0 end,
    case when v_signal = 'rewatch' then 1 else 0 end,
    case when v_signal = 'share' then 1 else 0 end,
    case when v_signal = 'skip' then 1 else 0 end,
    case when v_signal = 'hide' then 1 else 0 end,
    timezone('utc', now())
  )
  on conflict (user_id, post_id) do update set
    creator_id = excluded.creator_id,
    impressions = least(1000, explore_content_signals.impressions + excluded.impressions),
    views = least(1000, explore_content_signals.views + excluded.views),
    watch_time_seconds = least(86400, explore_content_signals.watch_time_seconds + excluded.watch_time_seconds),
    max_completion_rate = greatest(explore_content_signals.max_completion_rate, excluded.max_completion_rate),
    completions = least(1000, explore_content_signals.completions + excluded.completions),
    rewatches = least(1000, explore_content_signals.rewatches + excluded.rewatches),
    shares = least(100, explore_content_signals.shares + excluded.shares),
    skips = least(1000, explore_content_signals.skips + excluded.skips),
    hides = least(10, explore_content_signals.hides + excluded.hides),
    last_interacted_at = timezone('utc', now());

  v_weight := case v_signal
    when 'view' then 0.5
    when 'watch' then least(v_amount, 30) * 0.18 + v_completion * 4
    when 'complete' then 6
    when 'rewatch' then 8
    when 'share' then 7
    when 'skip' then -7
    when 'hide' then -25
    else 0
  end;
  v_positive := case when v_weight > 0 then 1 else 0 end;
  v_negative := case when v_weight < 0 then 1 else 0 end;

  if v_creator_id is not null and v_creator_id <> v_user_id and v_weight <> 0 then
    insert into public.explore_creator_interactions (
      user_id, creator_id, interaction_score, positive_signals, negative_signals, updated_at
    ) values (
      v_user_id, v_creator_id, greatest(-100, least(100, v_weight)),
      v_positive, v_negative, timezone('utc', now())
    )
    on conflict (user_id, creator_id) do update set
      interaction_score = greatest(-100, least(100, explore_creator_interactions.interaction_score + v_weight)),
      positive_signals = least(10000, explore_creator_interactions.positive_signals + v_positive),
      negative_signals = least(10000, explore_creator_interactions.negative_signals + v_negative),
      updated_at = timezone('utc', now());
  end if;

  if v_weight <> 0 then
    for v_topic in
      select distinct normalized.topic
      from (
        select lower(btrim(v_category)) as topic
        union all
        select lower(btrim(hashtag, ' #'))
        from public.explore_posts source_post,
             unnest(coalesce(source_post.hashtags, '{}'::text[])) as hashtag
        where source_post.id = p_post_id
      ) normalized
      where nullif(normalized.topic, '') is not null
    loop
      insert into public.explore_topic_interests (
        user_id, topic, interest_score, positive_signals, negative_signals, updated_at
      ) values (
        v_user_id, left(v_topic, 80), greatest(-100, least(100, v_weight)),
        v_positive, v_negative, timezone('utc', now())
      )
      on conflict (user_id, topic) do update set
        interest_score = greatest(-100, least(100, explore_topic_interests.interest_score + v_weight)),
        positive_signals = least(10000, explore_topic_interests.positive_signals + v_positive),
        negative_signals = least(10000, explore_topic_interests.negative_signals + v_negative),
        updated_at = timezone('utc', now());
    end loop;
  end if;
end;
$$;

create or replace function public.get_recommended_feed(
  p_user_id uuid,
  p_limit integer default 24,
  p_offset integer default 0
)
returns table (
  id uuid,
  user_id uuid,
  author_name text,
  author_username text,
  author_avatar_url text,
  feed_scope text,
  body text,
  image_url text,
  audio_url text,
  video_url text,
  video_trim_start numeric,
  video_trim_end numeric,
  post_type text,
  category text,
  moderation_status text,
  audio_duration_seconds integer,
  post_privacy text,
  hashtags text[],
  mentions text[],
  media_meta jsonb,
  likes_count integer,
  comments_count integer,
  saves_count integer,
  created_at timestamptz,
  score double precision
)
language sql
stable
security definer
set search_path = public
as $$
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
    where post.feed_scope in ('feed', 'connections')
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
    ranked.hashtags, ranked.mentions, ranked.media_meta, ranked.likes_count,
    ranked.comments_count, ranked.saves_count, ranked.created_at,
    ranked.recommendation_score as score
  from scored ranked, viewer
  order by ranked.recommendation_score desc, ranked.created_at desc, ranked.id
  limit (select page_limit from viewer)
  offset (select page_offset from viewer);
$$;

create or replace function public.get_recommended_swip(
  p_user_id uuid,
  p_limit integer default 18,
  p_offset integer default 0
)
returns table (
  id uuid,
  user_id uuid,
  author_name text,
  author_username text,
  author_avatar_url text,
  feed_scope text,
  body text,
  image_url text,
  audio_url text,
  video_url text,
  video_trim_start numeric,
  video_trim_end numeric,
  post_type text,
  category text,
  moderation_status text,
  audio_duration_seconds integer,
  post_privacy text,
  hashtags text[],
  mentions text[],
  media_meta jsonb,
  likes_count integer,
  comments_count integer,
  saves_count integer,
  created_at timestamptz,
  score double precision
)
language sql
stable
security definer
set search_path = public
as $$
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
    where nullif(btrim(coalesce(post.video_url, '')), '') is not null
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
    ranked.hashtags, ranked.mentions, ranked.media_meta, ranked.likes_count,
    ranked.comments_count, ranked.saves_count, ranked.created_at,
    ranked.recommendation_score as score
  from scored ranked, viewer
  order by ranked.recommendation_score desc, ranked.created_at desc, ranked.id
  limit (select page_limit from viewer)
  offset (select page_offset from viewer);
$$;

create or replace function public.get_people_you_may_know(
  p_user_id uuid,
  p_limit integer default 20
)
returns table (
  user_id uuid,
  display_name text,
  username text,
  avatar_url text,
  bio text,
  account_type text,
  verified boolean,
  mutual_count bigint,
  score double precision,
  reason text
)
language sql
stable
security definer
set search_path = public
as $$
  with viewer as (
    select greatest(1, least(coalesce(p_limit, 20), 50)) as result_limit
    where auth.uid() = p_user_id
  ),
  following as (
    select following_id from public.explore_follows where follower_id = p_user_id
  ),
  mutuals as (
    select second_degree.following_id as candidate_id, count(distinct second_degree.follower_id)::bigint as mutual_count
    from public.explore_follows second_degree
    join following mine on mine.following_id = second_degree.follower_id
    where second_degree.following_id <> p_user_id
    group by second_degree.following_id
  ),
  my_entities as (
    select signal.post_id, signal.creator_id
    from public.explore_content_signals signal
    where signal.user_id = p_user_id
      and (signal.views > 0 or signal.likes > 0 or signal.comments > 0 or signal.saves > 0 or signal.shares > 0)
  ),
  shared_posts as (
    select signal.user_id as candidate_id, count(*)::bigint as shared_count
    from public.explore_content_signals signal
    join my_entities mine on mine.post_id = signal.post_id
    where signal.user_id <> p_user_id
      and (signal.views > 0 or signal.likes > 0 or signal.comments > 0 or signal.saves > 0 or signal.shares > 0)
    group by signal.user_id
  ),
  shared_creators as (
    select signal.user_id as candidate_id, count(distinct signal.creator_id)::bigint as shared_count
    from public.explore_content_signals signal
    join my_entities mine on mine.creator_id = signal.creator_id and mine.creator_id is not null
    where signal.user_id <> p_user_id
      and (signal.views > 0 or signal.likes > 0 or signal.comments > 0 or signal.saves > 0 or signal.shares > 0)
    group by signal.user_id
  ),
  chatted as (
    select distinct other_member.user_id as candidate_id
    from public.explore_conversation_members my_membership
    join public.explore_conversation_members other_member
      on other_member.conversation_id = my_membership.conversation_id
     and other_member.user_id <> p_user_id
    where my_membership.user_id = p_user_id
  ),
  scored as (
    select profile.*,
      coalesce(mutual.mutual_count, 0)::bigint as mutual_count_value,
      (
        coalesce(mutual.mutual_count, 0) * 10
        + least(coalesce(shared_creator.shared_count, 0), 5) * 4
        + least(coalesce(shared_post.shared_count, 0), 5) * 3
        + case when chat.candidate_id is not null then 9 else 0 end
        + case when follower.follower_id is not null then 4 else 0 end
        + case when local_match.same_area then 7 else 0 end
        + greatest(0, 2 - extract(epoch from (timezone('utc', now()) - profile.created_at)) / 2592000)
      )::double precision as recommendation_score,
      case
        when coalesce(mutual.mutual_count, 0) > 0 then coalesce(mutual.mutual_count, 0)::text || ' mutual connection' || case when mutual.mutual_count = 1 then '' else 's' end
        when chat.candidate_id is not null then 'You have chatted on KunThai'
        when coalesce(shared_creator.shared_count, 0) > 0 then 'You follow similar creators'
        when coalesce(shared_post.shared_count, 0) > 0 then 'Similar activity on KunThai'
        when local_match.same_area then 'In your area'
        when follower.follower_id is not null then 'Follows you'
        else 'Suggested for you'
      end as recommendation_reason
    from public.explore_profiles profile
    left join mutuals mutual on mutual.candidate_id = profile.user_id
    left join shared_posts shared_post on shared_post.candidate_id = profile.user_id
    left join shared_creators shared_creator on shared_creator.candidate_id = profile.user_id
    left join chatted chat on chat.candidate_id = profile.user_id
    left join public.explore_follows follower
      on follower.follower_id = profile.user_id and follower.following_id = p_user_id
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
      ) as same_area
      from public.explore_recommendation_privacy mine
      join public.explore_recommendation_privacy theirs on theirs.user_id = profile.user_id
      where mine.user_id = p_user_id
    ) local_match on true
    where profile.user_id <> p_user_id
      and not exists (select 1 from following where following_id = profile.user_id)
      and not exists (
        select 1 from public.explore_user_blocks block
        where (block.blocker_id = p_user_id and block.blocked_id = profile.user_id)
           or (block.blocker_id = profile.user_id and block.blocked_id = p_user_id)
      )
  )
  select
    ranked.user_id, ranked.display_name, ranked.username, ranked.avatar_url,
    ranked.bio, ranked.account_type, ranked.verified, ranked.mutual_count_value,
    ranked.recommendation_score, ranked.recommendation_reason
  from scored ranked, viewer
  order by ranked.recommendation_score desc, ranked.created_at desc, ranked.user_id
  limit (select result_limit from viewer);
$$;

-- Backfill durable likes/comments/saves/reports so recommendations improve on
-- day one. Passive watch and impression learning begins after this migration.
insert into public.explore_content_signals (
  user_id, post_id, creator_id, likes, comments, saves, reports, last_interacted_at
)
select
  interaction.user_id,
  interaction.post_id,
  post.user_id,
  sum(interaction.likes)::integer,
  sum(interaction.comments)::integer,
  sum(interaction.saves)::integer,
  sum(interaction.reports)::integer,
  max(interaction.interacted_at)
from (
  select post_id, user_id, 1 as likes, 0 as comments, 0 as saves, 0 as reports, created_at as interacted_at from public.explore_post_likes
  union all
  select post_id, user_id, 0, 1, 0, 0, created_at from public.explore_post_comments
  union all
  select post_id, user_id, 0, 0, 1, 0, created_at from public.explore_post_saves
  union all
  select post_id, user_id, 0, 0, 0, 1, created_at from public.explore_post_reports where status in ('open', 'reviewed')
) interaction
join public.explore_posts post on post.id = interaction.post_id
group by interaction.user_id, interaction.post_id, post.user_id
on conflict (user_id, post_id) do update set
  creator_id = excluded.creator_id,
  likes = greatest(explore_content_signals.likes, excluded.likes),
  comments = greatest(explore_content_signals.comments, excluded.comments),
  saves = greatest(explore_content_signals.saves, excluded.saves),
  reports = greatest(explore_content_signals.reports, excluded.reports),
  last_interacted_at = greatest(explore_content_signals.last_interacted_at, excluded.last_interacted_at);

insert into public.explore_creator_interactions (
  user_id, creator_id, interaction_score, positive_signals, negative_signals, follows, updated_at
)
select
  signal.user_id,
  signal.creator_id,
  greatest(-100, least(100,
    sum(signal.likes * 2.5 + signal.comments * 4 + signal.saves * 5 - signal.reports * 35)
  )),
  sum(signal.likes + signal.comments + signal.saves)::integer,
  sum(signal.reports)::integer,
  exists (
    select 1 from public.explore_follows follow
    where follow.follower_id = signal.user_id and follow.following_id = signal.creator_id
  ),
  timezone('utc', now())
from public.explore_content_signals signal
where signal.creator_id is not null and signal.creator_id <> signal.user_id
group by signal.user_id, signal.creator_id
on conflict (user_id, creator_id) do update set
  interaction_score = excluded.interaction_score,
  positive_signals = excluded.positive_signals,
  negative_signals = excluded.negative_signals,
  follows = excluded.follows,
  updated_at = excluded.updated_at;

insert into public.explore_topic_interests (
  user_id, topic, interest_score, positive_signals, negative_signals, updated_at
)
select
  signal.user_id,
  left(lower(coalesce(nullif(post.category, ''), 'general')), 80),
  greatest(-100, least(100,
    sum(signal.likes * 2.5 + signal.comments * 4 + signal.saves * 5 - signal.reports * 35)
  )),
  sum(signal.likes + signal.comments + signal.saves)::integer,
  sum(signal.reports)::integer,
  timezone('utc', now())
from public.explore_content_signals signal
join public.explore_posts post on post.id = signal.post_id
group by signal.user_id, left(lower(coalesce(nullif(post.category, ''), 'general')), 80)
on conflict (user_id, topic) do update set
  interest_score = excluded.interest_score,
  positive_signals = excluded.positive_signals,
  negative_signals = excluded.negative_signals,
  updated_at = excluded.updated_at;

revoke all on function public.record_explore_recommendation_signal(uuid, text, numeric, numeric, text) from public;
revoke all on function public.get_recommended_feed(uuid, integer, integer) from public;
revoke all on function public.get_recommended_swip(uuid, integer, integer) from public;
revoke all on function public.get_people_you_may_know(uuid, integer) from public;

grant execute on function public.record_explore_recommendation_signal(uuid, text, numeric, numeric, text) to authenticated;
grant execute on function public.get_recommended_feed(uuid, integer, integer) to authenticated;
grant execute on function public.get_recommended_swip(uuid, integer, integer) to authenticated;
grant execute on function public.get_people_you_may_know(uuid, integer) to authenticated;
grant select on public.explore_content_signals, public.explore_topic_interests, public.explore_creator_interactions to authenticated;
grant select, insert, update, delete on public.explore_recommendation_privacy to authenticated;

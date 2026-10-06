-- Explore discovery: people you likely know first, deactivated accounts hidden.
--
-- 1. Posts by deactivated accounts are hidden everywhere: a restrictive read
--    rule on explore_posts (the owner and KunThai admins still see them), plus
--    the ranked UrFeed/Swip functions, which run with elevated rights.
-- 2. UrFeed/Swip: creators you likely know (they follow you, you have
--    chatted, or 2+ people you follow follow them) rank below people you
--    follow and above nearby strangers.
-- 3. Suggested accounts are rebuilt: follows you > mutual connections >
--    chatted > near you > similar interests > new members. The old "phone
--    region" (a country code, i.e. everyone), first-name match and the large
--    new-account boost are gone; same-city is counted once. Each row now
--    carries the signals behind it, which drive the reason label and the
--    filter on the suggestions card. Deactivated and guest accounts are
--    excluded.

-- Runs with elevated rights so the rule never depends on who can read
-- explore_profiles; it only answers yes/no for one author.
create or replace function public.explore_author_is_deactivated(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.explore_profiles author
    where author.user_id = p_user_id and author.deactivated_at is not null
  );
$$;

revoke all on function public.explore_author_is_deactivated(uuid) from public;
grant execute on function public.explore_author_is_deactivated(uuid) to anon, authenticated;

drop policy if exists "posts of deactivated accounts are hidden" on public.explore_posts;
create policy "posts of deactivated accounts are hidden"
on public.explore_posts
as restrictive
for select
to authenticated
using (
  user_id = auth.uid()
  or public.is_kunthai_admin()
  or not public.explore_author_is_deactivated(explore_posts.user_id)
);

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
      -- "Likely know": they follow you, you have chatted, or 2+ people you
      -- follow also follow them. Ranks below people you follow, above
      -- nearby strangers.
      (
        exists (
          select 1 from public.explore_follows back
          where back.follower_id = pool.user_id and back.following_id = p_user_id
        )
        or exists (
          select 1
          from public.explore_conversation_members mine
          join public.explore_conversation_members theirs
            on theirs.conversation_id = mine.conversation_id and theirs.user_id = pool.user_id
          where mine.user_id = p_user_id
        )
        or (
          select count(*)
          from public.explore_follows mine
          join public.explore_follows theirs
            on theirs.follower_id = mine.following_id and theirs.following_id = pool.user_id
          where mine.follower_id = p_user_id
        ) >= 2
      ) as likely_know,
      -- Deactivated accounts' posts are hidden from everyone but their owner.
      (
        pool.user_id <> p_user_id
        and exists (
          select 1 from public.explore_profiles author
          where author.user_id = pool.user_id and author.deactivated_at is not null
        )
      ) as author_deactivated,
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
        + case when enriched.likely_know and not enriched.is_followed then 34 else 0 end
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
  where not ranked.author_deactivated
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
      -- "Likely know": they follow you, you have chatted, or 2+ people you
      -- follow also follow them. Ranks below people you follow, above
      -- nearby strangers.
      (
        exists (
          select 1 from public.explore_follows back
          where back.follower_id = pool.user_id and back.following_id = p_user_id
        )
        or exists (
          select 1
          from public.explore_conversation_members mine
          join public.explore_conversation_members theirs
            on theirs.conversation_id = mine.conversation_id and theirs.user_id = pool.user_id
          where mine.user_id = p_user_id
        )
        or (
          select count(*)
          from public.explore_follows mine
          join public.explore_follows theirs
            on theirs.follower_id = mine.following_id and theirs.following_id = pool.user_id
          where mine.follower_id = p_user_id
        ) >= 2
      ) as likely_know,
      -- Deactivated accounts' posts are hidden from everyone but their owner.
      (
        pool.user_id <> p_user_id
        and exists (
          select 1 from public.explore_profiles author
          where author.user_id = pool.user_id and author.deactivated_at is not null
        )
      ) as author_deactivated,
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
        + case when enriched.likely_know and not enriched.is_followed then 28 else 0 end
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
  where not ranked.author_deactivated
  order by ranked.hardened_score desc, ranked.created_at desc, ranked.id
  limit (select page_limit from settings)
  offset (select page_offset from settings);
$$;


-- Return columns change (signal flags), so the function is recreated.
drop function if exists public.get_people_you_may_know_v2(uuid, integer);

create function public.get_people_you_may_know_v2(
  p_user_id uuid,
  p_limit integer default 20
)
returns table (
  user_id uuid, display_name text, username text, avatar_url text, bio text,
  account_type text, verified boolean, mutual_count bigint, score double precision, reason text,
  reason_kind text, follows_you boolean, chatted boolean, is_nearby boolean, is_new boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with settings as (
    select greatest(1, least(coalesce(p_limit, 20), 200)) as result_limit
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
  candidates as (
    select profile.user_id, profile.display_name, profile.username, profile.avatar_url, profile.bio,
      profile.account_type, profile.verified, profile.created_at,
      coalesce(mutual.mutual_count, 0)::bigint as mutual_count,
      coalesce(shared_creator.shared_count, 0) as shared_creators,
      (follower.follower_id is not null) as follows_you,
      (chat.candidate_id is not null) as chatted,
      coalesce(local_match.same_area, false) as is_nearby,
      (profile.created_at > timezone('utc', now()) - interval '14 days') as is_new
    from public.explore_profiles profile
    left join mutuals mutual on mutual.candidate_id = profile.user_id
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
      and profile.deactivated_at is null
      and not public.kunthai_user_is_guest(profile.user_id)
      and not exists (select 1 from following where following_id = profile.user_id)
      and not exists (
        select 1 from public.explore_user_blocks block
        where (block.blocker_id = p_user_id and block.blocked_id = profile.user_id)
           or (block.blocker_id = profile.user_id and block.blocked_id = p_user_id)
      )
  ),
  scored as (
    select candidates.*,
      (
        case when follows_you then 40 else 0 end
        + least(mutual_count, 10) * 12
        + case when chatted then 20 else 0 end
        + case when is_nearby then 15 else 0 end
        + least(shared_creators, 5) * 3
        -- Small fading welcome for new members (8 on day one, 0 after 30 days).
        + greatest(0, 8 - extract(epoch from (timezone('utc', now()) - created_at)) / 86400 * 8 / 30)
        -- Tiny daily rotation so equal scores do not always show in the same order.
        + mod(abs(hashtext(candidates.user_id::text || current_date::text))::bigint, 100)::double precision / 100
      )::double precision as score,
      case
        when follows_you then 'follows_you'
        when mutual_count > 0 then 'mutual'
        when chatted then 'chatted'
        when is_nearby then 'nearby'
        when shared_creators > 0 then 'interests'
        when is_new then 'new'
        else 'suggested'
      end as reason_kind
    from candidates
  )
  select scored.user_id, scored.display_name, scored.username, scored.avatar_url, scored.bio,
    scored.account_type, scored.verified, scored.mutual_count, scored.score,
    case scored.reason_kind
      when 'follows_you' then 'Follows you'
      when 'mutual' then scored.mutual_count::text || ' mutual connection' || case when scored.mutual_count = 1 then '' else 's' end
      when 'chatted' then 'You have chatted on KunThai'
      when 'nearby' then 'Near you'
      when 'interests' then 'You follow similar creators'
      when 'new' then 'New to KunThai'
      else 'Suggested for you'
    end,
    scored.reason_kind, scored.follows_you, scored.chatted, scored.is_nearby, scored.is_new
  from scored, settings
  order by scored.score desc, scored.created_at desc, scored.user_id
  limit (select result_limit from settings);
$$;

revoke all on function public.get_people_you_may_know_v2(uuid, integer) from public;
grant execute on function public.get_people_you_may_know_v2(uuid, integer) to authenticated;

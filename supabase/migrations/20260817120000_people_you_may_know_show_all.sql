-- Explore Connections "Discover": show everyone, and surface people as they
-- join. Previously the suggestion pool was a small score-ranked top set (base
-- capped at 50, v2 wrapped it at 50, and the client sliced to 30), and newly
-- joined accounts with no connections/activity always ranked at the very bottom
-- -- so new members never appeared and the list looked frozen. This keeps the
-- existing relevance ordering and the only exclusions (self, already-connected,
-- and blocks in either direction) but:
--   * strongly boosts recently-joined accounts so new members surface,
--   * raises the caps so the pool is effectively "all eligible users".
-- The client is updated separately to request and render the larger list.

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
        -- Recently-joined accounts get a decaying boost (about +30 on the day
        -- they join, fading to 0 over 30 days) so new members appear in Discover
        -- instead of always sinking below established, well-connected accounts.
        + greatest(0, 30 - extract(epoch from (timezone('utc', now()) - profile.created_at)) / 86400)
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
    select greatest(1, least(coalesce(p_limit, 20), 200)) as result_limit
    where auth.uid() = p_user_id
  ),
  pool as (
    select * from public.get_people_you_may_know(p_user_id, 200)
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

grant execute on function public.get_people_you_may_know(uuid, integer) to authenticated;
grant execute on function public.get_people_you_may_know_v2(uuid, integer) to authenticated;

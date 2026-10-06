-- 1. Deactivated accounts keep their old comments but cannot comment or
--    reply until they reactivate (enforced here, whatever the client does).
-- 2. Suggested accounts also return follower_count, for the "Popular"
--    filter (most-followed accounts first).
-- Requires 20261006150000 (explore_author_is_deactivated).

create or replace function public.block_comments_from_deactivated_accounts()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if public.explore_author_is_deactivated(new.user_id) then
    raise exception 'Your account is deactivated. Reactivate it to comment.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists explore_comments_block_deactivated on public.explore_post_comments;
create trigger explore_comments_block_deactivated
before insert on public.explore_post_comments
for each row execute function public.block_comments_from_deactivated_accounts();

-- Adds follower_count (for the "Popular" filter); return columns change, so
-- the function is recreated. Ranking is unchanged from 20261006150000.
drop function if exists public.get_people_you_may_know_v2(uuid, integer);

create function public.get_people_you_may_know_v2(
  p_user_id uuid,
  p_limit integer default 20
)
returns table (
  user_id uuid, display_name text, username text, avatar_url text, bio text,
  account_type text, verified boolean, mutual_count bigint, score double precision, reason text,
  reason_kind text, follows_you boolean, chatted boolean, is_nearby boolean, is_new boolean,
  follower_count bigint
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
  follower_counts as (
    select follow.following_id as candidate_id, count(*)::bigint as follower_count
    from public.explore_follows follow
    group by follow.following_id
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
      (profile.created_at > timezone('utc', now()) - interval '14 days') as is_new,
      coalesce(follower_count.follower_count, 0)::bigint as follower_count
    from public.explore_profiles profile
    left join mutuals mutual on mutual.candidate_id = profile.user_id
    left join shared_creators shared_creator on shared_creator.candidate_id = profile.user_id
    left join chatted chat on chat.candidate_id = profile.user_id
    left join follower_counts follower_count on follower_count.candidate_id = profile.user_id
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
    scored.reason_kind, scored.follows_you, scored.chatted, scored.is_nearby, scored.is_new,
    scored.follower_count
  from scored, settings
  order by scored.score desc, scored.created_at desc, scored.user_id
  limit (select result_limit from settings);
$$;

revoke all on function public.get_people_you_may_know_v2(uuid, integer) from public;
grant execute on function public.get_people_you_may_know_v2(uuid, integer) to authenticated;

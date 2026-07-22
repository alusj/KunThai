-- Account deletion fix: deleting an auth user cascades into likes, saves,
-- comments, and reports — both the deleted user's own interactions and other
-- users' interactions on the deleted user's posts. The recommendation trigger
-- then tried to write signal rows referencing a user or creator that was
-- already gone and hit a foreign key, aborting the whole account deletion.
-- Signal upkeep is best-effort analytics: when the referenced accounts are
-- mid-deletion their signal rows are being cascade-deleted anyway, so the
-- trigger now skips those writes instead of failing the deletion.

create or replace function public.explore_sync_recommendation_interaction()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
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

  -- Deletion guard: while an account is being deleted, its interaction rows
  -- cascade away after the auth.users row is already gone. Recording signals
  -- for a user that no longer exists would violate the signals foreign key
  -- and abort the account deletion itself.
  if tg_op = 'DELETE' and not exists (select 1 from auth.users u where u.id = v_user_id) then
    return old;
  end if;

  select post.user_id, lower(coalesce(nullif(post.category, ''), 'general'))
  into v_creator_id, v_category
  from public.explore_posts post
  where post.id = v_post_id;

  if v_creator_id is null or v_user_id is null then
    return coalesce(new, old);
  end if;

  -- Same guard for the post's creator: their account may be mid-deletion while
  -- other users' interactions on their posts cascade away.
  if tg_op = 'DELETE' and not exists (select 1 from auth.users u where u.id = v_creator_id) then
    return old;
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
exception
  -- Last-resort guard: during multi-table delete cascades the existence checks
  -- above can race the cascade order. A signal row is never worth aborting a
  -- row removal for.
  when foreign_key_violation then
    if tg_op = 'DELETE' then
      return old;
    end if;
    raise;
end;
$function$;

-- The follow trigger has the same failure mode: when a deleted account's
-- follow rows cascade away, it must not re-create interaction rows that
-- reference an account that no longer exists.
create or replace function public.explore_sync_recommendation_follow()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_follower uuid := coalesce(new.follower_id, old.follower_id);
  v_creator uuid := coalesce(new.following_id, old.following_id);
  v_active boolean := tg_op <> 'DELETE';
begin
  if v_follower is null or v_creator is null or v_follower = v_creator then
    return coalesce(new, old);
  end if;

  if tg_op = 'DELETE' and (
    not exists (select 1 from auth.users u where u.id = v_follower)
    or not exists (select 1 from auth.users u where u.id = v_creator)
  ) then
    return old;
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
exception
  when foreign_key_violation then
    if tg_op = 'DELETE' then
      return old;
    end if;
    raise;
end;
$function$;

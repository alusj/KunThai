-- Space inbox, Space activity badges and UrMall store search.
--
-- 1. Space-owned conversations. Messaging a Space used to open a direct chat
--    with the Space OWNER's personal account, so moderators and support staff
--    could never see or answer it, and the owner's personal inbox filled with
--    Space customers. A Space conversation now belongs to the Space
--    (explore_conversations.space_id): the person messaging is the only
--    participant, and every active team member allowed to reply to messages
--    reads and answers it as the Space.
-- 2. Space activity badges: notifications about a Space's posts are tagged with
--    the Space, and one RPC returns per-Space unread counts for the account
--    switcher.
-- 3. search_marketplace_stores: store search by business name, UrMall ID or
--    the owner's name, with each store's live listing count.

-- ---------------------------------------------------------------------------
-- 1. Space-owned conversations
-- ---------------------------------------------------------------------------

alter table public.explore_conversations
  add column if not exists space_id uuid references public.explore_spaces(id) on delete cascade;

create index if not exists explore_conversations_space_idx
  on public.explore_conversations (space_id, updated_at desc)
  where space_id is not null;

-- Mirrors normalizeSpaceResponsibilities (spaceService.js): an explicit
-- canReplyMessages flag wins, otherwise the role default applies. The owner can
-- always answer their own Space.
create or replace function public.explore_space_can_reply_messages(space_uuid uuid, user_uuid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select user_uuid is not null and (
    exists (
      select 1 from public.explore_spaces space
      where space.id = space_uuid and space.owner_user_id = user_uuid
    )
    or exists (
      select 1
      from public.explore_space_members member
      where member.space_id = space_uuid
        and member.user_id = user_uuid
        and member.status = 'active'
        and case
          when member.responsibilities ? 'canReplyMessages'
            then lower(member.responsibilities ->> 'canReplyMessages') = 'true'
          else member.role in ('owner', 'administrator', 'moderator', 'customer_support')
        end
    )
  );
$$;

revoke all on function public.explore_space_can_reply_messages(uuid, uuid) from public;
grant execute on function public.explore_space_can_reply_messages(uuid, uuid) to authenticated;

-- Every conversation/message/member policy goes through this function, so the
-- Space team gains read/reply access to the Space's threads in one place.
create or replace function public.explore_is_conversation_member(conversation_uuid uuid, user_uuid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select user_uuid = auth.uid()
    and exists (
      select 1
      from public.explore_conversations conversation
      where conversation.id = conversation_uuid
        and (
          user_uuid = any(conversation.participant_ids)
          or exists (
            select 1
            from public.explore_conversation_members member
            where member.conversation_id = conversation.id
              and member.user_id = user_uuid
          )
          or (
            conversation.space_id is not null
            and public.explore_space_can_reply_messages(conversation.space_id, user_uuid)
          )
        )
    );
$$;

-- Opens (or creates) the one thread between a person and a Space.
--   * customer_user_id omitted: the caller is messaging the Space.
--   * customer_user_id given: a Space team member opens the thread with that
--     person (it arrives as a message request until they reply or accept).
create or replace function public.get_or_create_explore_space_conversation(
  target_space_id uuid,
  customer_user_id uuid default null
)
returns public.explore_conversations
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_user_id uuid := auth.uid();
  space_row public.explore_spaces;
  customer uuid;
  team_initiated boolean := false;
  canonical_key text;
  selected_conversation public.explore_conversations;
begin
  if actor_user_id is null then
    raise exception 'Authentication is required to message a Space.' using errcode = '28000';
  end if;

  select * into space_row from public.explore_spaces where id = target_space_id;
  if space_row.id is null then
    raise exception 'This Space is no longer available.' using errcode = 'P0002';
  end if;

  if customer_user_id is not null and customer_user_id <> actor_user_id then
    if not public.explore_space_can_reply_messages(target_space_id, actor_user_id) then
      raise exception 'You need a Space team responsibility that can reply to messages.' using errcode = '42501';
    end if;
    if not exists (select 1 from auth.users where id = customer_user_id) then
      raise exception 'The recipient account does not exist.' using errcode = '22023';
    end if;
    if public.explore_space_can_reply_messages(target_space_id, customer_user_id) then
      raise exception 'This person is on the Space team.' using errcode = '22023';
    end if;
    customer := customer_user_id;
    team_initiated := true;
  else
    if space_row.status is distinct from 'active' then
      raise exception 'This Space is not accepting messages.' using errcode = '42501';
    end if;
    if public.explore_space_can_reply_messages(target_space_id, actor_user_id) then
      raise exception 'You manage this Space. Switch to it to read its messages.' using errcode = '22023';
    end if;
    customer := actor_user_id;
  end if;

  canonical_key := 'space:' || target_space_id::text || ':' || customer::text;

  select * into selected_conversation
  from public.explore_conversations
  where conversation_key = canonical_key;

  if selected_conversation.id is null then
    insert into public.explore_conversations (created_by, participant_ids, conversation_key, request, space_id, updated_at)
    values (actor_user_id, array[customer], canonical_key, team_initiated, target_space_id, timezone('utc', now()))
    on conflict (conversation_key) where conversation_key is not null
    do update set updated_at = public.explore_conversations.updated_at
    returning * into selected_conversation;
  end if;

  insert into public.explore_conversation_members (conversation_id, user_id)
  values (selected_conversation.id, customer)
  on conflict (conversation_id, user_id) do nothing;

  return selected_conversation;
end;
$$;

revoke all on function public.get_or_create_explore_space_conversation(uuid, uuid) from public;
grant execute on function public.get_or_create_explore_space_conversation(uuid, uuid) to authenticated;

-- Team replies always carry the Space identity (name, avatar, the answering
-- member's role), whatever the client sent; the customer's own messages never
-- carry a Space actor.
create or replace function public.stamp_explore_space_message_actor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  conversation_space uuid;
  conversation_participants uuid[];
  space_row record;
  member_role text;
  staff_name text;
begin
  select conversation.space_id, conversation.participant_ids
  into conversation_space, conversation_participants
  from public.explore_conversations conversation
  where conversation.id = new.conversation_id;

  if conversation_space is null then
    return new;
  end if;

  if new.sender_id = any(conversation_participants) then
    new.metadata := coalesce(new.metadata, '{}'::jsonb) - 'actor';
    return new;
  end if;

  select space.id, space.name, space.avatar_url, space.owner_user_id
  into space_row
  from public.explore_spaces space
  where space.id = conversation_space;

  select member.role into member_role
  from public.explore_space_members member
  where member.space_id = conversation_space
    and member.user_id = new.sender_id
    and member.status = 'active'
  limit 1;

  select coalesce(nullif(profile.display_name, ''), profile.username) into staff_name
  from public.explore_profiles profile
  where profile.user_id = new.sender_id;

  new.metadata := coalesce(new.metadata, '{}'::jsonb) || jsonb_build_object(
    'actor', jsonb_build_object(
      'actorType', 'space',
      'actorId', space_row.id,
      'spaceId', space_row.id,
      'actorName', coalesce(space_row.name, 'Space'),
      'actorAvatarUrl', coalesce(space_row.avatar_url, ''),
      'actorRole', coalesce(member_role, case when space_row.owner_user_id = new.sender_id then 'owner' else 'member' end),
      'staffUserId', new.sender_id,
      'staffName', coalesce(staff_name, '')
    )
  );
  return new;
end;
$$;

drop trigger if exists explore_messages_stamp_space_actor on public.explore_messages;
create trigger explore_messages_stamp_space_actor
  before insert on public.explore_messages
  for each row execute function public.stamp_explore_space_message_actor();

-- In a Space thread only the customer's reply accepts a team-initiated request
-- (a second team member answering must not accept it on the customer's behalf).
create or replace function public.accept_explore_request_on_reply()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.explore_conversations
  set request = false,
      updated_at = timezone('utc', now())
  where id = new.conversation_id
    and request = true
    and created_by is distinct from new.sender_id
    and (space_id is null or new.sender_id = any(participant_ids));
  return new;
end;
$$;

-- Push: a customer's message reaches every team member who can reply; a team
-- reply reaches the customer, titled with the Space name.
create or replace function public.notify_push_on_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recipients uuid[];
  preview text;
  push_title text := 'New message on KunThai';
  conversation_space uuid;
  conversation_participants uuid[];
  space_name text;
begin
  select conversation.space_id, conversation.participant_ids
  into conversation_space, conversation_participants
  from public.explore_conversations conversation
  where conversation.id = new.conversation_id;

  if conversation_space is not null then
    select space.name into space_name from public.explore_spaces space where space.id = conversation_space;
    if new.sender_id = any(conversation_participants) then
      select array_agg(distinct team.user_id) into recipients
      from (
        select space.owner_user_id as user_id from public.explore_spaces space where space.id = conversation_space
        union
        select member.user_id from public.explore_space_members member
        where member.space_id = conversation_space and member.status = 'active'
      ) team
      where team.user_id is not null
        and team.user_id <> new.sender_id
        and public.explore_space_can_reply_messages(conversation_space, team.user_id);
      push_title := 'New message for ' || coalesce(nullif(space_name, ''), 'your Space');
    else
      select array_agg(participant) into recipients
      from unnest(conversation_participants) participant
      where participant <> new.sender_id;
      push_title := coalesce(nullif(space_name, ''), 'A Space') || ' replied';
    end if;
  else
    select array_agg(user_id) into recipients
    from public.explore_conversation_members
    where conversation_id = new.conversation_id and user_id <> new.sender_id;
  end if;

  preview := case coalesce(new.media_type, 'text')
    when 'audio' then 'Voice note'
    when 'image' then 'Photo'
    when 'video' then 'Video'
    else left(coalesce(nullif(new.body, ''), 'New message'), 120)
  end;

  perform public.send_kunthai_push(
    recipients,
    push_title,
    preview,
    'conversation:' || new.conversation_id,
    'kunthai-message-' || new.conversation_id
  );
  return new;
exception when others then
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Space activity badges
-- ---------------------------------------------------------------------------

-- Likes, comments and shares on a Space's post are delivered to the member who
-- published it; tag them with the Space so the switcher can badge it. Only the
-- post author's own notification is tagged — a reply to someone else's comment
-- under a Space post is that person's personal activity.
create or replace function public.tag_explore_notification_space()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.recipient_space_id is null and new.post_id is not null then
    select post.space_id into new.recipient_space_id
    from public.explore_posts post
    where post.id = new.post_id
      and post.space_id is not null
      and post.user_id = new.user_id;
  end if;
  return new;
end;
$$;

drop trigger if exists explore_notifications_tag_space on public.explore_notifications;
create trigger explore_notifications_tag_space
  before insert on public.explore_notifications
  for each row execute function public.tag_explore_notification_space();

create index if not exists explore_notifications_space_unread_idx
  on public.explore_notifications (user_id, recipient_space_id, created_at desc)
  where recipient_space_id is not null and read = false;

-- Per-Space activity for the caller since they last opened each Space.
-- `seen` maps space id → ISO timestamp of the last visit (kept on the device);
-- unread Space messages count until a team member reads them.
create or replace function public.get_my_explore_space_activity(seen jsonb default '{}'::jsonb)
returns table (
  space_id uuid,
  reactions integer,
  comments integer,
  shares integer,
  follows integer,
  other_activity integer,
  unread_messages integer,
  latest_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  caller uuid := auth.uid();
begin
  if caller is null then
    return;
  end if;

  return query
  with my_spaces as (
    select space.id as sid from public.explore_spaces space where space.owner_user_id = caller
    union
    select member.space_id from public.explore_space_members member
    where member.user_id = caller and member.status = 'active'
  ),
  last_seen as (
    select my_spaces.sid,
      case
        when coalesce(seen ->> my_spaces.sid::text, '') ~ '^\d{4}-\d{2}-\d{2}'
          then (seen ->> my_spaces.sid::text)::timestamptz
        else timezone('utc', now()) - interval '30 days'
      end as since
    from my_spaces
  ),
  activity as (
    select notification.recipient_space_id as sid, notification.type, notification.created_at
    from public.explore_notifications notification
    join last_seen on last_seen.sid = notification.recipient_space_id
    where notification.user_id = caller
      and notification.read = false
      and notification.created_at > last_seen.since
  ),
  inbox as (
    select conversation.space_id as sid, count(*)::integer as unread, max(message.created_at) as latest
    from public.explore_conversations conversation
    join my_spaces on my_spaces.sid = conversation.space_id
    join public.explore_messages message on message.conversation_id = conversation.id
    where message.read = false
      and message.sender_id = any(conversation.participant_ids)
      and public.explore_space_can_reply_messages(conversation.space_id, caller)
    group by conversation.space_id
  )
  select
    my_spaces.sid,
    (select count(*) from activity where activity.sid = my_spaces.sid and activity.type in ('reaction', 'like', 'save'))::integer,
    (select count(*) from activity where activity.sid = my_spaces.sid and activity.type in ('comment', 'reply', 'mention'))::integer,
    (select count(*) from activity where activity.sid = my_spaces.sid and activity.type in ('share', 'repost'))::integer,
    (select count(*) from activity where activity.sid = my_spaces.sid and activity.type in ('follow', 'connect'))::integer,
    (select count(*) from activity where activity.sid = my_spaces.sid
      and activity.type not in ('reaction', 'like', 'save', 'comment', 'reply', 'mention', 'share', 'repost', 'follow', 'connect'))::integer,
    coalesce((select inbox.unread from inbox where inbox.sid = my_spaces.sid), 0),
    greatest(
      (select max(activity.created_at) from activity where activity.sid = my_spaces.sid),
      (select inbox.latest from inbox where inbox.sid = my_spaces.sid)
    )
  from my_spaces;
end;
$$;

revoke all on function public.get_my_explore_space_activity(jsonb) from public;
grant execute on function public.get_my_explore_space_activity(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. UrMall store search
-- ---------------------------------------------------------------------------

-- Finds discoverable stores by business name, public UrMall ID (UM-12345) or
-- the owner's Explore name/username, so "the shop Aminata runs" is findable
-- even when the shopper doesn't know the store's name. listing_count spans
-- every vertical (products, menu items, rooms, property listings).
create or replace function public.search_marketplace_stores(search_query text, result_limit integer default 8)
returns table (
  id uuid,
  business_name text,
  business_kind text,
  city text,
  country text,
  logo_url text,
  verification_status text,
  public_business_id text,
  owner_name text,
  owner_match boolean,
  listing_count integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  needle text := lower(btrim(coalesce(search_query, '')));
  pattern text;
begin
  if length(needle) < 2 then
    return;
  end if;
  pattern := '%' || replace(replace(replace(needle, '\', '\\'), '%', '\%'), '_', '\_') || '%';

  return query
  with candidates as (
    select
      business.*,
      profile.display_name as profile_name,
      profile.username as profile_username,
      lower(business.business_name) like pattern as name_hit,
      lower(coalesce(business.public_business_id, '')) like pattern as code_hit,
      (lower(coalesce(profile.display_name, '')) like pattern or lower(coalesce(profile.username, '')) like pattern) as owner_hit
    from public.marketplace_businesses business
    left join public.explore_profiles profile on profile.user_id = business.user_id
    where business.discoverable_nearby = true
  )
  select
    candidate.id,
    candidate.business_name,
    coalesce(candidate.business_kind, 'retail'),
    coalesce(candidate.city, ''),
    coalesce(candidate.country, ''),
    coalesce(candidate.logo_url, ''),
    coalesce(candidate.verification_status, 'pending'),
    coalesce(candidate.public_business_id, ''),
    case when candidate.owner_hit then coalesce(nullif(candidate.profile_name, ''), candidate.profile_username, '') else '' end,
    candidate.owner_hit and not candidate.name_hit,
    (
      (select count(*) from public.marketplace_products item
        where item.business_id = candidate.id and item.status = 'active' and item.stock > 0)
      + (select count(*) from public.marketplace_restaurant_menu_items item
        where item.business_id = candidate.id and item.available = true)
      + (select count(*) from public.marketplace_hotel_rooms item
        where item.business_id = candidate.id and item.active = true)
      + (select count(*) from public.marketplace_property_listings item
        where item.business_id = candidate.id and item.published = true
          and item.availability_status = 'available' and item.expires_at > now())
    )::integer
  from candidates candidate
  where candidate.name_hit or candidate.code_hit or candidate.owner_hit
  order by
    (lower(candidate.business_name) = needle) desc,
    (lower(candidate.business_name) like needle || '%') desc,
    candidate.name_hit desc,
    candidate.code_hit desc,
    candidate.business_name
  limit greatest(1, least(coalesce(result_limit, 8), 20));
end;
$$;

revoke all on function public.search_marketplace_stores(text, integer) from public;
grant execute on function public.search_marketplace_stores(text, integer) to anon, authenticated;

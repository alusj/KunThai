-- Make first-contact Explore messages land in Requests for the recipient while
-- keeping the sender's pending conversation in their normal inbox.

create or replace function public.get_or_create_explore_direct_conversation(
  recipient_user_id uuid
)
returns public.explore_conversations
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_user_id uuid := auth.uid();
  canonical_participants uuid[];
  canonical_key text;
  selected_conversation public.explore_conversations;
  recipient_message_mode text := 'followers';
  recipient_follows_actor boolean := false;
  actor_follows_recipient boolean := false;
  should_request boolean := true;
begin
  if actor_user_id is null then
    raise exception 'Authentication is required to create a conversation.' using errcode = '28000';
  end if;

  if recipient_user_id is null or recipient_user_id = actor_user_id then
    raise exception 'A different recipient is required.' using errcode = '22023';
  end if;

  if not exists (select 1 from auth.users where id = recipient_user_id) then
    raise exception 'The recipient account does not exist.' using errcode = '22023';
  end if;

  canonical_participants := array[
    least(actor_user_id, recipient_user_id),
    greatest(actor_user_id, recipient_user_id)
  ];
  canonical_key := array_to_string(canonical_participants, '__');

  select conversation.*
  into selected_conversation
  from public.explore_conversations conversation
  where conversation.conversation_key = canonical_key
    or (
      cardinality(conversation.participant_ids) = 2
      and conversation.participant_ids @> canonical_participants
      and conversation.participant_ids <@ canonical_participants
    )
    or conversation.id in (
      select member.conversation_id
      from public.explore_conversation_members member
      group by member.conversation_id
      having count(distinct member.user_id) = 2
        and count(distinct member.user_id) filter (where member.user_id = any(canonical_participants)) = 2
    )
  order by (conversation.conversation_key = canonical_key) desc, conversation.created_at
  limit 1;

  if selected_conversation.id is null then
    if to_regclass('public.explore_user_privacy_settings') is not null then
      execute $privacy$
        select coalesce(nullif(lower(settings->>'allowMessages'), ''), 'followers')
        from public.explore_user_privacy_settings
        where user_id = $1
      $privacy$
      into recipient_message_mode
      using recipient_user_id;
    end if;
    recipient_message_mode := coalesce(recipient_message_mode, 'followers');

    select exists (
      select 1 from public.explore_follows
      where follower_id = recipient_user_id and following_id = actor_user_id
    ) into recipient_follows_actor;

    select exists (
      select 1 from public.explore_follows
      where follower_id = actor_user_id and following_id = recipient_user_id
    ) into actor_follows_recipient;

    if recipient_message_mode = 'none' then
      raise exception 'This account is not accepting new messages.' using errcode = '42501';
    end if;

    if recipient_message_mode = 'followers' and not actor_follows_recipient and not recipient_follows_actor then
      raise exception 'Follow this account before sending a message request.' using errcode = '42501';
    end if;

    should_request := not recipient_follows_actor;

    insert into public.explore_conversations (
      created_by,
      participant_ids,
      conversation_key,
      request,
      updated_at
    )
    values (
      actor_user_id,
      canonical_participants,
      canonical_key,
      should_request,
      timezone('utc', now())
    )
    on conflict (conversation_key) where conversation_key is not null
    do update set updated_at = public.explore_conversations.updated_at
    returning * into selected_conversation;
  else
    update public.explore_conversations
    set participant_ids = canonical_participants,
        conversation_key = canonical_key,
        created_by = coalesce(created_by, actor_user_id)
    where id = selected_conversation.id
    returning * into selected_conversation;
  end if;

  insert into public.explore_conversation_members (conversation_id, user_id)
  values
    (selected_conversation.id, actor_user_id),
    (selected_conversation.id, recipient_user_id)
  on conflict (conversation_id, user_id) do nothing;

  return selected_conversation;
end;
$$;

create or replace function public.respond_to_explore_message_request(
  conversation_uuid uuid,
  accept_request boolean
)
returns public.explore_conversations
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_user_id uuid := auth.uid();
  selected_conversation public.explore_conversations;
begin
  if actor_user_id is null then
    raise exception 'Authentication is required.' using errcode = '28000';
  end if;

  select conversation.*
  into selected_conversation
  from public.explore_conversations conversation
  where conversation.id = conversation_uuid
    and conversation.request = true
    and conversation.created_by is distinct from actor_user_id
    and actor_user_id = any(conversation.participant_ids)
  for update;

  if selected_conversation.id is null then
    raise exception 'This message request is no longer available.' using errcode = 'P0002';
  end if;

  if accept_request then
    update public.explore_conversations
    set request = false,
        updated_at = timezone('utc', now())
    where id = conversation_uuid
    returning * into selected_conversation;
  else
    delete from public.explore_conversations where id = conversation_uuid;
  end if;

  return selected_conversation;
end;
$$;

revoke all on function public.get_or_create_explore_direct_conversation(uuid) from public, anon;
grant execute on function public.get_or_create_explore_direct_conversation(uuid) to authenticated;

revoke all on function public.respond_to_explore_message_request(uuid, boolean) from public, anon;
grant execute on function public.respond_to_explore_message_request(uuid, boolean) to authenticated;

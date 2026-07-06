-- First-contact messages: instead of blocking non-followers, let the message
-- send and land in the recipient's Requests tab. When the recipient replies,
-- the conversation is accepted automatically and moves to their inbox.

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

    if recipient_message_mode = 'none' then
      raise exception 'This account is not accepting new messages.' using errcode = '42501';
    end if;

    -- Non-followers may always start a conversation; it simply arrives as a
    -- request until the recipient replies or accepts it.
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

revoke all on function public.get_or_create_explore_direct_conversation(uuid) from public, anon;
grant execute on function public.get_or_create_explore_direct_conversation(uuid) to authenticated;

-- Accept a message request automatically the moment the recipient replies.
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
    and created_by is distinct from new.sender_id;
  return new;
end;
$$;

drop trigger if exists explore_messages_accept_request_on_reply on public.explore_messages;
create trigger explore_messages_accept_request_on_reply
after insert on public.explore_messages
for each row execute function public.accept_explore_request_on_reply();

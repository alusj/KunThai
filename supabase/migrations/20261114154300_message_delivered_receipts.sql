-- Message receipts: Sent → Delivered → Seen, in Explore and UrMall chats.
--
-- "Seen" already exists (explore_messages.read, marketplace_customer_messages
-- .unread = false). "Delivered" is new: delivered_at is stamped when the
-- recipient's app receives the message (it loads their inbox or the chat, or a
-- live update arrives). The recipient's app calls the functions below; they
-- only ever stamp messages addressed to the caller and never touch anything
-- else, so they run as the definer.

alter table public.explore_messages add column if not exists delivered_at timestamptz;
alter table public.marketplace_customer_messages add column if not exists delivered_at timestamptz;

-- A message already read was certainly delivered.
update public.explore_messages
set delivered_at = created_at
where delivered_at is null and read is true;

update public.marketplace_customer_messages
set delivered_at = created_at
where delivered_at is null and unread is false;

-- Explore: messages others sent in the caller's conversations (one, or all).
create or replace function public.mark_explore_messages_delivered(p_conversation_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_count integer := 0;
begin
  if v_user is null then
    return 0;
  end if;

  update public.explore_messages message
  set delivered_at = now()
  from public.explore_conversations conversation
  where message.conversation_id = conversation.id
    and message.delivered_at is null
    and message.sender_id is distinct from v_user
    and (p_conversation_id is null or message.conversation_id = p_conversation_id)
    and message.created_at > now() - interval '60 days'
    and (
      v_user = any(conversation.participant_ids)
      or (conversation.space_id is not null and public.explore_space_can_reply_messages(conversation.space_id, v_user))
    );

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.mark_explore_messages_delivered(uuid) from public, anon;
grant execute on function public.mark_explore_messages_delivered(uuid) to authenticated;

-- UrMall: store replies to the caller as a buyer, and buyer messages to the
-- stores the caller owns or answers messages for.
create or replace function public.mark_marketplace_messages_delivered()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_buyer integer := 0;
  v_seller integer := 0;
begin
  if v_user is null then
    return 0;
  end if;

  update public.marketplace_customer_messages message
  set delivered_at = now()
  where message.delivered_at is null
    and message.buyer_id = v_user
    and message.sender_role = 'seller'
    and message.created_at > now() - interval '60 days';
  get diagnostics v_buyer = row_count;

  update public.marketplace_customer_messages message
  set delivered_at = now()
  where message.delivered_at is null
    and (message.sender_role = 'buyer' or message.sender_role is null)
    and message.buyer_id is distinct from v_user
    and message.created_at > now() - interval '60 days'
    and (
      exists (
        select 1 from public.marketplace_businesses business
        where business.id = message.business_id and business.user_id = v_user
      )
      or exists (
        select 1 from public.marketplace_business_admins admin
        where admin.business_id = message.business_id
          and admin.user_id = v_user
          and admin.status = 'accepted'
          and coalesce((admin.responsibilities ->> 'messageReplies')::boolean, false)
      )
    );
  get diagnostics v_seller = row_count;

  return v_buyer + v_seller;
end;
$$;

revoke all on function public.mark_marketplace_messages_delivered() from public, anon;
grant execute on function public.mark_marketplace_messages_delivered() to authenticated;

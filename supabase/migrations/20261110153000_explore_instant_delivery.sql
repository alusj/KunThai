-- Instant delivery for Explore direct messages (2026-11-10).
--
-- A sent message used to reach the other phone only after it was saved and
-- the database change was relayed (about 2 s on a Galaxy A06 in Freetown).
-- Now the sender also hands the message straight to the recipient's private
-- live channel, "explore-user:<recipient id>", at the same moment it saves;
-- the saved row still follows and confirms it.
--
-- Who may use those channels:
--   * listen: only the account the channel is named after;
--   * send:   only someone who shares a direct (non-Space) conversation with
--             that account and whom that account has not blocked.
-- Space threads keep the saved-row path only.

create or replace function public.explore_delivery_topic_user(topic text)
returns uuid
language sql
immutable
as $$
  select case
    when topic ~ '^explore-user:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then substr(topic, 14)::uuid
  end;
$$;

create or replace function public.explore_can_deliver_to(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
    and target is not null
    and target <> auth.uid()
    and exists (
      select 1
      from public.explore_conversations conversation
      where conversation.space_id is null
        and (
          auth.uid() = any(coalesce(conversation.participant_ids, '{}'::uuid[]))
          or exists (
            select 1 from public.explore_conversation_members member
            where member.conversation_id = conversation.id and member.user_id = auth.uid()
          )
        )
        and (
          target = any(coalesce(conversation.participant_ids, '{}'::uuid[]))
          or exists (
            select 1 from public.explore_conversation_members member
            where member.conversation_id = conversation.id and member.user_id = target
          )
        )
    )
    and not public.explore_has_blocked(target, auth.uid(), null);
$$;

revoke all on function public.explore_can_deliver_to(uuid) from public;
grant execute on function public.explore_can_deliver_to(uuid) to authenticated;
grant execute on function public.explore_delivery_topic_user(text) to authenticated;

drop policy if exists "explore instant delivery: own channel" on realtime.messages;
create policy "explore instant delivery: own channel"
  on realtime.messages
  for select
  to authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and public.explore_delivery_topic_user(realtime.topic()) = auth.uid()
  );

drop policy if exists "explore instant delivery: direct contacts send" on realtime.messages;
create policy "explore instant delivery: direct contacts send"
  on realtime.messages
  for insert
  to authenticated
  with check (
    realtime.messages.extension = 'broadcast'
    and public.explore_can_deliver_to(public.explore_delivery_topic_user(realtime.topic()))
  );

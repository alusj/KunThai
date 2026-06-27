-- Keep Explore direct messages visible to both participants even when an older
-- conversation is missing one of its membership rows.

alter table public.explore_conversations
  add column if not exists participant_ids uuid[] not null default '{}',
  add column if not exists conversation_key text;

create unique index if not exists explore_conversations_conversation_key_idx
  on public.explore_conversations (conversation_key)
  where conversation_key is not null;

drop policy if exists "authenticated_users_create_conversation_members" on public.explore_conversation_members;
drop policy if exists "Explore conversation members can be created by participants" on public.explore_conversation_members;
drop policy if exists "conversation creator can add member rows" on public.explore_conversation_members;
drop policy if exists "explore participants can repair member rows" on public.explore_conversation_members;

create policy "explore participants can repair member rows"
on public.explore_conversation_members
for insert
to authenticated
with check (
  user_id = auth.uid()
  or exists (
    select 1
    from public.explore_conversations c
    where c.id = explore_conversation_members.conversation_id
      and explore_conversation_members.user_id = any(c.participant_ids)
      and (
        c.created_by = auth.uid()
        or auth.uid() = any(c.participant_ids)
      )
  )
);

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'explore_messages'
  ) then
    alter publication supabase_realtime add table public.explore_messages;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'explore_conversation_members'
  ) then
    alter publication supabase_realtime add table public.explore_conversation_members;
  end if;
end $$;

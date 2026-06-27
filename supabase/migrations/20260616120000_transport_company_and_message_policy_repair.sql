create or replace function public.transport_company_is_owner(company_uuid uuid, user_uuid uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.transport_companies company
    where company.id = company_uuid
      and company.owner_user_id = user_uuid
  );
$$;

create or replace function public.transport_company_is_active_member(company_uuid uuid, user_uuid uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.transport_company_members member
    where member.company_id = company_uuid
      and member.user_id = user_uuid
      and member.status = 'active'
  );
$$;

create or replace function public.transport_company_invite_is_for_user(invite_uuid uuid, user_uuid uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.transport_company_operator_invites invite
    where invite.id = invite_uuid
      and (
        invite.operator_user_id = user_uuid
        or exists (
          select 1
          from public.transport_operators operator
          where operator.id = invite.operator_id
            and operator.user_id = user_uuid
        )
      )
  );
$$;

create or replace function public.transport_company_fleet_invite_is_for_user(company_fleet_uuid uuid, user_uuid uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.transport_company_operator_invites invite
    where invite.company_fleet_id = company_fleet_uuid
      and (
        invite.operator_user_id = user_uuid
        or exists (
          select 1
          from public.transport_operators operator
          where operator.id = invite.operator_id
            and operator.user_id = user_uuid
        )
      )
  );
$$;

grant execute on function public.transport_company_is_owner(uuid, uuid) to authenticated;
grant execute on function public.transport_company_is_active_member(uuid, uuid) to authenticated;
grant execute on function public.transport_company_invite_is_for_user(uuid, uuid) to authenticated;
grant execute on function public.transport_company_fleet_invite_is_for_user(uuid, uuid) to authenticated;

drop policy if exists "active members can read company" on public.transport_companies;
create policy "active members can read company"
on public.transport_companies
for select
to authenticated
using (public.transport_company_is_active_member(id, auth.uid()));

drop policy if exists "company members can read fleets" on public.transport_company_fleets;
create policy "company members can read fleets"
on public.transport_company_fleets
for select
to authenticated
using (public.transport_company_is_active_member(company_id, auth.uid()));

drop policy if exists "invited operators can read assigned fleet" on public.transport_company_fleets;
create policy "invited operators can read assigned fleet"
on public.transport_company_fleets
for select
to authenticated
using (public.transport_company_fleet_invite_is_for_user(id, auth.uid()));

drop policy if exists "company owners can manage invites" on public.transport_company_operator_invites;
create policy "company owners can manage invites"
on public.transport_company_operator_invites
for all
to authenticated
using (public.transport_company_is_owner(company_id, auth.uid()))
with check (public.transport_company_is_owner(company_id, auth.uid()));

drop policy if exists "invited operators can read own invites" on public.transport_company_operator_invites;
create policy "invited operators can read own invites"
on public.transport_company_operator_invites
for select
to authenticated
using (public.transport_company_invite_is_for_user(id, auth.uid()));

drop policy if exists "invited operators can respond to own invites" on public.transport_company_operator_invites;
create policy "invited operators can respond to own invites"
on public.transport_company_operator_invites
for update
to authenticated
using (public.transport_company_invite_is_for_user(id, auth.uid()))
with check (public.transport_company_invite_is_for_user(id, auth.uid()));

drop policy if exists "company owners can manage members" on public.transport_company_members;
create policy "company owners can manage members"
on public.transport_company_members
for all
to authenticated
using (public.transport_company_is_owner(company_id, auth.uid()))
with check (public.transport_company_is_owner(company_id, auth.uid()));

drop policy if exists "company members can read activities" on public.transport_company_activities;
create policy "company members can read activities"
on public.transport_company_activities
for select
to authenticated
using (public.transport_company_is_active_member(company_id, auth.uid()));

drop policy if exists "company owners can create activities" on public.transport_company_activities;
create policy "company owners can create activities"
on public.transport_company_activities
for insert
to authenticated
with check (
  actor_user_id = auth.uid()
  and public.transport_company_is_owner(company_id, auth.uid())
);

alter table if exists public.explore_conversations
  add column if not exists participant_ids uuid[] not null default '{}',
  add column if not exists conversation_key text,
  add column if not exists created_by uuid references auth.users(id) on delete set null;

create unique index if not exists explore_conversations_conversation_key_idx
  on public.explore_conversations (conversation_key)
  where conversation_key is not null;

create or replace function public.explore_is_conversation_member(conversation_uuid uuid, user_uuid uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.explore_conversation_members member
    where member.conversation_id = conversation_uuid
      and member.user_id = user_uuid
  )
  or exists (
    select 1
    from public.explore_conversations conversation
    where conversation.id = conversation_uuid
      and user_uuid = any(conversation.participant_ids)
  );
$$;

grant execute on function public.explore_is_conversation_member(uuid, uuid) to authenticated;

alter table if exists public.explore_conversations enable row level security;
alter table if exists public.explore_conversation_members enable row level security;
alter table if exists public.explore_messages enable row level security;

drop policy if exists "explore conversations participants read v2" on public.explore_conversations;
create policy "explore conversations participants read v2"
on public.explore_conversations
for select
to authenticated
using (public.explore_is_conversation_member(id, auth.uid()) or created_by = auth.uid());

drop policy if exists "explore conversations participants create v2" on public.explore_conversations;
create policy "explore conversations participants create v2"
on public.explore_conversations
for insert
to authenticated
with check (created_by = auth.uid() or auth.uid() = any(participant_ids));

drop policy if exists "explore conversations participants update v2" on public.explore_conversations;
create policy "explore conversations participants update v2"
on public.explore_conversations
for update
to authenticated
using (public.explore_is_conversation_member(id, auth.uid()) or created_by = auth.uid())
with check (public.explore_is_conversation_member(id, auth.uid()) or created_by = auth.uid());

drop policy if exists "explore conversation members read v2" on public.explore_conversation_members;
create policy "explore conversation members read v2"
on public.explore_conversation_members
for select
to authenticated
using (user_id = auth.uid() or public.explore_is_conversation_member(conversation_id, auth.uid()));

drop policy if exists "explore conversation members create v2" on public.explore_conversation_members;
create policy "explore conversation members create v2"
on public.explore_conversation_members
for insert
to authenticated
with check (
  user_id = auth.uid()
  or exists (
    select 1
    from public.explore_conversations conversation
    where conversation.id = explore_conversation_members.conversation_id
      and (
        conversation.created_by = auth.uid()
        or auth.uid() = any(conversation.participant_ids)
      )
      and explore_conversation_members.user_id = any(conversation.participant_ids)
  )
);

drop policy if exists "explore messages participants read v2" on public.explore_messages;
create policy "explore messages participants read v2"
on public.explore_messages
for select
to authenticated
using (public.explore_is_conversation_member(conversation_id, auth.uid()));

drop policy if exists "explore messages participants create v2" on public.explore_messages;
create policy "explore messages participants create v2"
on public.explore_messages
for insert
to authenticated
with check (
  sender_id = auth.uid()
  and public.explore_is_conversation_member(conversation_id, auth.uid())
);

drop policy if exists "explore messages participants update v2" on public.explore_messages;
create policy "explore messages participants update v2"
on public.explore_messages
for update
to authenticated
using (public.explore_is_conversation_member(conversation_id, auth.uid()))
with check (public.explore_is_conversation_member(conversation_id, auth.uid()));

do $$
begin
  if exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'transport_company_operator_invites'
  ) then
    null;
  else
    alter publication supabase_realtime add table public.transport_company_operator_invites;
  end if;
exception
  when undefined_object then null;
end $$;

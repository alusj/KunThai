-- Space team responsibilities and invitation acceptance.

alter table public.explore_space_members
  add column if not exists responsibilities jsonb not null default '{}'::jsonb;

alter table public.explore_space_members
  add column if not exists member_name text not null default '';

alter table public.explore_space_members
  add column if not exists member_code text not null default '';

alter table public.explore_space_members
  add column if not exists accepted_at timestamptz;

update public.explore_space_members
set responsibilities = jsonb_build_object(
  'canCreatePosts', true,
  'canReplyComments', true,
  'canReplyMessages', true,
  'canManageTeam', role in ('owner', 'administrator'),
  'canViewInsights', true,
  'canEditSpace', role in ('owner', 'administrator')
)
where role in ('owner', 'administrator')
  and responsibilities = '{}'::jsonb;

update public.explore_space_members
set responsibilities = jsonb_build_object(
  'canCreatePosts', true,
  'canReplyComments', true,
  'canReplyMessages', false,
  'canManageTeam', false,
  'canViewInsights', true,
  'canEditSpace', false
)
where role = 'editor'
  and responsibilities = '{}'::jsonb;

update public.explore_space_members
set responsibilities = jsonb_build_object(
  'canCreatePosts', false,
  'canReplyComments', true,
  'canReplyMessages', true,
  'canManageTeam', false,
  'canViewInsights', true,
  'canEditSpace', false
)
where role in ('moderator', 'customer_support')
  and responsibilities = '{}'::jsonb;

update public.explore_space_members
set responsibilities = jsonb_build_object(
  'canCreatePosts', false,
  'canReplyComments', false,
  'canReplyMessages', false,
  'canManageTeam', false,
  'canViewInsights', true,
  'canEditSpace', false
)
where role in ('analyst', 'member')
  and responsibilities = '{}'::jsonb;

create index if not exists explore_space_members_pending_user_idx
  on public.explore_space_members (user_id, status, created_at desc)
  where status = 'pending';

alter table public.explore_post_comments
  add column if not exists actor_type text not null default 'profile';

alter table public.explore_post_comments
  add column if not exists actor_id uuid;

alter table public.explore_post_comments
  add column if not exists space_id uuid references public.explore_spaces(id) on delete set null;

alter table public.explore_post_comments
  add column if not exists actor_metadata jsonb not null default '{}'::jsonb;

alter table public.explore_post_comments drop constraint if exists explore_post_comments_actor_type_check;
alter table public.explore_post_comments
  add constraint explore_post_comments_actor_type_check
  check (actor_type in ('profile', 'space'));

update public.explore_post_comments
set actor_type = 'profile',
    actor_id = user_id
where actor_id is null
  and user_id is not null;

create index if not exists explore_post_comments_actor_idx
  on public.explore_post_comments (actor_type, actor_id, created_at desc);

drop policy if exists "invited users respond to space team invitations" on public.explore_space_members;
create policy "invited users respond to space team invitations"
on public.explore_space_members for update to authenticated
using (
  user_id = auth.uid()
  and status = 'pending'
)
with check (
  user_id = auth.uid()
  and status in ('active', 'removed')
);

comment on column public.explore_space_members.responsibilities is
  'Per-member Space permissions, such as posting, replying to comments, replying to messages, team management, insights, and profile editing.';

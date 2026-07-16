-- Explore Spaces: managed identities for brands, organizations, communities,
-- schools, NGOs, clubs, creators, and public teams.

create table if not exists public.explore_spaces (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  slug text not null,
  category text not null default 'business',
  bio text not null default '',
  avatar_url text,
  cover_url text,
  contact_email text,
  phone text,
  website_url text,
  location text,
  verified boolean not null default false,
  status text not null default 'active',
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.explore_spaces add column if not exists owner_user_id uuid references auth.users(id) on delete cascade;
alter table public.explore_spaces add column if not exists name text;
alter table public.explore_spaces add column if not exists slug text;
alter table public.explore_spaces add column if not exists category text not null default 'business';
alter table public.explore_spaces add column if not exists bio text not null default '';
alter table public.explore_spaces add column if not exists avatar_url text;
alter table public.explore_spaces add column if not exists cover_url text;
alter table public.explore_spaces add column if not exists contact_email text;
alter table public.explore_spaces add column if not exists phone text;
alter table public.explore_spaces add column if not exists website_url text;
alter table public.explore_spaces add column if not exists location text;
alter table public.explore_spaces add column if not exists verified boolean not null default false;
alter table public.explore_spaces add column if not exists status text not null default 'active';
alter table public.explore_spaces add column if not exists settings jsonb not null default '{}'::jsonb;
alter table public.explore_spaces add column if not exists created_at timestamptz not null default timezone('utc', now());
alter table public.explore_spaces add column if not exists updated_at timestamptz not null default timezone('utc', now());

alter table public.explore_spaces drop constraint if exists explore_spaces_category_check;
alter table public.explore_spaces
  add constraint explore_spaces_category_check
  check (category in (
    'business',
    'brand',
    'organization',
    'school',
    'community',
    'ngo',
    'government_agency',
    'religious_organization',
    'sports_club',
    'entertainment',
    'personal_brand',
    'news_media',
    'event'
  ));

alter table public.explore_spaces drop constraint if exists explore_spaces_status_check;
alter table public.explore_spaces
  add constraint explore_spaces_status_check
  check (status in ('active', 'paused', 'restricted', 'deleted'));

create unique index if not exists explore_spaces_slug_unique_idx
  on public.explore_spaces (lower(slug));

create index if not exists explore_spaces_owner_idx
  on public.explore_spaces (owner_user_id, updated_at desc);

create table if not exists public.explore_space_departments (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.explore_spaces(id) on delete cascade,
  name text not null,
  description text not null default '',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.explore_space_departments add column if not exists space_id uuid references public.explore_spaces(id) on delete cascade;
alter table public.explore_space_departments add column if not exists name text;
alter table public.explore_space_departments add column if not exists description text not null default '';
alter table public.explore_space_departments add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table public.explore_space_departments add column if not exists created_at timestamptz not null default timezone('utc', now());
alter table public.explore_space_departments add column if not exists updated_at timestamptz not null default timezone('utc', now());

create unique index if not exists explore_space_departments_name_idx
  on public.explore_space_departments (space_id, lower(name));

create table if not exists public.explore_space_members (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.explore_spaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member',
  department_id uuid references public.explore_space_departments(id) on delete set null,
  status text not null default 'active',
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (space_id, user_id)
);

alter table public.explore_space_members add column if not exists space_id uuid references public.explore_spaces(id) on delete cascade;
alter table public.explore_space_members add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.explore_space_members add column if not exists role text not null default 'member';
alter table public.explore_space_members add column if not exists department_id uuid references public.explore_space_departments(id) on delete set null;
alter table public.explore_space_members add column if not exists status text not null default 'active';
alter table public.explore_space_members add column if not exists invited_by uuid references auth.users(id) on delete set null;
alter table public.explore_space_members add column if not exists created_at timestamptz not null default timezone('utc', now());
alter table public.explore_space_members add column if not exists updated_at timestamptz not null default timezone('utc', now());

alter table public.explore_space_members drop constraint if exists explore_space_members_role_check;
alter table public.explore_space_members
  add constraint explore_space_members_role_check
  check (role in ('owner', 'administrator', 'moderator', 'editor', 'customer_support', 'analyst', 'member'));

alter table public.explore_space_members drop constraint if exists explore_space_members_status_check;
alter table public.explore_space_members
  add constraint explore_space_members_status_check
  check (status in ('active', 'pending', 'removed'));

create index if not exists explore_space_members_user_idx
  on public.explore_space_members (user_id, status, updated_at desc);

create index if not exists explore_space_members_space_idx
  on public.explore_space_members (space_id, status, role);

create table if not exists public.explore_identity_connections (
  id uuid primary key default gen_random_uuid(),
  connector_user_id uuid not null references auth.users(id) on delete cascade,
  target_type text not null,
  target_profile_user_id uuid references auth.users(id) on delete cascade,
  target_space_id uuid references public.explore_spaces(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.explore_identity_connections add column if not exists connector_user_id uuid references auth.users(id) on delete cascade;
alter table public.explore_identity_connections add column if not exists target_type text;
alter table public.explore_identity_connections add column if not exists target_profile_user_id uuid references auth.users(id) on delete cascade;
alter table public.explore_identity_connections add column if not exists target_space_id uuid references public.explore_spaces(id) on delete cascade;
alter table public.explore_identity_connections add column if not exists created_at timestamptz not null default timezone('utc', now());

alter table public.explore_identity_connections drop constraint if exists explore_identity_connections_target_check;
alter table public.explore_identity_connections
  add constraint explore_identity_connections_target_check
  check (
    (
      target_type = 'profile'
      and target_profile_user_id is not null
      and target_space_id is null
      and target_profile_user_id <> connector_user_id
    )
    or (
      target_type = 'space'
      and target_space_id is not null
      and target_profile_user_id is null
    )
  );

create unique index if not exists explore_identity_connections_profile_idx
  on public.explore_identity_connections (connector_user_id, target_profile_user_id)
  where target_type = 'profile';

create unique index if not exists explore_identity_connections_space_idx
  on public.explore_identity_connections (connector_user_id, target_space_id)
  where target_type = 'space';

create unique index if not exists explore_identity_connections_profile_upsert_idx
  on public.explore_identity_connections (connector_user_id, target_type, target_profile_user_id);

create unique index if not exists explore_identity_connections_space_upsert_idx
  on public.explore_identity_connections (connector_user_id, target_type, target_space_id);

create index if not exists explore_identity_connections_target_space_idx
  on public.explore_identity_connections (target_space_id, created_at desc)
  where target_type = 'space';

create table if not exists public.explore_identity_blocks (
  id uuid primary key default gen_random_uuid(),
  blocker_user_id uuid not null references auth.users(id) on delete cascade,
  target_type text not null,
  target_profile_user_id uuid references auth.users(id) on delete cascade,
  target_space_id uuid references public.explore_spaces(id) on delete cascade,
  reason text not null default '',
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.explore_identity_blocks add column if not exists blocker_user_id uuid references auth.users(id) on delete cascade;
alter table public.explore_identity_blocks add column if not exists target_type text;
alter table public.explore_identity_blocks add column if not exists target_profile_user_id uuid references auth.users(id) on delete cascade;
alter table public.explore_identity_blocks add column if not exists target_space_id uuid references public.explore_spaces(id) on delete cascade;
alter table public.explore_identity_blocks add column if not exists reason text not null default '';
alter table public.explore_identity_blocks add column if not exists created_at timestamptz not null default timezone('utc', now());

alter table public.explore_identity_blocks drop constraint if exists explore_identity_blocks_target_check;
alter table public.explore_identity_blocks
  add constraint explore_identity_blocks_target_check
  check (
    (
      target_type = 'profile'
      and target_profile_user_id is not null
      and target_space_id is null
      and target_profile_user_id <> blocker_user_id
    )
    or (
      target_type = 'space'
      and target_space_id is not null
      and target_profile_user_id is null
    )
  );

create unique index if not exists explore_identity_blocks_profile_idx
  on public.explore_identity_blocks (blocker_user_id, target_profile_user_id)
  where target_type = 'profile';

create unique index if not exists explore_identity_blocks_space_idx
  on public.explore_identity_blocks (blocker_user_id, target_space_id)
  where target_type = 'space';

create unique index if not exists explore_identity_blocks_profile_upsert_idx
  on public.explore_identity_blocks (blocker_user_id, target_type, target_profile_user_id);

create unique index if not exists explore_identity_blocks_space_upsert_idx
  on public.explore_identity_blocks (blocker_user_id, target_type, target_space_id);

create table if not exists public.explore_space_reports (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.explore_spaces(id) on delete cascade,
  reporter_user_id uuid not null references auth.users(id) on delete cascade,
  reason text not null default 'Space reported from Explore',
  status text not null default 'open',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (space_id, reporter_user_id)
);

alter table public.explore_space_reports add column if not exists space_id uuid references public.explore_spaces(id) on delete cascade;
alter table public.explore_space_reports add column if not exists reporter_user_id uuid references auth.users(id) on delete cascade;
alter table public.explore_space_reports add column if not exists reason text not null default 'Space reported from Explore';
alter table public.explore_space_reports add column if not exists status text not null default 'open';
alter table public.explore_space_reports add column if not exists created_at timestamptz not null default timezone('utc', now());
alter table public.explore_space_reports add column if not exists updated_at timestamptz not null default timezone('utc', now());

alter table public.explore_space_reports drop constraint if exists explore_space_reports_status_check;
alter table public.explore_space_reports
  add constraint explore_space_reports_status_check
  check (status in ('open', 'reviewed', 'dismissed'));

create index if not exists explore_space_reports_space_idx
  on public.explore_space_reports (space_id, created_at desc);

create unique index if not exists explore_space_reports_unique_reporter_idx
  on public.explore_space_reports (space_id, reporter_user_id);

alter table public.explore_posts add column if not exists actor_type text not null default 'profile';
alter table public.explore_posts add column if not exists actor_id uuid;
alter table public.explore_posts add column if not exists space_id uuid references public.explore_spaces(id) on delete set null;
alter table public.explore_posts add column if not exists actor_metadata jsonb not null default '{}'::jsonb;

alter table public.explore_posts drop constraint if exists explore_posts_actor_type_check;
alter table public.explore_posts
  add constraint explore_posts_actor_type_check
  check (actor_type in ('profile', 'space'));

update public.explore_posts
set actor_type = 'profile',
    actor_id = user_id
where actor_id is null
  and user_id is not null;

create index if not exists explore_posts_actor_idx
  on public.explore_posts (actor_type, actor_id, created_at desc);

create index if not exists explore_posts_space_idx
  on public.explore_posts (space_id, created_at desc)
  where space_id is not null;

drop policy if exists "authenticated_users_can_read_posts" on public.explore_posts;
create policy "authenticated_users_can_read_posts"
on public.explore_posts for select to authenticated
using (
  user_id = auth.uid()
  or (
    (nullif(btrim(coalesce(video_url, '')), '') is null or moderation_status in ('approved', 'legacy'))
    and (
      coalesce(nullif(btrim(post_privacy), ''), 'public') = 'public'
      or (
        coalesce(nullif(btrim(post_privacy), ''), 'public') in ('circle', 'followers')
        and (
          exists (
            select 1
            from public.explore_follows follow
            where follow.follower_id = auth.uid()
              and follow.following_id = explore_posts.user_id
          )
          or (
            actor_type = 'space'
            and exists (
              select 1
              from public.explore_identity_connections connection
              where connection.connector_user_id = auth.uid()
                and connection.target_type = 'space'
                and connection.target_space_id = coalesce(explore_posts.space_id, explore_posts.actor_id)
            )
          )
        )
      )
    )
  )
);

alter table public.explore_notifications add column if not exists actor_type text not null default 'profile';
alter table public.explore_notifications add column if not exists actor_id uuid;
alter table public.explore_notifications add column if not exists actor_space_id uuid references public.explore_spaces(id) on delete set null;
alter table public.explore_notifications add column if not exists recipient_space_id uuid references public.explore_spaces(id) on delete cascade;

alter table public.explore_notifications drop constraint if exists explore_notifications_actor_type_check;
alter table public.explore_notifications
  add constraint explore_notifications_actor_type_check
  check (actor_type in ('profile', 'space'));

update public.explore_notifications
set actor_type = 'profile',
    actor_id = actor_user_id
where actor_id is null
  and actor_user_id is not null;

create index if not exists explore_notifications_recipient_space_idx
  on public.explore_notifications (recipient_space_id, created_at desc)
  where recipient_space_id is not null;

create or replace function public.explore_spaces_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists explore_spaces_set_updated_at on public.explore_spaces;
create trigger explore_spaces_set_updated_at
before update on public.explore_spaces
for each row execute function public.explore_spaces_set_updated_at();

drop trigger if exists explore_space_departments_set_updated_at on public.explore_space_departments;
create trigger explore_space_departments_set_updated_at
before update on public.explore_space_departments
for each row execute function public.explore_spaces_set_updated_at();

drop trigger if exists explore_space_members_set_updated_at on public.explore_space_members;
create trigger explore_space_members_set_updated_at
before update on public.explore_space_members
for each row execute function public.explore_spaces_set_updated_at();

drop trigger if exists explore_space_reports_set_updated_at on public.explore_space_reports;
create trigger explore_space_reports_set_updated_at
before update on public.explore_space_reports
for each row execute function public.explore_spaces_set_updated_at();

create or replace function public.explore_space_create_owner_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.explore_space_members (space_id, user_id, role, status, invited_by)
  values (new.id, new.owner_user_id, 'owner', 'active', new.owner_user_id)
  on conflict (space_id, user_id) do update
    set role = 'owner',
        status = 'active',
        updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists explore_spaces_owner_member on public.explore_spaces;
create trigger explore_spaces_owner_member
after insert on public.explore_spaces
for each row execute function public.explore_space_create_owner_member();

create or replace function public.explore_space_role_allows(space_uuid uuid, allowed_roles text[] default null)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.explore_space_members member
    where member.space_id = space_uuid
      and member.user_id = auth.uid()
      and member.status = 'active'
      and (
        allowed_roles is null
        or member.role = any(allowed_roles)
      )
  );
$$;

alter table public.explore_spaces enable row level security;
alter table public.explore_space_departments enable row level security;
alter table public.explore_space_members enable row level security;
alter table public.explore_identity_connections enable row level security;
alter table public.explore_identity_blocks enable row level security;
alter table public.explore_space_reports enable row level security;

drop policy if exists "explore spaces are discoverable" on public.explore_spaces;
create policy "explore spaces are discoverable"
on public.explore_spaces for select to authenticated
using (
  status = 'active'
  or owner_user_id = auth.uid()
  or public.explore_space_role_allows(id, null)
);

drop policy if exists "users create owned explore spaces" on public.explore_spaces;
create policy "users create owned explore spaces"
on public.explore_spaces for insert to authenticated
with check (owner_user_id = auth.uid());

drop policy if exists "space managers update explore spaces" on public.explore_spaces;
create policy "space managers update explore spaces"
on public.explore_spaces for update to authenticated
using (
  owner_user_id = auth.uid()
  or public.explore_space_role_allows(id, array['owner', 'administrator'])
)
with check (
  owner_user_id = auth.uid()
  or public.explore_space_role_allows(id, array['owner', 'administrator'])
);

drop policy if exists "owners delete explore spaces" on public.explore_spaces;
create policy "owners delete explore spaces"
on public.explore_spaces for delete to authenticated
using (owner_user_id = auth.uid());

drop policy if exists "space members read departments" on public.explore_space_departments;
create policy "space members read departments"
on public.explore_space_departments for select to authenticated
using (public.explore_space_role_allows(space_id, null));

drop policy if exists "space managers create departments" on public.explore_space_departments;
create policy "space managers create departments"
on public.explore_space_departments for insert to authenticated
with check (public.explore_space_role_allows(space_id, array['owner', 'administrator']));

drop policy if exists "space managers update departments" on public.explore_space_departments;
create policy "space managers update departments"
on public.explore_space_departments for update to authenticated
using (public.explore_space_role_allows(space_id, array['owner', 'administrator']))
with check (public.explore_space_role_allows(space_id, array['owner', 'administrator']));

drop policy if exists "space managers delete departments" on public.explore_space_departments;
create policy "space managers delete departments"
on public.explore_space_departments for delete to authenticated
using (public.explore_space_role_allows(space_id, array['owner', 'administrator']));

drop policy if exists "space members read active team" on public.explore_space_members;
create policy "space members read active team"
on public.explore_space_members for select to authenticated
using (
  user_id = auth.uid()
  or public.explore_space_role_allows(space_id, array['owner', 'administrator', 'moderator'])
);

drop policy if exists "space managers invite team" on public.explore_space_members;
create policy "space managers invite team"
on public.explore_space_members for insert to authenticated
with check (public.explore_space_role_allows(space_id, array['owner', 'administrator']));

drop policy if exists "space managers update team" on public.explore_space_members;
create policy "space managers update team"
on public.explore_space_members for update to authenticated
using (public.explore_space_role_allows(space_id, array['owner', 'administrator']))
with check (public.explore_space_role_allows(space_id, array['owner', 'administrator']));

drop policy if exists "space managers remove team" on public.explore_space_members;
create policy "space managers remove team"
on public.explore_space_members for delete to authenticated
using (public.explore_space_role_allows(space_id, array['owner', 'administrator']));

drop policy if exists "authenticated users read identity connections" on public.explore_identity_connections;
create policy "authenticated users read identity connections"
on public.explore_identity_connections for select to authenticated
using (true);

drop policy if exists "users create their identity connections" on public.explore_identity_connections;
create policy "users create their identity connections"
on public.explore_identity_connections for insert to authenticated
with check (connector_user_id = auth.uid());

drop policy if exists "users remove their identity connections" on public.explore_identity_connections;
create policy "users remove their identity connections"
on public.explore_identity_connections for delete to authenticated
using (connector_user_id = auth.uid());

drop policy if exists "users read their identity blocks" on public.explore_identity_blocks;
create policy "users read their identity blocks"
on public.explore_identity_blocks for select to authenticated
using (blocker_user_id = auth.uid());

drop policy if exists "users create their identity blocks" on public.explore_identity_blocks;
create policy "users create their identity blocks"
on public.explore_identity_blocks for insert to authenticated
with check (blocker_user_id = auth.uid());

drop policy if exists "users remove their identity blocks" on public.explore_identity_blocks;
create policy "users remove their identity blocks"
on public.explore_identity_blocks for delete to authenticated
using (blocker_user_id = auth.uid());

drop policy if exists "users read their space reports" on public.explore_space_reports;
create policy "users read their space reports"
on public.explore_space_reports for select to authenticated
using (reporter_user_id = auth.uid());

drop policy if exists "users report spaces" on public.explore_space_reports;
create policy "users report spaces"
on public.explore_space_reports for insert to authenticated
with check (reporter_user_id = auth.uid());

grant select, insert, update, delete on public.explore_spaces to authenticated;
grant select, insert, update, delete on public.explore_space_departments to authenticated;
grant select, insert, update, delete on public.explore_space_members to authenticated;
grant select, insert, delete on public.explore_identity_connections to authenticated;
grant select, insert, delete on public.explore_identity_blocks to authenticated;
grant select, insert on public.explore_space_reports to authenticated;
grant execute on function public.explore_space_role_allows(uuid, text[]) to authenticated;

comment on table public.explore_spaces is
  'Managed Explore identities called Spaces. Spaces can publish, be discovered, receive connections, and hold a team.';

comment on table public.explore_identity_connections is
  'Connect relationships from real users to personal profiles or Spaces. Existing explore_follows remains the personal-profile compatibility table.';

comment on table public.explore_identity_blocks is
  'Blocked profile and Space identities for Explore connection and discovery controls.';

comment on table public.explore_space_reports is
  'Reports submitted against managed Explore Spaces.';

comment on column public.explore_posts.actor_type is
  'The visible publishing identity for a post: profile or space. user_id remains the authenticated account that wrote the row.';

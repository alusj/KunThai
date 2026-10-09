-- Explore profile, posts and Spaces fixes (2026-10-09 audit).
--
-- 1. explore_profiles.verified is admin-only: a signed-in member can no longer
--    give their own profile the verified badge. KunThai admins and the service
--    role (no auth.uid()) can still change it.
-- 2. Usernames are unique ignoring case. Existing duplicates are resolved
--    first: the oldest profile keeps the name and newer ones get a short,
--    stable suffix. User triggers are switched off around that backfill so
--    guards written for app traffic cannot roll the migration back.
-- 3. Spaces: verified and the restricted status are admin-only, and only the
--    owner can hand the Space to someone else.
-- 4. Space teams: an administrator can no longer change or remove the owner's
--    membership or promote anyone to owner. Only the owner can transfer
--    ownership.
-- 5. Space posts: the Space owner and administrators can edit and delete
--    posts published as their Space. They cannot move a post to another
--    author or identity.
--
-- Safe to run more than once.

begin;

-- ---------------------------------------------------------------------------
-- 1. Admin-only profile columns
-- ---------------------------------------------------------------------------

create or replace function public.explore_profiles_guard_admin_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.is_kunthai_admin(auth.uid()) then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if coalesce(new.verified, false) then
      raise exception 'Only KunThai can verify a profile.' using errcode = '42501';
    end if;
    return new;
  end if;

  if new.verified is distinct from old.verified then
    raise exception 'Only KunThai can verify a profile.' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists explore_profiles_guard_admin_columns on public.explore_profiles;
create trigger explore_profiles_guard_admin_columns
before insert or update on public.explore_profiles
for each row execute function public.explore_profiles_guard_admin_columns();

-- ---------------------------------------------------------------------------
-- 2. Case-insensitive unique usernames
-- ---------------------------------------------------------------------------

do $$
declare
  duplicate record;
  candidate text;
  attempt integer;
begin
  if not exists (
    select 1
    from public.explore_profiles
    where nullif(btrim(username), '') is not null
    group by lower(username)
    having count(*) > 1
  ) then
    return;
  end if;

  alter table public.explore_profiles disable trigger user;

  for duplicate in
    select ranked.user_id, ranked.username
    from (
      select
        profile.user_id,
        profile.username,
        row_number() over (
          partition by lower(profile.username)
          order by profile.created_at, profile.user_id
        ) as position
      from public.explore_profiles profile
      where nullif(btrim(profile.username), '') is not null
    ) ranked
    where ranked.position > 1
    order by ranked.user_id
  loop
    attempt := 0;
    loop
      candidate := left(btrim(duplicate.username), 23) || '_'
        || substr(md5(duplicate.user_id::text || ':' || attempt::text), 1, 6);
      exit when not exists (
        select 1 from public.explore_profiles taken where lower(taken.username) = lower(candidate)
      );
      attempt := attempt + 1;
    end loop;

    update public.explore_profiles
    set username = candidate
    where user_id = duplicate.user_id;
  end loop;

  alter table public.explore_profiles enable trigger user;
end $$;

create unique index if not exists explore_profiles_username_lower_unique_idx
  on public.explore_profiles (lower(username))
  where username is not null and btrim(username) <> '';

-- ---------------------------------------------------------------------------
-- 3. Protected Space columns
-- ---------------------------------------------------------------------------

create or replace function public.explore_spaces_guard_protected_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.is_kunthai_admin(auth.uid()) then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if coalesce(new.verified, false) then
      raise exception 'Only KunThai can verify a Space.' using errcode = '42501';
    end if;
    if new.status = 'restricted' then
      raise exception 'Only KunThai can restrict a Space.' using errcode = '42501';
    end if;
    return new;
  end if;

  if new.verified is distinct from old.verified then
    raise exception 'Only KunThai can verify a Space.' using errcode = '42501';
  end if;

  if new.owner_user_id is distinct from old.owner_user_id and old.owner_user_id is distinct from auth.uid() then
    raise exception 'Only the Space owner can transfer ownership.' using errcode = '42501';
  end if;

  if new.status is distinct from old.status and 'restricted' in (old.status, new.status) then
    raise exception 'Only KunThai can change a restricted Space.' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists explore_spaces_guard_protected_columns on public.explore_spaces;
create trigger explore_spaces_guard_protected_columns
before insert or update on public.explore_spaces
for each row execute function public.explore_spaces_guard_protected_columns();

-- ---------------------------------------------------------------------------
-- 4. The owner's team membership
-- ---------------------------------------------------------------------------

create or replace function public.explore_space_members_guard_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_space_id uuid;
  v_is_owner boolean;
begin
  if v_uid is null or public.is_kunthai_admin(v_uid) then
    return coalesce(new, old);
  end if;

  v_space_id := case when tg_op = 'DELETE' then old.space_id else new.space_id end;

  -- The Space itself is being removed (cascade): nothing left to protect.
  if not exists (select 1 from public.explore_spaces space where space.id = v_space_id) then
    return coalesce(new, old);
  end if;

  v_is_owner := exists (
      select 1 from public.explore_spaces space
      where space.id = v_space_id and space.owner_user_id = v_uid
    )
    or exists (
      select 1 from public.explore_space_members member
      where member.space_id = v_space_id
        and member.user_id = v_uid
        and member.role = 'owner'
        and member.status = 'active'
    );

  if v_is_owner then
    return coalesce(new, old);
  end if;

  if tg_op = 'INSERT' then
    if new.role = 'owner' then
      raise exception 'Only the Space owner can transfer ownership.' using errcode = '42501';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.role = 'owner' then
      raise exception 'The Space owner cannot be removed from the team.' using errcode = '42501';
    end if;
    return old;
  end if;

  if old.role = 'owner' and (
    new.role is distinct from old.role
    or new.status is distinct from old.status
    or new.user_id is distinct from old.user_id
    or new.space_id is distinct from old.space_id
  ) then
    raise exception 'Only the Space owner can change the owner''s membership.' using errcode = '42501';
  end if;

  if new.role = 'owner' and old.role is distinct from 'owner' then
    raise exception 'Only the Space owner can transfer ownership.' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists explore_space_members_guard_owner on public.explore_space_members;
create trigger explore_space_members_guard_owner
before insert or update or delete on public.explore_space_members
for each row execute function public.explore_space_members_guard_owner();

-- ---------------------------------------------------------------------------
-- 5. Space owners and administrators manage the Space's posts
-- ---------------------------------------------------------------------------

drop policy if exists "space managers update space posts" on public.explore_posts;
create policy "space managers update space posts"
on public.explore_posts for update to authenticated
using (
  actor_type = 'space'
  and space_id is not null
  and public.explore_space_role_allows(space_id, array['owner', 'administrator'])
)
with check (
  actor_type = 'space'
  and space_id is not null
  and public.explore_space_role_allows(space_id, array['owner', 'administrator'])
);

drop policy if exists "space managers delete space posts" on public.explore_posts;
create policy "space managers delete space posts"
on public.explore_posts for delete to authenticated
using (
  actor_type = 'space'
  and space_id is not null
  and public.explore_space_role_allows(space_id, array['owner', 'administrator'])
);

-- Someone editing another member's post (a Space manager) may change its
-- content, never who wrote it or which identity it was published as.
create or replace function public.explore_posts_guard_identity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null
    or old.user_id is not distinct from auth.uid()
    or public.is_kunthai_admin(auth.uid()) then
    return new;
  end if;

  if new.user_id is distinct from old.user_id
    or new.actor_type is distinct from old.actor_type
    or new.actor_id is distinct from old.actor_id
    or (new.space_id is not null and new.space_id is distinct from old.space_id) then
    raise exception 'A post''s author and identity cannot be changed.' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists explore_posts_guard_identity on public.explore_posts;
create trigger explore_posts_guard_identity
before update on public.explore_posts
for each row execute function public.explore_posts_guard_identity();

commit;

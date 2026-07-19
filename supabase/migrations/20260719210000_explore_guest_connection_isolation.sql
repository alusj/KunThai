-- Anonymous Supabase visitors use the authenticated database role. Keep guest
-- sessions out of Explore identity and connection directories at the RLS layer.

create or replace function public.kunthai_user_is_guest(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select users.is_anonymous from auth.users as users where users.id = target_user_id),
    true
  );
$$;

revoke all on function public.kunthai_user_is_guest(uuid) from public;
grant execute on function public.kunthai_user_is_guest(uuid) to authenticated, service_role;

create or replace function public.kunthai_reject_guest_explore_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  identity_user_id uuid;
begin
  identity_user_id := case
    when tg_table_name = 'explore_profiles' then new.user_id
    when tg_table_name = 'explore_spaces' then new.owner_user_id
    else null
  end;

  if public.kunthai_user_is_guest(identity_user_id) then
    raise exception using
      errcode = '42501',
      message = 'Guest sessions cannot create an Explore identity.';
  end if;

  return new;
end;
$$;

revoke all on function public.kunthai_reject_guest_explore_identity() from public;

-- Remove any identity or connection rows left by older guest-mode versions.
delete from public.explore_identity_connections as connection
using auth.users as users
where users.is_anonymous
  and (
    connection.connector_user_id = users.id
    or connection.target_profile_user_id = users.id
  );

delete from public.explore_follows as follow
using auth.users as users
where users.is_anonymous
  and (follow.follower_id = users.id or follow.following_id = users.id);

delete from public.explore_connections as connection
using auth.users as users
where users.is_anonymous and connection.user_id = users.id;

delete from public.explore_spaces as space
using auth.users as users
where users.is_anonymous and space.owner_user_id = users.id;

delete from public.explore_profiles as profile
using auth.users as users
where users.is_anonymous and profile.user_id = users.id;

drop trigger if exists explore_profiles_reject_guest_identity on public.explore_profiles;
create trigger explore_profiles_reject_guest_identity
before insert or update of user_id on public.explore_profiles
for each row execute function public.kunthai_reject_guest_explore_identity();

drop trigger if exists explore_spaces_reject_guest_identity on public.explore_spaces;
create trigger explore_spaces_reject_guest_identity
before insert or update of owner_user_id on public.explore_spaces
for each row execute function public.kunthai_reject_guest_explore_identity();

drop policy if exists "authenticated_users_can_read_profiles" on public.explore_profiles;
drop policy if exists "Explore profiles are readable" on public.explore_profiles;
drop policy if exists "registered users read registered profiles" on public.explore_profiles;
create policy "registered users read registered profiles"
on public.explore_profiles for select to authenticated
using (
  not public.kunthai_user_is_guest(auth.uid())
  and not public.kunthai_user_is_guest(user_id)
);

drop policy if exists "authenticated_users_read_follows" on public.explore_follows;
drop policy if exists "Follows are readable" on public.explore_follows;
drop policy if exists "authenticated_users_manage_own_follows" on public.explore_follows;
drop policy if exists "Users manage own follows" on public.explore_follows;
drop policy if exists "registered users read registered follows" on public.explore_follows;
drop policy if exists "registered users manage registered follows" on public.explore_follows;
create policy "registered users read registered follows"
on public.explore_follows for select to authenticated
using (
  not public.kunthai_user_is_guest(auth.uid())
  and not public.kunthai_user_is_guest(follower_id)
  and not public.kunthai_user_is_guest(following_id)
);

create policy "registered users manage registered follows"
on public.explore_follows for all to authenticated
using (
  auth.uid() = follower_id
  and not public.kunthai_user_is_guest(auth.uid())
  and not public.kunthai_user_is_guest(following_id)
)
with check (
  auth.uid() = follower_id
  and not public.kunthai_user_is_guest(auth.uid())
  and not public.kunthai_user_is_guest(following_id)
);

drop policy if exists "authenticated users read identity connections" on public.explore_identity_connections;
drop policy if exists "users create their identity connections" on public.explore_identity_connections;
drop policy if exists "users remove their identity connections" on public.explore_identity_connections;
drop policy if exists "registered users read identity connections" on public.explore_identity_connections;
drop policy if exists "registered users manage identity connections" on public.explore_identity_connections;
create policy "registered users read identity connections"
on public.explore_identity_connections for select to authenticated
using (
  not public.kunthai_user_is_guest(auth.uid())
  and not public.kunthai_user_is_guest(connector_user_id)
  and (
    target_profile_user_id is null
    or not public.kunthai_user_is_guest(target_profile_user_id)
  )
  and (
    target_space_id is null
    or exists (
      select 1
      from public.explore_spaces as target_space
      where target_space.id = target_space_id
        and not public.kunthai_user_is_guest(target_space.owner_user_id)
    )
  )
);

create policy "registered users manage identity connections"
on public.explore_identity_connections for all to authenticated
using (
  connector_user_id = auth.uid()
  and not public.kunthai_user_is_guest(auth.uid())
  and (
    target_profile_user_id is null
    or not public.kunthai_user_is_guest(target_profile_user_id)
  )
)
with check (
  connector_user_id = auth.uid()
  and not public.kunthai_user_is_guest(auth.uid())
  and (
    target_profile_user_id is null
    or not public.kunthai_user_is_guest(target_profile_user_id)
  )
);

drop policy if exists "explore spaces are discoverable" on public.explore_spaces;
drop policy if exists "registered users discover registered spaces" on public.explore_spaces;
create policy "registered users discover registered spaces"
on public.explore_spaces for select to authenticated
using (
  not public.kunthai_user_is_guest(auth.uid())
  and not public.kunthai_user_is_guest(owner_user_id)
  and (
    status = 'active'
    or owner_user_id = auth.uid()
    or public.explore_space_role_allows(id, null)
  )
);

drop policy if exists "authenticated_users_can_read_connections" on public.explore_connections;
drop policy if exists "owners_manage_connections" on public.explore_connections;
drop policy if exists "registered users read legacy connections" on public.explore_connections;
drop policy if exists "registered users manage legacy connections" on public.explore_connections;
create policy "registered users read legacy connections"
on public.explore_connections for select to authenticated
using (
  not public.kunthai_user_is_guest(auth.uid())
  and (user_id is null or not public.kunthai_user_is_guest(user_id))
);

create policy "registered users manage legacy connections"
on public.explore_connections for all to authenticated
using (
  auth.uid() = user_id
  and not public.kunthai_user_is_guest(auth.uid())
)
with check (
  auth.uid() = user_id
  and not public.kunthai_user_is_guest(auth.uid())
);

comment on function public.kunthai_user_is_guest(uuid) is
  'Returns true for anonymous, missing, or invalid auth identities so Explore directories fail closed.';

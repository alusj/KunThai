grant select, insert, update on public.explore_notifications to authenticated;
grant usage on schema public to authenticated;

drop policy if exists "users_read_own_notifications" on public.explore_notifications;
drop policy if exists "Users read own notifications" on public.explore_notifications;
create policy "users_read_own_notifications"
on public.explore_notifications
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "users_update_own_notifications" on public.explore_notifications;
drop policy if exists "Users update own notifications" on public.explore_notifications;
create policy "users_update_own_notifications"
on public.explore_notifications
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "authenticated_users_create_notifications" on public.explore_notifications;
drop policy if exists "Authenticated users create notifications" on public.explore_notifications;
drop policy if exists "authenticated_users_create_notifications_as_actor" on public.explore_notifications;
create policy "authenticated_users_create_notifications_as_actor"
on public.explore_notifications
for insert
to authenticated
with check (
  auth.uid() is not null
  and (actor_user_id is null or actor_user_id = auth.uid())
  and (user_id is null or user_id <> auth.uid())
);

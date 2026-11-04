-- An excluded account never sees a notification about the post it is
-- excluded from, including ones sent before the exclusion was added
-- (nothing is deleted; the row just stops being readable to them, so the
-- bell, the list and realtime banners all drop it). New ones are already
-- refused by explore_notifications_post_controls.
drop policy if exists "excluded accounts do not see post notifications" on public.explore_notifications;
create policy "excluded accounts do not see post notifications"
  on public.explore_notifications
  as restrictive
  for select
  using (
    post_id is null
    or not public.explore_post_excludes_viewer(post_id)
  );

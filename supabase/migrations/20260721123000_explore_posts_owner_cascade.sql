-- Ghost-post cleanup and prevention. explore_posts.user_id previously used
-- ON DELETE SET NULL, so deleting an account (including manual deletions from
-- the dashboard) left the person's posts behind with no owner, still visible
-- in feeds under their cached display name. The delete-account dialog promises
-- posts are removed with the account, so the ownership link now cascades.

-- Remove posts already orphaned by earlier account deletions. Their likes,
-- comments, saves, and reports cascade away through their post_id links.
delete from public.explore_posts where user_id is null;

alter table public.explore_posts
  drop constraint if exists explore_posts_user_id_fkey;

alter table public.explore_posts
  add constraint explore_posts_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete cascade;

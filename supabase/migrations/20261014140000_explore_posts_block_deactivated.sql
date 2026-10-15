-- Deactivated accounts cannot post (2026-10-14).
--
-- A deactivated account's posts are hidden from every feed, but nothing
-- stopped it creating new ones (UrFeed posts, Swip videos, reposts). Like
-- comments (20261006160000), new posts are refused here whatever the client
-- does, until the owner reactivates the account in Privacy settings. Existing
-- posts and edits are untouched.
-- Requires 20261006150000 (explore_author_is_deactivated).

create or replace function public.block_posts_from_deactivated_accounts()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if public.explore_author_is_deactivated(new.user_id) then
    raise exception 'Your account is deactivated. Reactivate it to post.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists explore_posts_block_deactivated on public.explore_posts;
create trigger explore_posts_block_deactivated
before insert on public.explore_posts
for each row execute function public.block_posts_from_deactivated_accounts();

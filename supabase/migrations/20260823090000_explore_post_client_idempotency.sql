-- Idempotency key for the Explore post outbox (Phase 0).
--
-- A queued post carries a client-generated client_post_id that is reused across
-- the first attempt and every retry. The partial unique index below makes a
-- retry of a post that already succeeded conflict (and be recognised as the
-- same post) instead of creating a duplicate.
--
-- Fully additive and backward-compatible: the column is nullable and existing
-- publishers that omit it are unaffected (the unique index only covers non-null
-- values, so any number of legacy rows with a NULL key coexist freely).

alter table public.explore_posts
  add column if not exists client_post_id uuid;

create unique index if not exists explore_posts_user_client_post_id_uidx
  on public.explore_posts (user_id, client_post_id)
  where client_post_id is not null;

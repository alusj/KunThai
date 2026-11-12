-- Usernames may repeat between people (2026-11-12).
--
-- Two people can pick the same username; the KunThai ID (public user id) is
-- what tells accounts apart. Phone numbers and emails stay one-per-account.
--
-- Safe to run more than once.

drop index if exists public.explore_profiles_username_lower_unique_idx;

-- Lookups by username (mentions) stay fast without the unique index.
create index if not exists explore_profiles_username_lower_idx
  on public.explore_profiles (lower(username))
  where username is not null and btrim(username) <> '';

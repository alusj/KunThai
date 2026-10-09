# Explore menu fixes (2026-10-09)

## SQL to run in Supabase (once, in this order)

1. `supabase/migrations/20261009100000_explore_settings_fixes.sql`: settings saving to accounts
   (table, columns and own-row policies for `explore_user_preferences`; existing rows and
   hand-made policies are kept), "Connections only" message privacy, read-receipt check.
2. `supabase/migrations/20261009110000_explore_profile_fixes.sql`: verified badge guard,
   case-insensitive unique usernames (newer duplicates get a short suffix), Space post edit/delete
   for Space owners/admins, Space owner protection.
3. `supabase/migrations/20261009120000_explore_messages_fixes.sql`: blocks enforced on messages and
   new chats, "Hide for me", private message media bucket, one-query inbox and paged threads,
   remove follower.

Each is safe to run more than once. Tests: `supabase/tests/explore_settings_fixes.sql`,
`explore_profile_fixes.sql`, `explore_messages_fixes.sql`.

## Needs the owner

- Legal details for the Policy Center: set `VITE_LEGAL_REGISTERED_ADDRESS`,
  `VITE_LEGAL_GOVERNING_LAW` and `VITE_LEGAL_DISPUTE_JURISDICTION` in Vercel. Until then those lines
  stay hidden.
- Push alerts in the iOS/Android app need a native push plugin (not built yet); Settings says so.

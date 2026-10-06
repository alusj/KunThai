# SQL to run and changes made (branch `claude/repo-access-confirm-jly9i2`)

## SQL to run in Supabase

Run in the **SQL editor** (or `supabase db push`), in this order. Each file is
safe to run more than once.

| # | File | Enables |
|---|------|---------|
| 0 | The read-only check below | Confirms the earlier tables/functions these depend on exist |
| 1 | `supabase/migrations/20261006120000_nearby_top_rated_and_urmall_distance.sql` | Top Rated near you; UrMall nearest-branch distances |
| 2 | `supabase/migrations/20261006130000_transport_fleet_distances.sql` | Real distances in Book a Ride / Send Delivery lists and the radar |
| 3 | `supabase/migrations/20261006140000_review_integrity.sql` | Completed-transaction reviews, edit once, owner/operator can't change ratings |
| 4 | `supabase/migrations/20261006150000_explore_discovery_people_you_know.sql` | Suggestions ranked by who you likely know (with filter + reasons), "likely know" boost in UrFeed/Swip, deactivated accounts' posts hidden |
| 5 | `supabase/migrations/20261006160000_explore_comments_deactivated_and_popular.sql` | Deactivated accounts can't comment (old comments stay); "Popular" suggestion filter |

**Do not run anything in `supabase/tests/`.** Those files rebuild the schema
for testing and are only for a throwaway local database.

Until a migration is applied, the app falls back to the old behaviour (country
list, no distance) instead of breaking.

### Step 0: read-only prerequisite check

An empty result means you are ready. Any row names something an earlier
migration should have created; apply that first (for example
`20260927120000_urride_open_bookings.sql` for
`transport_open_booking_distance_km`, `supabase/area_view_schema.sql` for
`transport_operator_locations`, `20260720090000_verified_transaction_reviews.sql`
for the review columns).

```sql
-- Read-only: lists anything the three new migrations need that is missing.
-- An empty result means you are ready to run them.
with required(kind, name, ok) as (
  values
    ('table',    'transport_fleets',                to_regclass('public.transport_fleets') is not null),
    ('table',    'transport_operators',             to_regclass('public.transport_operators') is not null),
    ('table',    'transport_trips',                 to_regclass('public.transport_trips') is not null),
    ('table',    'transport_operator_locations',    to_regclass('public.transport_operator_locations') is not null),
    ('table',    'transport_operator_reviews',      to_regclass('public.transport_operator_reviews') is not null),
    ('table',    'marketplace_businesses',          to_regclass('public.marketplace_businesses') is not null),
    ('table',    'marketplace_business_locations',  to_regclass('public.marketplace_business_locations') is not null),
    ('table',    'marketplace_orders',              to_regclass('public.marketplace_orders') is not null),
    ('table',    'marketplace_reviews',             to_regclass('public.marketplace_reviews') is not null),
    ('table',    'transport_company_rentals',       to_regclass('public.transport_company_rentals') is not null),
    ('table',    'transport_rental_reservations',   to_regclass('public.transport_rental_reservations') is not null),
    ('table',    'transport_rental_reviews',        to_regclass('public.transport_rental_reviews') is not null),
    ('table',    'transport_companies',             to_regclass('public.transport_companies') is not null),
    ('table',    'transport_company_members',       to_regclass('public.transport_company_members') is not null),
    ('table',    'platform_notifications',          to_regclass('public.platform_notifications') is not null),
    ('function', 'transport_open_booking_distance_km', to_regprocedure('public.transport_open_booking_distance_km(double precision,double precision,double precision,double precision)') is not null),
    ('function', 'can_manage_transport_rentals',    to_regprocedure('public.can_manage_transport_rentals(uuid)') is not null),
    ('function', 'submit_verified_transport_review', to_regprocedure('public.submit_verified_transport_review(uuid,integer,text,uuid)') is not null),
    ('function', 'submit_verified_marketplace_review', to_regprocedure('public.submit_verified_marketplace_review(uuid,integer,text,uuid,text,text)') is not null),
    ('table',    'explore_posts',                   to_regclass('public.explore_posts') is not null),
    ('table',    'explore_profiles',                to_regclass('public.explore_profiles') is not null),
    ('table',    'explore_follows',                 to_regclass('public.explore_follows') is not null),
    ('table',    'explore_content_signals',         to_regclass('public.explore_content_signals') is not null),
    ('table',    'explore_conversation_members',    to_regclass('public.explore_conversation_members') is not null),
    ('table',    'explore_recommendation_privacy',  to_regclass('public.explore_recommendation_privacy') is not null),
    ('table',    'explore_user_blocks',             to_regclass('public.explore_user_blocks') is not null),
    ('function', 'kunthai_user_is_guest',           to_regprocedure('public.kunthai_user_is_guest(uuid)') is not null),
    ('function', 'is_kunthai_admin',                to_regprocedure('public.is_kunthai_admin(uuid)') is not null),
    ('function', 'get_recommended_feed',            to_regprocedure('public.get_recommended_feed(uuid,integer,integer)') is not null),
    ('function', 'get_recommended_swip',            to_regprocedure('public.get_recommended_swip(uuid,integer,integer)') is not null)
),
required_columns(tbl, col) as (
  values
    ('transport_fleets', 'company_id'), ('transport_fleets', 'is_visible_to_passengers'), ('transport_fleets', 'active_status'),
    ('transport_fleets', 'country_iso'), ('transport_fleets', 'fleet_type'), ('transport_fleets', 'verification_status'),
    ('transport_operators', 'user_id'), ('transport_operators', 'verification_status'),
    ('transport_trips', 'updated_at'), ('transport_trips', 'operator_accepted_at'),
    ('marketplace_orders', 'updated_at'), ('marketplace_orders', 'seller_responded_at'),
    ('marketplace_reviews', 'buyer_id'), ('marketplace_reviews', 'order_id'), ('marketplace_reviews', 'product_id'), ('marketplace_reviews', 'review_type'),
    ('transport_operator_reviews', 'trip_id'), ('transport_operator_reviews', 'passenger_id'),
    ('transport_rental_reservations', 'updated_at'),
    ('explore_profiles', 'deactivated_at')
)
select kind, name as missing from required where not ok
union all
select 'column', tbl || '.' || col
from required_columns rc
where not exists (
  select 1 from information_schema.columns c
  where c.table_schema = 'public' and c.table_name = rc.tbl and c.column_name = rc.col
);
```

## Not SQL, but needed

- **Vercel → Environment Variables (server-only, no `VITE_` prefix):**
  `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY` (the `.p8` text), then
  redeploy. Needed for Apple token revocation when an Apple user deletes their
  account in the iOS app.
- **Vercel → Preview environment:** separate Supabase project and sandbox
  payment keys (see `docs/deploy-process.md`).
- **GitHub → Branch protection on `main`:** require the "CI / Lint, test and
  build" check.
- **Supabase → Auth → URL Configuration:** keep `app.kunthai.mobile://**` and
  the site URL in Redirect URLs.
- **Calendar reminder:** the Apple client secret pasted into Supabase expires
  (at most six months after it was generated); web/Android Apple sign-in stops
  working then.
- **Mac:** `npm ci && npm run build && npx cap sync ios`, then build in Xcode
  and confirm "Sign in with Apple" under Signing & Capabilities.

## Changes made, by commit

1. **3e581fc — Comments, offline, CI**
   - Comment sort (Newest / Top / Oldest), remembered; "1 response" singular.
   - Recently opened comment threads saved on the device for offline use.
   - App start waits at most 2.5 s for the account check on a weak connection.
   - Swip quick deck: "Hold tools" label removed.
   - CI workflow (lint, translations, unit tests, build) and
     `docs/deploy-process.md`; two existing lint errors fixed.
2. **5577447 — Sign in with Apple**
   - Native Apple sheet on iOS (in-app plugin, entitlement), browser flow kept
     on web/Android.
   - Apple/Google/Facebook names pre-fill onboarding (editable).
   - `/api/apple-revoke`: Apple token revocation before account deletion on iOS.
3. **5ea67a6 — Top Rated near you, UrMall distances**
   - Top Rated ranked around the passenger (live/recent operator position,
     widening radius, weighted rating, "New near you").
   - Operators send a fresh position when the app returns to the foreground.
   - UrMall ranks by the nearest store branch and shows distance on cards.
4. **4042216 — Real distances everywhere, traffic honesty**
   - Book a Ride / Send Delivery lists and the radar show measured distances;
     the fake "0 km away – ETA N/A" removed at its source.
   - Nearby Area guide: "Traffic information is an estimate".
   - Traffic signals ignore parked operators, stale and imprecise GPS.
5. **8480f11 — Review integrity, operator SOS**
   - Reviews only after completed transactions, within 30 days; edit once
     within 7 days; no self-reviews; owners/operators can only reply.
   - Operator live-trip emergency opens Nearby Area SOS instead of dialing 112.
6. **4cf8a12 — Messaging notice, UrMall coverage**
   - "Private" / "Supervised" + Read more instead of the long card.
   - UrMall explains when a country has no sellers yet.
7. **Explore discovery (this commit)**
   - Suggested accounts ranked: follows you > mutual connections > chatted >
     near you > similar interests > new; reason shown on each person; filter
     (Recommended / People you may know / Near you / New) on the UrFeed card
     and Connections → Suggested.
   - UrFeed/Swip: "likely know" boost; the feed no longer stops after ~50
     posts (Swip ~36): it continues with recent posts.
   - Deactivated accounts' posts hidden everywhere (owner and admins excepted);
     deactivated and guest accounts never suggested.
8. **Comments, card schedule, Popular**
   - Deactivated accounts keep old comments but cannot comment; the comment
     box explains how to reactivate.
   - Suggestions card after the 8th post, then every 35 posts, each showing
     new people; one shared request for all cards.
   - "Popular" filter (most-followed first).
   - Explore was checked: content is not limited by country; nearby is only
     boosted, every country is included.
9. **Email account recovery (no phone access)**
   - No SQL needed. It uses Supabase Auth and the existing identity tables.
   - Onboarding email field: the "(optional)" wording is gone (the field is
     still optional), and "For account recovery · Read more" explains why.
   - Settings → Security → Recovery email shows Confirmed / Waiting for
     confirmation / Not confirmed / Not added. People can add or change the
     email there and send or resend the confirmation link.
   - Login → "Can't access your phone? Recover with email" sends a one-time
     sign-in link (and a code, if the email template includes it). It never
     creates an account, and it shows the same answer for unknown emails so
     nobody can find out who has an account.
   - After that sign-in, KunThai asks for a new password, so phone number +
     password works again without SMS.

   **Supabase dashboard settings (one-time):**
   - Authentication → Providers → Email: enabled, with "Confirm email" on.
     Recovery only works for a confirmed email.
   - Authentication → URL Configuration → Redirect URLs must include the web
     origin (https://kunthai.app) and `app.kunthai.mobile://**`. Both are
     already used by social sign-in.
   - Authentication → Email Templates → Magic Link: add `{{ .Token }}` to the
     template so a person who opens the email on another device can type the
     code instead.
   - Set up custom SMTP (Authentication → Emails). The built-in sender is
     rate-limited to a few emails per hour, which is too few for production.

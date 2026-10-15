# UrRide live operator discovery (Phase 1) — 2026-10-15

Passengers now see operators who are really available nearby, the way Uber and Bolt show them, instead of every operator whose Active switch is on.

## What changed

### Database (new function only)
`supabase/migrations/20261015130000_urride_live_discovery.sql` adds
`public.transport_available_operators_nearby(p_lat, p_lng, p_radius_km = 15, p_fleet_type = null, p_limit = 20, p_country = null, p_include_recent = false)`.

- `availability = 'available'`: the location row is `online` and `last_seen_at` is within **2 minutes**.
- `availability = 'busy'`: the location row is `busy` and `last_seen_at` is within 2 minutes.
- `availability = 'recent'` (only with `p_include_recent`): the Active switch is on, but the phone hasn't checked in for over 2 minutes. Positions older than 3 hours are left out.
- The fleet must be Active, visible to passengers (company fleets), and registered in `p_country`. That has to be an ISO alpha-2 code: with no code, the function returns no rows. These are the same rules as `transport_top_rated_nearby`.
- Verification: every verification state is listed, the same as every other passenger list. The app still shows each operator's verification badge ("Not Verified", "Verification Pending" and so on).
- `last_seen_place`: the readable place the operator's phone recorded with its latest position, stored in `transport_operator_locations.metadata->>'place'`. It is never the fleet's registered city or base, and it is `null` when the phone hasn't recorded one.
- The radius is clamped to 1–50 km and the limit to 1–50. Rows are filtered by bounding box first, then by haversine distance, and sorted by distance (live rows first, then recent ones).
- Security: the function is `SECURITY DEFINER` with a fixed `search_path` and is granted to `anon` and `authenticated`, like the other nearby RPCs. It returns the fleet id, name, type, service category, verification status, the distance (`distance_km` rounded to 0.1 km and `distance_m` rounded to 10 m), the ETA, `last_seen_at`, `last_seen_place` and availability. It never returns coordinates, phone numbers or the raw metadata.
- Adds the indexes `transport_operator_locations_last_seen_idx` and `transport_operator_locations_lat_lng_idx`, using `if not exists`. The second one usually exists already.
- No existing function, table or row is changed. The migration can be run more than once.

### Passenger app (UrRide home, "Live Operators" tab)
- When the passenger's position is known (the app never prompts for it) and the RPC exists, the list shows:
  - **Available near you**: nearest first. Each card shows "1.4 km · 4 min away" and an **Available** or **Busy** badge. When the phone recorded a last-seen place, the place line shows it; otherwise there is no place line (the fleet's registered city is not shown here).
  - **Recently online**: a smaller group below, with no ONLINE badge. Each card says "Last seen near Lumley Beach Road · 1.4 km away · 12 min ago", or "Last seen 1.4 km away · 12 min ago" when no place was recorded.
  - Distances read "850 m" under 1 km, "1.4 km" with one decimal, and "12 km" from 10 km. Times read "just now", "3 min ago" or "1 h 20 min ago".
  - When no one is available: "No available operators within 15 km right now". On Business / Both accounts it also shows a "Send an open booking" button.
- Operators who aren't verified are listed and sorted exactly like verified ones and keep their existing verification badge. There is no filter or toggle for them.
- The list refreshes every 10 s while it is on screen. It pauses when the app is hidden or the Rentals tab is open, never sends two requests at once, and only re-renders when something changed, so there is no flicker and the scroll position stays. A change to `transport_operator_locations` within reach of the passenger also triggers a refresh (realtime, debounced 2 s, at most every 5 s). Fleet details are cached for 60 s, so a refresh is usually a single RPC call.
- **Fallback:** with no known position, or when the RPC is missing (`PGRST202` / `42883`), the list behaves exactly as before. The client stops calling a missing RPC for the rest of the session.
- Card actions are unchanged: Open booking, Profile, Save operator and the verification details.

### Operator app
- The live-location heartbeat now runs every 30 s instead of 60 s. Movement publishing is unchanged (6 s / 12 m).
- The phone looks up a readable place for its position with the app's existing reverse geocoder (`reverseGeocodeLabel`). It only does this after moving 300 m or more, or every 5 minutes (after moving at least 30 m), or once a minute until it has a first label. It never looks up on every publish, and publishing never waits for it. The place is saved with each position as `metadata.place`. If a lookup fails, the previous label is kept, unless the operator is now more than 1 km from where that label was found, in which case it is cleared. No schema change.
- While Active, the dashboard shows either a green "Visible to passengers · location shared Ns ago" line or an amber "Not visible to passengers — keep KunThai open to share your location" warning with a **Share location** button. The button can show the permission prompt. Nothing prompts by itself when the dashboard loads.

## SQL to run (Supabase SQL editor)
Run the whole file `supabase/migrations/20261015130000_urride_live_discovery.sql`. It is safe to run again. The app works before it is applied, using the fallback.

## Verify in production (read-only)
```sql
-- 1. Function present, definer, granted
select p.proname, p.prosecdef,
       has_function_privilege('anon', p.oid, 'execute') as anon_exec
from pg_proc p where p.proname = 'transport_available_operators_nearby';

-- 2. Indexes
select indexname from pg_indexes
where tablename = 'transport_operator_locations'
  and indexname in ('transport_operator_locations_last_seen_idx', 'transport_operator_locations_lat_lng_idx');

-- 3. Who is live right now (counts only)
select status, count(*) filter (where last_seen_at > now() - interval '2 minutes') as fresh_2min,
       count(*) filter (where last_seen_at > now() - interval '3 hours') as within_3h
from public.transport_operator_locations group by status;

-- 4. Try it around a known point (Freetown here)
select fleet_name, verification_status, distance_km, distance_m, eta_minutes, availability, last_seen_at, last_seen_place
from public.transport_available_operators_nearby(8.484, -13.234, 15, null, 20, 'SL', true);

-- 4b. How many live positions carry a readable place (after the app update)
select count(*) filter (where metadata ? 'place') as with_place, count(*) as total
from public.transport_operator_locations where last_seen_at > now() - interval '3 hours';

-- 5. The table is still in the realtime publication
select tablename from pg_publication_tables
where pubname = 'supabase_realtime' and tablename = 'transport_operator_locations';
```

## Tests
- `supabase/tests/urride_live_discovery.sql` (disposable `urride_live_discovery_test` database). It covers fresh vs stale at the 2-minute boundary, busy, distance order and metres, radius and limit clamps, the country boundary, every verification state being listed, the last-seen place coming from the latest location row and never from the fleet's registered city, hidden company fleets and fleets switched off, the fleet type filter, the security model, and running the migration twice.
- `src/components/services/liveDiscovery.test.js`: grouping, the distance formatter (999 m gives "999 m", 1000 m gives "1.0 km", 9.96 km gives "10 km"), the last-seen formatter, labels, the fallback decision, the realtime filter, operator visibility and the refresh scheduler.
- `src/i18n/urrideLiveDiscovery.test.js`: all 15 locales have every key with matching placeholders.

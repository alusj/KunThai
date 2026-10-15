# UrRide broadcast bookings (Phase 3): 2026-10-15

An open booking now goes to every operator who is available nearby, all at once. The first operator to accept gets the trip, like a broadcast. Before, it went only to the nearest five.

## Behaviour

### Who gets the request
An operator receives the request when all of these are true:
- The fleet matches the vehicle type and the service (ride or delivery).
- The fleet's Active switch is on.
- A company fleet must be visible to passengers.
- The fleet is registered in the passenger's country.
- No admin restriction applies to the operator or the company.
- The operator is not already on a trip.
- The operator is not the passenger.
- Neither of them has blocked the other (`explore_user_blocks`, when that table exists).
- The operator is available under the Phase 1 rule: the live position is `online`, it is not marked unavailable, and `last_seen_at` is within the last 2 minutes.

Each operator gets one request, even if they have several fleets. Each wave reaches at most 30 operators, nearest first. Distance is used only to apply that cap.

### Waves
| Wave | Radius | Lasts |
|------|--------|-------|
| 1 | 5 km | 45 s |
| 2 | 10 km | 45 s |
| 3 | 20 km | 45 s |
| 4 | 30 km | 45 s |

- When no one has accepted by the end of a wave, the next wave adds the operators it can reach who have not had the request yet. Nobody receives the request twice.
- A ring with no new operators is skipped.
- If every open request has been declined, the next wave starts right away.
- After the last wave the booking becomes `expired` and every request still open becomes `expired`. The passenger sees "No operator accepted" with **Try again** and **Raise your fare**. Raise your fare steps up economy → average → priority, then adds 15 %.
- Each request row stores `broadcast_expires_at`, which is the end of its wave plus 15 s of grace. A new wave extends the requests that are still open. A request past that time cannot be accepted, and the operator app hides its Accept button.
- **What moves the waves:** the passenger app polls `transport_broadcast_booking_status` every 5 s while the panel is visible, refreshes at once on any realtime change to the requests, and calls `expand_transport_broadcast_booking` when the wave timer ends. The server never widens the search before a wave is over, and repeated calls are harmless. If `pg_cron` is installed, the migration also schedules `urride-broadcast-tick` every minute, so bookings keep widening and expiring with the app closed. Without pg_cron, a booking left alone stops at the current wave: its requests expire 15 s after that wave ends, and the next status call or tick closes the booking. No secrets are used.
- **When the app sends the older open booking instead:** if nobody is available within 30 km, or the pickup is scheduled more than 15 minutes ahead, the app falls back to the existing `create_transport_open_booking` (nearest 5, then active fleets, then all fleets). It does the same while the new migration is not applied. In that case the panel shows "Sent to N operators" and "Waiting for an operator to accept", without waves.

### First accept wins
- The operator app accepts with `accept_transport_broadcast_request(trip_id, fare_amount?, fare_currency?)`.
  - It takes the booking's advisory lock **before** it locks any trip row, so concurrent accepts wait in line instead of deadlocking.
  - The first accept commits and every other open request flips to `taken` in the same transaction.
  - Each later accept gets `{ok:false, reason:'taken', message:'Another operator accepted this trip.'}`, with no error raised.
  - Other reasons are `withdrawn`, `expired` and `unavailable`. The operator sees one note and one toast, never two.
- **The old path was not race-safe.** The 2026-09-27 claim trigger locks the operator's row, then takes the advisory lock, and the settle trigger then needs the other accepter's row. Two simultaneous accepts deadlocked, and the loser got Postgres's "deadlock detected" error. There was still only one winner, but the message was wrong.
  - Accepts through the new RPC no longer deadlock.
  - For broadcast bookings, the settle trigger skips rows that a concurrent writer holds (`for update skip locked`). This covers the direct status update that older app versions still use: the loser now gets "Another operator accepted this trip.", and the next status call or tick closes any request it leaves open.
  - The app also maps a deadlock error to the same message.
- Older open bookings (those without a `transport_broadcast_bookings` row) keep the exact messages and alerts they had before.

### Notifications
- Each request row is inserted once. The existing `transport_notify_trip_changes()` INSERT alert, and any push built on it, therefore fires once per operator.
- `taken`, `withdrawn`, `expired` and `declined` are not in any status that the notification triggers announce.
- For broadcast bookings, the settle trigger sends no "Open request taken / withdrawn" alerts.
- When an operator declines a broadcast request, it is stored as `declined` instead of `cancelled`. The passenger is not told "Operator declined" up to 30 times, and the request does not appear in the operator's history.
- When the passenger cancels from the panel (`cancel_transport_broadcast_booking`), every open request is withdrawn at once and nobody is notified. The older path, cancelling one request in Trips, still withdraws the rest.
- No push infrastructure was added or changed.

### Passenger app (open booking sheet)
After sending, the sheet becomes **Finding an operator…**. It shows:
- "Sent to N operators nearby".
- The time spent searching.
- The current wave, for example "Searching a wider area (10 km)…", with a countdown.
- **Cancel request** and **Keep searching in Trips**.

When an operator accepts, the sheet shows their name, fleet, vehicle and plate, plus the distance and ETA (from a position at most 10 minutes old; coordinates are never sent to the app). **Continue to trip** opens Trips, where the normal trip flow continues.

### Operator app
- Each open request in Passenger requests shows "Open request · first to accept wins" and an "Expires in m:ss" countdown. Once it expires, it shows "This request expired." and the Accept and Decline buttons are hidden.
- When a request is taken by someone else, withdrawn or expires, it leaves the queue at once (realtime, with the dashboard cache bypassed) and a short note appears, such as "Taken by another operator".

## SQL to run (Supabase SQL editor)
Run the whole file `supabase/migrations/20261015150000_urride_broadcast_bookings.sql` **after** these files:
- `20260927120000_urride_open_bookings.sql`
- `20260927140000_urride_open_booking_reach.sql`
- `20261001150000_admin_operations_platform.sql`
- `20261015130000_urride_live_discovery.sql`

The migration can be run more than once.

It **adds**:
- The `transport_trips.broadcast_expires_at` column (nullable) and its index.
- The `transport_broadcast_bookings` table, with RLS: passengers can read their own bookings.
- Helpers, with execute revoked from clients: `transport_broadcast_radii`, `transport_open_booking_lock`, `transport_broadcast_candidates`, `transport_broadcast_send_wave`, `transport_broadcast_snapshot`, `transport_broadcast_advance`, `transport_broadcast_tick`.
- RPCs for `authenticated`:
  - `create_transport_broadcast_booking`, with the same arguments as `create_transport_open_booking`
  - `transport_broadcast_booking_status`
  - `expand_transport_broadcast_booking`
  - `cancel_transport_broadcast_booking`
  - `accept_transport_broadcast_request`
- An optional pg_cron job.

It **replaces**, with the same names and signatures, the trigger functions `transport_open_booking_claim()` and `transport_open_booking_settle_group()`. Older open bookings behave as before.

It changes no existing row and drops no data. `create_transport_open_booking` is unchanged.

The app works before the migration is applied, through the fallback.

## Verify in production (read-only)
```sql
-- 1. Objects present, RPCs granted, helpers private
select p.proname, p.prosecdef,
       has_function_privilege('authenticated', p.oid, 'execute') as auth_exec,
       has_function_privilege('anon', p.oid, 'execute') as anon_exec
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and (p.proname like '%broadcast%' or p.proname in ('transport_open_booking_claim', 'transport_open_booking_settle_group'))
order by p.proname;

select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'transport_trips' and column_name = 'broadcast_expires_at';

-- 2. pg_cron job (only when pg_cron is installed)
select jobname, schedule, command, active from cron.job where jobname = 'urride-broadcast-tick';

-- 3. Bookings by state (last 24 h)
select status, count(*), round(avg(notified_count), 1) as avg_reached, max(wave) as max_wave
from public.transport_broadcast_bookings
where created_at > now() - interval '24 hours'
group by status;

-- 4. Requests by state for broadcast bookings (last 24 h)
select trip.status, count(*)
from public.transport_trips trip
join public.transport_broadcast_bookings booking on booking.open_booking_id = trip.open_booking_id
where booking.created_at > now() - interval '24 hours'
group by trip.status order by 2 desc;

-- 5. Integrity: never more than one winner per open booking (expect no rows)
select open_booking_id, count(*)
from public.transport_trips
where open_booking_id is not null
  and status in ('accepted', 'arrived', 'start_requested', 'in_progress', 'paused', 'completed')
group by open_booking_id having count(*) > 1;

-- 6. Stale open requests left behind (expect no rows, or only a few seconds old)
select id, open_booking_id, broadcast_expires_at
from public.transport_trips
where status in ('requested', 'waiting_operator', 'pending_confirmation')
  and broadcast_expires_at < now() - interval '2 minutes';

-- 7. Operators available under the Phase 1 rule right now (count only)
select count(*) from public.transport_operator_locations
where status = 'online' and last_seen_at > now() - interval '2 minutes';
```

## Tests
- **`supabase/tests/urride_broadcast_bookings.sql`** runs on the disposable `urride_broadcast_bookings_test` database. It loads the migration twice. It covers:
  - Reach to all 8 available operators (more than 5), and exclusion of: stale (over 2 minutes), location busy, offline, unavailable, inactive fleet, hidden company fleet, other vehicle type, delivery-only, other country, the passenger themself, an operator on a trip, and a blocked operator.
  - Waves 5 → 10 → (empty 20 skipped) → 30 km with no duplicates, the 30-per-wave cap with 36 tricycles, and that earlier requests are extended.
  - Decline stored as `declined` with no notification, expiry with its message and a clear refusal afterwards, and first accept winning with the rest `taken` and only one passenger notification.
  - The loser's reason and message, the accepted snapshot without coordinates, cancel withdrawing everything with nobody notified, the older cancel path, a stale request refused, and the no-reach fallback signal.
  - A real two-connection race through the RPC (dblink): exactly one winner, and the second waits rather than deadlocking.
  - A two-connection race through direct updates (older app): one winner, the loser gets the clear message, and the left-over request is tidied.
  - The pg_cron tick, older open bookings unchanged, and grants.
- **`supabase/tests/urride_open_bookings.sql`** now also loads the new migration, to prove that older open bookings behave exactly as before.
- **`src/components/services/broadcastBookingModels.test.js`** covers the fallback decision, the wave and timer view, poll pacing, raise fare, accept outcomes, and the operator countdown and notes.
- **`src/i18n/urrideBroadcastBooking.test.js`**: all 15 locales have every key, the placeholders match, nothing is copied from English, and the English toasts are 15–25 characters.

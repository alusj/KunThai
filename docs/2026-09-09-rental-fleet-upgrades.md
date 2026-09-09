# Rental fleet upgrades

Rental registration now creates its rental record automatically, initially unavailable. Existing rental fleets are backfilled without duplicating their rental records. Registration collects rental conditions, deposit, pickup pin, pricing, a cover image, and the vehicle views; cars and taxis include front and back interiors.

Company Rentals uses cover cards with availability switches and dedicated requests, history, reviews, editing, availability and deletion screens. Rental fleets are excluded from the separate operator fleet list. Deletion hides the rental and preserves history; it is blocked while requests or rentals remain open. Deleted fleet history remains accessible from Company Rentals.

Company Rentals now opens with an operations dashboard: fleet/availability counts, requests, active rentals, upcoming pickups, search and filters. Tapping a company vehicle opens its dedicated dashboard with a direct availability switch, photos, rates and management shortcuts. Reservation totals use company-scoped records under the existing row-level permissions, with pagination and explicit error states. Use Refresh dashboard for current activity; returning from a management screen refreshes the overview.

Passenger rental cards open from the cover, text or card background using a full-card keyboard-accessible button. Menus and company availability controls are separate click targets, so operating them does not open the vehicle by accident.

Passenger discovery reuses a recent public snapshot and deduplicates simultaneous loads. It does not poll. Explicit refresh and a one-minute cache expiry allow fresh discovery without blanking existing cards. Reservation updates use realtime plus manual refresh. Passenger details include availability checking, requests, reservation status, history, verified renter reviews, and a swipe/zoom image viewer.

Negotiable or distance-only pricing accepts a request without inventing a charge. An owner/admin proposes a total, the renter accepts that exact proposal, and only then may the company confirm dates. Confirmed date overlaps remain protected by the database lock and date guard.

## Rollout

Apply `supabase/migrations/20260909120000_rental_fleet_experience.sql` before deploying the frontend. It depends on the earlier company rental and flexible pricing migrations. The migration was tested in an isolated PostgreSQL 16 database, not applied to a live Supabase project in this task.

Existing incomplete rental fleets remain unavailable until their owner supplies missing conditions, photos, pricing or pickup information through Edit fleet. Existing published fleet records are retained. In-app and push notification rows are generated for reservations, price proposals/acceptance, fleet changes affecting open reservations, and renter reviews. Actual push delivery still depends on the existing notification worker and device subscriptions.

## Validation

In an empty isolated PostgreSQL database, run these scripts with `psql -v ON_ERROR_STOP=1` in order:

1. `supabase/tests/rental_experience_setup.sql`
2. `supabase/tests/transport_rentals.sql`
3. `supabase/tests/rental_experience.sql`

They cover automatic creation, duplicate prevention, authorization, visibility, overlapping dates, immutable reservation terms, negotiable price acceptance, review eligibility, notifications, and deletion/history protection.

Run `npm run test:unit` and `npm run build`. The changed files pass targeted ESLint. Full repository lint currently has unrelated errors in `screenshotCaptureService.test.js` (`Buffer`) and `NearbyAreaMap.jsx` (`easeInOutSine`). A local fixture preview was used to verify the company menu, dedicated passenger availability screen, mobile cards, and gallery navigation/zoom; the temporary preview was removed after verification.

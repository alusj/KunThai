# KunThai Engineering Summary - 19 July 2026

## Purpose

This document records the functional work completed during the 19 July 2026 development session. It focuses on behavior that remains in the project and excludes the forced referral gate that was deliberately rolled back.

## Executive Summary

Today's work strengthened six areas:

1. Admin case controls, action history, undo permissions, and account-deletion handling.
2. Clear inline validation across account, Space, UrMall, and UrRide registration.
3. UrMall and UrRide notification separation, badges, background activity, and action-based clearing rules.
4. Visibility credits and referral-based earning without blocking adverts or promotions behind forced sharing.
5. Global country coverage across authentication, feature availability, transport, marketplace, and emergency-contact data.
6. Guest isolation in Explore Connections and dark-mode visibility-credit polish.

## Admin Case Controls

- Expanded the professional admin operating guide in `docs/admin-case-controls-and-decisions.md`.
- Documented case workflow controls separately from source-record decisions.
- Documented case claiming, status changes, internal notes, approval requirements, and action history.
- Added clear undo rules for the admin who performed an action and higher-authority Chief or Super Admin roles.
- Documented RLS, permission, sector scope, authority level, and two-admin approval expectations.
- Covered account restrictions, suspensions, restoration, verification decisions, content removal, and account-deletion requests.
- Clarified that an account-deletion request must be reviewed and approved before irreversible deletion work.
- Documented notification action menus, related-case navigation, audit history, dismiss/read controls, and undo availability.

## Registration Validation

- Added shared invalid-field navigation in `src/components/shared/formValidationNavigation.js`.
- Required-field failures now show an inline red message beside the relevant field.
- A blocked Continue or Submit action scrolls and focuses the first invalid field.
- Validation summaries remain short and direct instead of presenting a long generic error.
- Applied the behavior to account onboarding profile fields.
- Applied the behavior to Explore Space creation.
- Applied the behavior to UrMall business registration.
- Applied the behavior to UrRide company registration.
- Applied the behavior to UrRide fleet/operator registration.
- Preserved previously entered values while navigating back to fix a field.

## Explore And Profile Improvements

- Removed the standalone Create Space row from the Social Menu Spaces list.
- Kept the Spaces list focused on identities that already exist.
- Moved Create Space into the real profile action menu represented by the three-dot button.
- Positioned the KunThai identity code and visibility-credit information at the top of the profile.
- Kept profile sharing and credit information understandable without introducing a payment dependency.
- Corrected the visibility-credit card to use a restrained, high-contrast surface in dark mode.

## Guest Connection Isolation

- Guest sessions now receive empty Connected, Connects You, and Suggested lists in Explore Connections.
- Connection and follow caches are bypassed for guests, and the cache version was advanced so old directory results cannot flash on screen.
- Registered users no longer receive guest profiles or guest-owned Spaces in connection results.
- Added `supabase/migrations/20260719210000_explore_guest_connection_isolation.sql`.
- The migration removes anonymous identity and connection rows left by older guest-mode versions.
- Database triggers prevent anonymous visitors from creating an Explore profile or Space identity.
- RLS distinguishes Supabase anonymous visitors from registered users even though both sessions use the `authenticated` role.
- Registered-user follower counts and incoming connection visibility remain intact while guest rows are excluded.

## Visibility Credits

- Kept visibility credits as the non-payment promotion resource.
- A verified invited user awards 5 visibility credits.
- Credits are stored in the user's wallet and can be accumulated.
- Advert and promotion surfaces can display the available balance before credits are used.
- Credit use can be based on the selected visibility level instead of forcing the user to spend the full balance.
- The earlier forced Share to 5 People gate for every advert or promotion was removed.
- Sharing can earn credits, but a user is not blocked while waiting for invited people to join.
- The application does not present an unavailable payment method as an active option.

## UrMall Notifications

- Separated UrMall activity into orders, messages, and ordinary notifications.
- Standardized short toast copy:
  - `URMALL UPDATE` / `You have a new order.`
  - `URMALL UPDATE` / `You have a new message.`
  - `URMALL UPDATE` / `You have a new notification.`
- Added a global activity host so UrMall activity is detected while another KunThai sector is open.
- Added the aggregate badge to the main UrMall tab.
- Preserved exact source badges inside UrMall.
- Added the buyer pending-order badge to the buyer menu icon.
- Message badges clear when the conversation is opened and read.
- Ordinary notification badges clear when viewed.
- Order badges do not clear merely because the order list was opened.
- Order badges clear after an operational status action removes the order from the pending queue.
- Removed older screen-local announcement effects that could produce duplicate toasts.

## UrRide Notifications

- Separated UrRide activity into bookings and ordinary notifications.
- Standardized short toast copy:
  - `URRIDE UPDATE` / `You have a new booking.`
  - `URRIDE UPDATE` / `You have a new notification.`
- Added the aggregate badge to the main UrRide tab.
- Preserved source badges on the passenger notification icon and operator/company icon.
- Preserved detailed booking and notification badges inside operator and company workspaces.
- Removed orphan UrRide counts by excluding company activity the current role cannot open.
- Routed operator requests to the request icon, operator alerts to the bell, and company activity to the Fleet HQ icon.
- Corrected Fleet HQ booking visibility so operator-scoped bookings appear on the company booking icon even when the raw company queue is empty.
- Passenger and operational notification badges clear when viewed.
- Booking badges remain until an action changes the booking or trip out of the actionable queue.
- Opening a booking by itself does not clear the booking badge.
- Added realtime refresh listeners plus a controlled polling fallback for missed realtime events.

## Background And System Notifications

- Connected UrMall and UrRide activity to the existing KunThai notification-banner service.
- Added service-worker notification targets for `urmall:*` and `urride:*` destinations.
- Added system notifications when KunThai is hidden or unfocused and browser notification permission is already granted.
- Kept focused-screen banners concise and tappable.
- Preserved the existing Explore message and notification behavior.
- Fully closed-app delivery continues through the existing server Web Push infrastructure and saved push subscriptions.

## Toast And Connectivity Polish

- Limited normal toast content to one or two short lines.
- Added consistent topic headers instead of long explanatory titles.
- Shortened connectivity states to clear messages such as:
  - `Network unavailable.`
  - `Network unstable.`
  - `Network restored.`
- Added toast deduplication so repeated state updates do not flood the screen.

## Global Country Coverage

- Confirmed the account phone catalogue contains all 252 international dialing-profile entries.
- Confirmed UrMall country selection uses the shared global country profiles.
- Confirmed UrRide company and fleet registration use the shared global country profiles.
- Confirmed the admin country filter uses the shared global country profiles.
- Confirmed the database global rollout seeds every dialing-profile country into `kunthai_countries`.
- Confirmed every feature is enabled globally in `kunthai_country_feature_settings`, while country-specific configuration remains available.
- Removed the obsolete frontend split between existing West African markets and other countries.
- Kept old West African export names only as backward-compatible aliases to the full global catalogue.
- Updated global fallback messaging for adverts and phone authentication.

## Phone Country Selection

- Removed the default country and dial code from phone sign-in and account creation.
- A user must explicitly select a country before the phone field becomes available.
- The selected country controls the dial code, placeholder, formatting, and phone-length validation.
- Changing the country clears previously entered national digits to prevent submitting a number under the wrong dial code.
- Sign-in, signup, recovery, identity checks, and OTP requests continue to receive the selected country context.

## Global Emergency Contacts

- Added a `national` emergency-number column to the emergency-contact schema.
- Added the migration `supabase/migrations/20260719193000_global_emergency_country_coverage.sql`.
- Every country in `kunthai_countries` now receives an `emergency_contacts` row.
- Added common European 112 coverage and the existing known international emergency catalogue.
- Preserved the curated West African service numbers.
- Added metadata that distinguishes global coverage, known catalogue numbers, regional standards, and pending official review.
- Added a database trigger that automatically creates an emergency row when a new country is added later.
- Removed unsafe 112/911 guesses for countries whose numbers are not verified.
- Countries awaiting verification show no guessed call number and direct users to nearby emergency search.
- Official `source_url` and `verified_at` values should be added country by country before marking a record verified.

## Database And Security

- Emergency-contact reads remain available to anonymous and authenticated users through a read-only RLS policy.
- Country-to-emergency synchronization runs as a controlled database trigger.
- Existing admin action migrations continue to enforce authority and undo rules in the database rather than trusting UI visibility.
- Visibility-credit migrations keep earning and spending server-controlled.
- Explore connection RLS now fails closed for anonymous or missing identities and prevents guest directory access.

## Verification Completed

- `npm.cmd run build` completed successfully.
- `npm.cmd run lint` completed with no errors.
- Five pre-existing lint warnings remain in unrelated admin, two-factor, and UrRide registration hook code.
- `git diff --check` completed without whitespace errors.
- The local application loaded successfully at `http://localhost:3000`.
- The authentication screen was checked with no default country or dial code selected.
- `supabase db push --dry-run` recognized the new global emergency migration.
- The dry run also recognized the Explore guest-connection isolation migration.

## Deployment Notes

The dry run reported these pending migrations before the new emergency migration:

- `20260716170000_visibility_credit_wallet.sql`
- `20260717093000_visibility_credit_hardening.sql`
- `20260717094500_visibility_credit_schema_align.sql`
- `20260717120000_marketplace_message_media.sql`
- `20260717133000_admin_activity_notification_actions.sql`
- `20260717143000_admin_case_action_tools.sql`
- `20260717150000_company_operator_availability_fallback.sql`
- `20260719193000_global_emergency_country_coverage.sql`
- `20260719210000_explore_guest_connection_isolation.sql`

Review and apply the pending migrations together in timestamp order. The dry run did not modify the remote database.

## Deliberately Excluded Or Reverted

- The forced referral task shown after every advert form was reverted.
- The forced referral task shown before every UrMall promotion was reverted.
- Visibility credits remain available as a voluntary earned resource instead.
- An unavailable UrMall payment method is not presented as a required registration step.

## Remaining Operational Checks

- Run authenticated multi-account QA for seller/buyer messages, orders, operator bookings, and company notifications.
- Test enabled Web Push on desktop, Android, and installed iOS PWA environments.
- Verify emergency numbers against official national sources and populate `source_url` and `verified_at`.
- Apply the pending Supabase migrations after the normal database review and backup process.

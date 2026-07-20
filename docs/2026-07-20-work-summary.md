# KunThai Engineering Summary - 20 July 2026

## Purpose

This document records the review-security and interface-polish work completed on 20 July 2026. It continues the [19 July work summary](./2026-07-19-work-summary.md).

## Executive Summary

Today's work strengthened four areas:

1. UrMall reviews are now tied to real orders acknowledged by the seller.
2. UrRide reviews are now tied to real bookings accepted by the operator.
3. The UrRide operator/register control waits for account resolution so registered users never see a false Register state.
4. Profile explanation controls now use a circular question mark instead of an exclamation mark.

## Verified UrMall Reviews

- Added `supabase/migrations/20260720090000_verified_transaction_reviews.sql`.
- Added a protected `seller_responded_at` marker to marketplace orders.
- Buyer-created orders cannot set or forge the seller-response marker.
- The marker is written when the business owner changes an order to shipped, completed, cancelled, or refunded.
- Only shipped, completed, or refunded orders qualify for a review; cancelled orders do not.
- Every new store or product review is linked to a qualifying order.
- A qualifying order can be used only once for the same review scope.
- Product reviews additionally require the reviewed product to match the product stored on the order.
- Direct table inserts are checked by a database trigger, so hiding the form is not the security boundary.
- The frontend submits reviews through `submit_verified_marketplace_review` and obtains access state from `get_marketplace_review_eligibility`.
- Users without a qualifying order can still read every review.
- Empty review states now tell the user to order and wait for the seller's response.
- When reviews already exist, the same concise instruction appears below the review cards for an ineligible user.

## Verified UrRide Reviews

- Added a protected `operator_accepted_at` marker to transport trips.
- Passenger-created bookings cannot set or forge the operator-acceptance marker.
- The marker is written only when the assigned operator moves the booking to accepted or a later active/completed trip state.
- Every new operator review is linked to a qualifying trip and the authenticated passenger.
- A trip can be reviewed only once.
- Direct review inserts are rejected unless the trip belongs to the passenger, belongs to the reviewed operator, and has verified operator acceptance.
- Fleet-profile and completed-trip review submissions now use `submit_verified_transport_review`.
- Review access is obtained from `get_transport_review_eligibility`.
- Passengers without an accepted booking retain read-only access to operator reviews.
- Empty and populated review views explain that a booking must be accepted before a review can be added.

## UrRide Header Account State

- Preserved the compact operator-control skeleton while operator and company account checks are running.
- The Register button is shown only after both account checks confirm that no operator or company account exists.
- Existing operator accounts are still hydrated from the scoped local account cache while Supabase refreshes authoritative account data.
- This avoids briefly showing Register to users who have already completed UrRide registration.

## Profile Help Controls

- Changed the circular KunThai ID explanation control from `!` to `?`.
- Changed the circular Visibility Credits explanation control from `!` to `?`.
- Updated the matching symbols inside both explanation dialogs.
- Preserved the existing round borders, accessible labels, and modal behavior.

## Verification

- `npm.cmd run build` passed: 2,714 modules transformed and the production bundle completed successfully.
- `npm.cmd run lint` passed with zero errors.
- The five lint warnings reported are pre-existing warnings in unrelated admin, two-factor, and UrRide registration files.
- `git diff --check` passed with no whitespace errors.
- `supabase db push --dry-run` recognized `20260720090000_verified_transaction_reviews.sql` in the pending migration sequence.
- A local browser smoke test confirmed the application opens and enters guest mode without a runtime failure.

## Deployment Note

The review forms fail closed until `20260720090000_verified_transaction_reviews.sql` is applied. The linked project currently has this migration and earlier pending migrations waiting to be deployed, so they were not pushed automatically as part of this focused security change.

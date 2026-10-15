# UrRide: delete a transport company (2026-10-15)

## What changed

- Fleet HQ → **Menu** now ends with **Delete company**, shown only to the company creator.
- The confirm sheet explains what is removed and keeps the button off until the company name is
  typed exactly. The reason for a refusal is shown inside the sheet.
- After deleting, the app returns to UrRide (or to the person's next company, if they have one).

- Operators (not the creator) get **Leave and delete company**: in Fleet HQ's operator actions and
  in the personal operator dashboard's Menu. It ends only their membership and removes the company
  from their dashboard; the company stays for its owner and other operators. No SQL needed for this.

What is removed: the company, its company fleets, operator memberships, invites, rentals and their
reservation history, and the company's plan rows. Operators keep their personal KunThai accounts
and operator profiles; vehicles that were driving for the company go offline and are detached from
it. Past trips are kept.

Refused while a company trip is under way (accepted → paused) or a rental is confirmed/active.

Account deletion: `delete_kunthai_account()` now removes the person's own company the same way
first, so a company with rental history no longer stops "Delete my account".

## SQL to run in Supabase (once)

`supabase/migrations/20261015170000_urride_delete_company.sql` (safe to run more than once).
Until it is run, the button shows "Deleting a company is not available yet."

Test: `supabase/tests/urride_delete_company.sql` (disposable `urride_delete_company_test` database).

## Check after running

1. Sign in as a company creator → Fleet HQ → Menu → Delete company.
2. Type the name; the button turns on. Delete → "Company deleted", back on UrRide.
3. An operator of that company no longer sees it; their own operator dashboard still works.

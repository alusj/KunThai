# One phone number, one KunThai account (2026-10-16)

## Rule

A contact phone on a UrMall business, a UrRide operator, a UrRide company or an Explore Space may
be the person's own number (reused across all their registrations), but not a number that belongs
to a different account: another account's sign-in phone, or a number another account already
uses on one of those registrations. Emergency contacts are never checked.

## What people see

- The phone is prefilled with the account's own number (UrMall, UrRide operator, UrRide company,
  and now Explore Space) and stays editable.
- While typing, after a short pause the number is checked. If it belongs to another account the
  field shows: "Sorry, this number is already associated with a different account. Please try
  another number." (all 15 languages) and the step cannot continue.
- Edit screens (UrMall Edit profile / Store details, UrRide Edit fleet) show the same message and
  refuse to save. Explore Space edit and any other path get the same message from the database.

## Database (run once)

`supabase/migrations/20261016140000_phone_one_account.sql` — the `kunthai_phone_in_use` check
(answers true/false only, never whose number it is) and a trigger on the four tables that refuses
an insert, or a phone change, with `KT_PHONE_IN_USE`. Rows that already share a number keep
working until their phone is changed. Test: `supabase/tests/phone_one_account.sql`.

Before launch, existing test rows that share numbers can be cleared with the test-data reset.

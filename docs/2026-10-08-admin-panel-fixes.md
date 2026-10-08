# Admin panel fixes (2026-10-08)

## SQL to run in Supabase (once)

Run `supabase/migrations/20261008160000_admin_panel_fixes.sql` in the SQL editor
after `20261008140000_urride_company_fixes.sql`. It is safe to run more than once.

- Case decisions only resolve a case when the business, operator, company or
  fleet record really changed; verify permission is required for approve/reject.
- Verification and Reports Officers (authority 2) can approve/reject and
  restrict/remove within their permission.
- Seller and operator document evidence is kept when the record is re-synced.
- Company vehicles no longer open a duplicate solo-fleet case; location pings
  no longer touch cases.
- Resubmissions reopen the resolved case; rejected companies and operators can
  resubmit.
- Suspend/restrict/remove either take effect or are refused with a reason.
- Dismissed seller verification requests end as `dismissed`.
- Undo also restores the record's previous status.
- Campaign push is claimed once through `admin_claim_campaign_push`.
- Seller document uploads no longer open their own cases.
- Archived company fleets are left out of the user workspace counts.
- Join KunThai notes, reviews, priority and score changes are audit-logged.

Test: `supabase/tests/admin_panel_fixes.sql` (disposable `admin_fixes_test` database).

## App changes

- The case drawer shows only the decisions the admin can apply, with the reason
  for the others, and "Sent for approval" when a chief must approve.
- All open cases load (not only the newest 250); counters use server numbers;
  search falls back to the server.
- Restriction end times are saved in the admin's local time.
- My work shows only the admin's own and unassigned cases.
- Buttons follow the admin's authority in the case's sector.
- Sector counters count open cases only.
- Document links are re-signed before they expire.
- Admin dates and prompts follow the app language.

# Red-flag fixes (2026-10-07)

## SQL to run in Supabase (once)

Run the whole file `supabase/migrations/20261007150000_red_flag_security_fixes.sql`
in the Supabase SQL editor. It is safe to run more than once.

It:

1. **Seller documents.**
   - Creates the private `marketplace-business-documents` bucket.
   - Limits listing of `marketplace-business-media` to each owner's own folder.
   - Lets owners delete their own files.
   - Adds `storage_bucket` / `storage_path` to `marketplace_business_documents`.
2. **Verification guards.**
   - Operators, fleets, companies and company fleets cannot set themselves
     verified or approved.
   - They cannot undo an admin's rejection or suspension.
   - Editing keeps an earlier verification.
3. **Re-joining.** A removed company admin who accepts an operator invite
   comes back as an operator, with no permissions.
4. **Orders.**
   - Sellers follow the lifecycle: pending → shipped/completed/cancelled,
     shipped → completed/cancelled.
   - A buyer's cancellation cannot be overwritten.
   - Only cancelled orders can be deleted (deleting a business still removes
     all its orders).

Tests: `supabase/tests/red_flag_security_fixes.sql` (disposable `redflag_test` database).

## Older seller documents

Documents uploaded before this fix are moved to the private bucket
automatically by the daily `process-business-subscriptions` cron. Requirements:

- The SQL above has been run.
- `SUPABASE_SERVICE_ROLE_KEY` and `CRON_SECRET` are set in Vercel.

To run it immediately instead of waiting for the daily run, call
`GET /api/cron/secure-seller-documents` with header
`Authorization: Bearer <CRON_SECRET>`.

## App changes

- **UrRide company registration.** A new company is no longer sent to the
  database with its local KTC code as its id, which made every first
  registration fail.
- **Company documents.**
  - The files themselves are now uploaded, not only their names.
  - A cancelled file picker no longer counts as an upload.
  - Fleet photo fields accept images only.
  - A reopened draft asks again for files it could not keep.
- **Solo operator documents.**
  - Any uploaded document counts as submitted (all are "if applicable").
  - Documents added later through Edit are saved.
  - A reopened draft asks again for lost files.
- **Seller orders.**
  - A status change applies only if the order is still in the status the
    seller saw.
  - "Order updated" is shown only when the change was really saved.
  - Delete is offered only for cancelled orders, after a confirmation.
- **Seller product delete.** Shows an error when nothing was deleted.
- **Business deletion.** Removes the business's documents, logo, banner and
  product media from storage.
- **Admin case evidence.** Opens the private seller documents with signed
  links.

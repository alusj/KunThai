# Rentals, business-type limits and expiry retention

Implemented locally; no production migration, wallet debit, listing deletion or deployment was performed during development.

## Behaviour

- UrRide companies can register Rental fleets without operators. Owners and active admins publish photos, specifications, hourly/daily/weekly rates, optional per-kilometre pricing, negotiable time/distance pricing, deposits, terms and pickup pins. Passengers switch horizontally between live operators and rentals, matching the Radar design. Automatic date quotes require a fixed time rate; negotiation-only listings direct passengers to the company. Reservations require company confirmation; concurrent overlapping confirmations are rejected. Payments and deposits are arranged directly with the company, not collected by this feature.
- An owner's highest active, unexpired UrMall plan unlocks distinct business types: Free 1, Pro 2, Premium all 4. Existing businesses are preserved after downgrade. Each business retains its own billing and inventory capacity. Legacy hotel workspaces count as real estate. Delegated businesses do not consume or unlock an admin's personal quota.
- Solo operators pay 150 Visibility Credits once when accepting their first company invitation, with explicit confirmation. Existing company members and company-first operators are grandfathered. Multiple memberships are supported; only one solo/company work context can broadcast active at a time. Ongoing trips prevent incompatible context changes. Retries and simultaneous acceptance cannot duplicate the debit.
- UrMall keeps the existing 7/3/1-day pre-expiry reminders. Failed renewal ends paid capacity immediately, with no extra UrMall grace period. Ten published listings remain visible, newest by default; owners or inventory-authorized admins may choose the retained ten. Excess listings and cloud product drafts captured by the notice are permanently deleted after the 15-day window unless renewed. The policy covers retail, vendors, meals and properties. UrRide's existing grace behaviour is unchanged.
- Retained IDs and deadlines are stored server-side. Selecting Free again or editing timestamps does not reset the deadline. Pre-existing expiries and significantly delayed first notices receive a fresh 15-day warning window. Orders/payment history are preserved, and unknown cascading relationships pause cleanup rather than deleting history.
- Area View's floating guide is 82dvh high. Only “Important Area View guide” is fixed; the introduction, guidance, emergency action, checkbox and confirmation scroll together.
- Passengers can search transport companies by company name or KTC code and open a public company profile. Fleet tabs are generated only for fleet types the company actually has; Rentals appears only when the company has a published rental. Fleet/operator profiles and rental details link back to the company. Company reviews are separate from operator reviews and require a completed trip with that company.

## Deployment order

Apply the existing migration history through `20260905120000_urmall_vendor_business_kind.sql` first, then these new migrations in timestamp order:

1. `20260905130000_urmall_expiry_retention.sql`
2. `20260905140000_urride_multi_company_operator_access.sql`
3. `20260905160000_urride_company_rentals.sql`
4. `20260905170000_urmall_business_type_capacity.sql`
5. `20260906100000_urride_public_company_profiles.sql`
6. `20260906123000_urride_rental_pricing_and_document_copy.sql`

Deploy the client only after the new RPCs exist. Do not replay the old vendor migration afterward: its old capacity functions intentionally bypassed vendor limits, which the new expiry migration supersedes.

The existing hourly subscription scheduler calls `process_kunthai_business_subscriptions()`; the new wrapper also processes retention. Verify the scheduled job and notification delivery in staging. Applying the migration does not run an immediate cleanup, but it enables future irreversible deletion after valid notice deadlines. Take a database backup and review the policy before production activation. Do not run test fixtures against a linked/project database.

## Validation

- `npm run test:unit`: 265 tests passed.
- `npm run build`: production build passed, with existing large-chunk/Browserslist warnings.
- ESLint on every changed/new JS/JSX file: zero errors; existing CompanyWorkspace hook-dependency warning remains.
- Whole-project lint still reports two unrelated pre-existing errors: undefined `Buffer` in `screenshotCaptureService.test.js`, and unused `easeInOutSine` in `NearbyAreaMap.jsx`.
- Disposable PostgreSQL tests exercised real legacy renewal/entitlement/provisioning code where relevant: quota transitions, ownership protection, public visibility, selection permissions, delayed notices, cleanup idempotence, preserved order history, auto-renewal, payment consent, rollback, membership isolation and trip restrictions.
- Concurrent PostgreSQL sessions verified one 150-credit debit on duplicate acceptance, exactly one active work context, and rejection of overlapping rental approvals.
- The public-company PostgreSQL fixture verified name/code search, country scoping, draft-company exclusion, safe public fields, dynamic fleet/rental inventory and one company review per completed trip.
- Guest browser smoke test: Explore and the actual UrRide dashboard open; live operators and rentals use a horizontal switcher; Area View guide renders over the map with one fixed title and scrollable content in a mobile-sized dark preview. Authenticated company workflows require a staging account and the deployed migrations for browser end-to-end testing.

SQL fixtures live under `supabase/tests`. `run-urmall-expiry-retention.ps1` creates a fresh disposable localhost database and runs the complete expiry suite. Other fixtures specify setup requirements at their top; the membership fixture refuses to reset any database other than its explicitly named disposable `membership_test`.

## Boundaries

- Rental copy is currently English; existing translated Area View copy is reused.
- Expiry cleanup permanently removes inventory records. Physical orphaned Supabase Storage files are not purged by SQL; that requires a separate supported Storage API cleanup worker. Existing temporary local form drafts retain their established three-day lifecycle.
- No live emergency calls, real rental reservations, paid subscriptions or operator charges were made while testing.

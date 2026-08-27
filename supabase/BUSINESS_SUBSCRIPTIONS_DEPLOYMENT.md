# Business subscription deployment

Run only the following production migrations in Supabase, in this exact order:

1. `migrations/20260820130000_visibility_credit_business_subscriptions.sql`
2. `migrations/20260820140000_business_subscription_capacity_guards.sql`
3. `migrations/20260820150000_business_subscription_renewals.sql`
4. `migrations/20260822090000_business_subscription_yearly_billing.sql`
5. `migrations/20260827120000_unified_notifications_admin_supervision.sql`
6. `migrations/20260827200000_business_subscription_activation_and_scheduler.sql`

## Supabase SQL Editor

For each migration:

1. Open a new SQL Editor query.
2. Paste the complete contents of one migration file.
3. Run it and wait for `Success. No rows returned`.
4. Continue to the next migration only after the current one succeeds.

Do not paste local test fixtures into the Supabase SQL Editor. In particular,
deployment SQL must never create `auth.users`, create Supabase roles, call
`set_config('request.jwt.claim...')`, or contain `psql` commands such as
`\set ON_ERROR_STOP`.

The migrations are idempotent where practical, so retrying a migration after
fixing a reported error is safe.

The final migration creates the hourly
`kunthai-business-subscription-renewals` pg_cron job. After it succeeds, check
Supabase Dashboard → Integrations → Cron (or run
`select * from cron.job where jobname = 'kunthai-business-subscription-renewals';`)
and confirm that one active job is listed. Owners do not need to open the Plans
screen for renewals, 7/3/1-day reminders, grace warnings, or expiry notices to
run.

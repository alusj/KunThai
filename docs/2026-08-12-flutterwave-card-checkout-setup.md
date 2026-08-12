# Flutterwave card checkout setup

KunThai uses Flutterwave Standard hosted checkout. Card details are entered on
Flutterwave's page and never pass through the KunThai browser or server.

## 1. Apply the database migration

Apply:

`supabase/migrations/20260812100000_flutterwave_visibility_credit_purchases.sql`

The migration intentionally creates no priced packages. Insert only prices the
business has approved. `price_minor` is the currency's smallest unit (USD 99 is
$0.99):

```sql
insert into public.visibility_credit_packages
  (credits, price_minor, currency, label, sort_order)
values
  -- Replace these placeholders with approved pricing before running.
  (10,  99, 'USD', 'Starter', 1),
  (50, 399, 'USD', 'Growth',  2),
  (150, 999, 'USD', 'Pro',   3);
```

Do not run the example unchanged unless those are the intended customer prices.

## 2. Add server environment variables

Add these to the Vercel project for Preview and Production as appropriate:

- `FLUTTERWAVE_SECRET_KEY`: test secret key during testing; live secret key only
  after acceptance testing.
- `FLUTTERWAVE_WEBHOOK_SECRET_HASH`: a separate random secret chosen for webhook
  signing. This is configured in Flutterwave's webhook settings; it is not the
  public key or encryption key.
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `PUBLIC_APP_URL`: canonical deployed origin, such as `https://kunthai.app`.

The server also accepts the existing aliases `FLW_SECRET_KEY` and
`FLW_SECRET_HASH`. `FLUTTERWAVE_SECRET_KEY` and
`FLUTTERWAVE_WEBHOOK_SECRET_HASH` are the preferred descriptive names.

Never put the Flutterwave secret key, webhook secret, or Supabase service-role
key in a `VITE_` variable. Vite variables are shipped to every browser.

The hosted Standard flow does not need the Flutterwave public key or encryption
key because KunThai does not collect raw card data.

## 3. Configure Flutterwave webhook delivery

In Flutterwave Dashboard → Settings → Webhooks:

1. Set the webhook URL to
   `https://YOUR_DOMAIN/api/flutterwave-webhook`.
2. Set the secret hash to the exact value stored as
   `FLUTTERWAVE_WEBHOOK_SECRET_HASH`.
3. Enable webhook retries.

The endpoint accepts Flutterwave's current HMAC `flutterwave-signature` contract
and the legacy v3 `verif-hash` contract. It still queries Flutterwave's transaction
verification API before granting credits.

## 4. Test before enabling live keys

Use Flutterwave test credentials and test cards first. Confirm all of these:

- Successful card checkout adds the package's exact credit count once.
- Refreshing the return URL does not add credits twice.
- A failed/cancelled checkout adds no credits.
- A webhook with the wrong signature is rejected.
- A verified amount, currency, or reference mismatch adds no credits.

Only replace the test secret key with the live secret key after the test checklist
passes and the final package pricing is approved.

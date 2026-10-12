# Native push delivery (2026-10-11)

Follows `docs/2026-10-09-native-push-and-biometrics.md`. That document covers
the device-token table, the queue triggers and the first version of
`send-native-push`; this one covers what was added to make delivery reliable,
and every manual step to switch it on. Where the two differ, this one wins.

Nothing here has been verified on a real device: the code, the SQL tests and
the type checks pass, but delivery through APNs and FCM can only be confirmed
on real phones after the steps below.

No key, certificate, service-account file or secret value is in this
repository, and none should ever be. Type secret values only into the
Supabase dashboard, the Supabase CLI in your own terminal, or Apple / Firebase.
Never paste them into chat, issues, commits, SQL files or logs.
`google-services.json` and `GoogleService-Info.plist` are git-ignored; do not
commit them.

## What changed in code

| Area | Files |
| --- | --- |
| iOS entitlement | `ios/App/App/App.entitlements` (Debug, `aps-environment = development`), `ios/App/App/App-Release.entitlements` (Release / Archive, `aps-environment = production`), Release `CODE_SIGN_ENTITLEMENTS` in `ios/App/App.xcodeproj/project.pbxproj` |
| Queue, drain, campaigns | `supabase/migrations/20261011100000_native_push_delivery.sql`, test `supabase/tests/native_push_delivery.sql` |
| Sender | `supabase/functions/send-native-push/index.ts` |
| App | `src/Backend/services/pushService.js`, `src/Backend/services/nativePushLogic.js` (+ test), `src/Backend/services/notificationBannerService.js`, Settings and notification centre, `src/i18n/nativePushFix.js` (+ test), `capacitor.config.json` and `ios/App/App/capacitor.config.json` |

- **Queue.** `push_outbox_claim()` leases each row to one drain for 5 minutes
  (`FOR UPDATE SKIP LOCKED`); a crashed drain's lease runs out and the row is
  retried. `push_outbox_record()` stores the result: sent; retry with backoff
  (30 s, 1, 2, 4, 8 min, at most 30 min); or dead (`dead_at`) after 5 attempts,
  after a day, or on a permanent error. A late result from a drain whose lease
  was taken over is ignored. `push_outbox_cleanup()` deletes sent and dead
  rows after 14 days.
- **Drain kick.** `kunthai_kick_native_push()` POSTs to `send-native-push`
  through `pg_net` with the header `x-push-secret`; the URL and secret are
  read from Vault when it runs. A statement-level trigger on `push_outbox`
  kicks it at most every 2 seconds (after the inserting transaction commits;
  it never makes the insert fail), and `pg_cron` runs it every minute as a
  safety net. Without `pg_net`, Vault or the Vault secrets it does nothing.
- **Admin campaigns.** When a campaign that includes the **push** channel is
  published (console, the pg_cron schedule or the Vercel cron — all insert
  the per-user delivery rows in `platform_notifications`), each recipient with
  a registered phone and push turned on gets one push
  (`dedupe_key = campaign:<campaign>:<user>`, so republishing or retrying
  never sends twice). Marketing campaigns also respect the marketing switch.
  A tap opens Notifications (UrMall / UrRide campaigns open those services).
  Web push (`send-notification-push`) works as before.
- **Sender.** Invalid tokens (APNs 410 / `BadDeviceToken` / `Unregistered` /
  `DeviceTokenNotForTopic`; FCM 404 / `UNREGISTERED` / `SENDER_ID_MISMATCH` /
  `INVALID_ARGUMENT` about the token) are deleted and never retried. Timeouts,
  network errors, 429 and 5xx are retried. A `BadDeviceToken` is tried once on
  the other APNs environment, so Xcode builds (sandbox tokens) and TestFlight
  / App Store builds (production tokens) both work with one `APNS_ENV`.
- **App.** Settings shows why push could not be set up (permission off and
  where to turn it on, a build without `aps-environment`, missing Google Play
  services or `google-services.json`, …). The phone is re-registered after
  sign-in, on app start and on returning to the app when the OS permission is
  granted and the account's push switch is on (also after a reinstall), and
  unregistered when notifications were turned off in system settings. A push
  arriving while the app is open shows the in-app banner (with **Open**) and
  refreshes lists; the system banner is no longer shown in the foreground
  (`presentationOptions: ["badge", "sound"]`), so it does not appear twice.
- **Background modes.** Not added. All pushes are visible alerts
  (`apns-push-type: alert`), which iOS shows without the app running; the
  *Remote notifications* background mode is only needed for silent /
  content-available pushes, which KunThai does not send. (Ticking it in Xcode
  is harmless if you ever add silent pushes.)

## 1. Apple Developer

1. <https://developer.apple.com/account> > Certificates, Identifiers &
   Profiles > **Identifiers** > `app.kunthai.mobile` > tick **Push
   Notifications** > **Save**. (You do not need the push *certificates* on that
   page; KunThai uses a key.)
2. **Keys** > **+** > name it (e.g. "KunThai APNs") > tick **Apple Push
   Notifications service (APNs)** > Continue > Register > **Download** the
   `.p8` file (only once possible). Keep it in your password manager, outside
   this repository.
3. Note the **Key ID** and your **Team ID** (`7JJNKN7BCK` is the team set in
   the Xcode project; confirm it under Membership details).

## 2. Xcode

1. `npm install && npm run build && npx cap sync ios`, then open
   `ios/App/App.xcodeproj`. (`cap sync` rewrites `ios/App/App/public`; do not
   commit those generated files unless you mean to.)
2. Target **App** > **Signing & Capabilities**, for both the Debug and Release
   tabs: there should be a **Push Notifications** capability (it reads
   `aps-environment` from `App/App.entitlements` for Debug and
   `App/App-Release.entitlements` for Release). If it is not listed, click
   **+ Capability** > **Push Notifications**; Xcode should then show the
   existing entitlement files, not create new ones. Check that **Sign in with
   Apple** is still listed.
3. With **Automatically manage signing** on (the project's setting), Xcode
   regenerates the provisioning profiles with the push entitlement after step
   1 of the Apple section. If it reports that the profile lacks
   `aps-environment`, click **Try Again** or toggle automatic signing off and
   on.
4. Run on a real iPhone (the simulator cannot receive APNs pushes). A build
   run from Xcode (Debug) gets a **sandbox** token; an **Archive** (Release) for
   TestFlight / App Store gets a **production** token.

## 3. Firebase (Android)

1. <https://console.firebase.google.com> > your project (or **Add project**) >
   **Add app** > Android > package name `app.kunthai.mobile` > Register.
2. Download `google-services.json` and place it at
   `android/app/google-services.json` (git-ignored; never commit it).
   `android/app/build.gradle` applies the google-services plugin only when
   that file exists; without it the app says "Google Play services or
   google-services.json is missing" when push is turned on.
3. Project settings > **Cloud Messaging**: **Firebase Cloud Messaging API
   (V1)** must be enabled.
4. Project settings > **Service accounts** > **Generate new private key**
   (the JSON the Edge Function uses). Keep it outside the repository.
5. `npm install && npm run build && npx cap sync android`, open `android/` in
   Android Studio, run on a device with Google Play services.

## 4. Supabase

Replace `<project-ref>` with your project's reference. Run CLI commands from
your own terminal, logged in with `supabase login` and linked with
`supabase link --project-ref <project-ref>`.

### 4.1 Extensions

Dashboard > Database > Extensions: enable **pg_cron** and **pg_net**. Vault
(`supabase_vault`) is enabled on Supabase projects by default. Equivalent SQL:

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;
```

Enable them **before** applying the migration so it can schedule the jobs; if
you enable them later, simply run the migration file again (it is
re-runnable).

### 4.2 Function secrets

```sh
supabase secrets set APNS_KEY_ID=<key id> APNS_TEAM_ID=<team id> APNS_BUNDLE_ID=app.kunthai.mobile APNS_ENV=production
supabase secrets set APNS_KEY_P8="$(cat /path/outside/repo/AuthKey_XXXXXXXXXX.p8)"
supabase secrets set FCM_SERVICE_ACCOUNT_JSON="$(cat /path/outside/repo/firebase-service-account.json)"
supabase secrets set PUSH_DRAIN_SECRET="$(openssl rand -hex 32)"
supabase secrets list   # shows names and digests only
```

- `APNS_ENV`: `production` for TestFlight and App Store builds (they always
  use the production APNs environment, `api.push.apple.com`); `development`
  while you only test builds run from Xcode (`api.sandbox.push.apple.com`).
  Either way the sender retries a `BadDeviceToken` on the other environment
  once, so a mix of Xcode and TestFlight phones works; `production` is the
  right long-term value.
- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided to Edge
  Functions automatically; do not set them.
- Configure only APNs or only FCM if you ship one platform; the other
  platform's devices are then closed with "push provider not configured".

### 4.3 Vault secrets for the drain

The database needs the function URL and the same drain secret. Copy the
`PUSH_DRAIN_SECRET` value from where you generated it (it is not readable back
from `supabase secrets list`; if you lost it, generate a new one and set it in
both places). In the dashboard SQL editor (do not save this as a file in the
repository):

```sql
select vault.create_secret('https://<project-ref>.supabase.co/functions/v1/send-native-push', 'kunthai_push_function_url', 'send-native-push URL');
select vault.create_secret('<the PUSH_DRAIN_SECRET value>', 'kunthai_push_drain_secret', 'x-push-secret for send-native-push');
```

To change one later: `select vault.update_secret(id, '<new value>') from vault.secrets where name = 'kunthai_push_drain_secret';`.
A secret created earlier as `push_drain_secret` (previous document) is also
accepted.

### 4.4 Migrations

```sh
supabase db push
```

This applies, in order, `20261009150000_native_push_tokens.sql` (if not
applied yet), `20261010100000_…`, `20261010110000_…` and
`20261011100000_native_push_delivery.sql`. Apply the migration **before**
deploying the new function version (the function falls back to the old
`push_outbox_finish` if the migration is missing, but the backoff and lease
checks only exist after it). Check the schedules:

```sql
select jobname, schedule, command, active from cron.job where jobname like 'kunthai-native-push-%';
```

Expect `kunthai-native-push-drain` (`* * * * *`) and
`kunthai-native-push-cleanup` (`17 3 * * *`). If you created the manual
`send-native-push` cron job or a Database Webhook on `push_outbox` from the
previous document, remove them; they are no longer needed (keeping them only
causes extra, harmless calls):

```sql
select cron.unschedule('send-native-push');
```

(Database > Webhooks: delete the `push_outbox` insert webhook if you made one.)

### 4.5 Deploy the function

```sh
supabase functions deploy send-native-push --no-verify-jwt
```

It checks its own caller: `x-push-secret: <PUSH_DRAIN_SECRET>` or
`Authorization: Bearer <service role key>`. `send-notification-push` (web
push) is unchanged and needs no redeploy.

## 5. Testing on devices

1. Install a build on a real phone, sign in, Settings > **Push alerts** > On,
   allow notifications. If it fails, the reason is shown under the switch.
2. Check the phone was saved:

   ```sql
   select user_id, platform, updated_at, last_seen_at from public.push_device_tokens order by updated_at desc limit 5;
   ```

3. Queue a test push for that account (the trigger kicks the drain):

   ```sql
   insert into public.push_outbox (user_id, title, body, route, kind, dedupe_key)
   values ('<user uuid>', 'KunThai test', 'Push delivery works', 'notifications', 'test', 'manual-test:' || gen_random_uuid());
   ```

4. Watch its status:

   ```sql
   select created_at, attempts, sent_at, dead_at, next_attempt_at, locked_until, last_error
   from public.push_outbox order by created_at desc limit 10;
   ```

   `sent_at` set = handed to APNs / FCM; `next_attempt_at` in the future with
   `last_error` = waiting for a retry; `dead_at` set = given up (reason in
   `last_error`).
5. Calls made by the database: `select id, status_code, error_msg, created from net._http_response order by created desc limit 10;`
   (401 = Vault secret and `PUSH_DRAIN_SECRET` differ).
6. Function logs: Dashboard > Edge Functions > send-native-push > Logs, or
   `supabase functions logs send-native-push`. Every call returns
   `{claimed, delivered, retrying, failed, removedTokens}`; `push not
   configured` means the APNs / FCM secrets are missing.
7. Kick it by hand if needed (no secret in the command; it reads Vault):
   `select public.kunthai_kick_native_push();` (as `postgres` in the SQL
   editor).
8. Campaign: publish an admin campaign with the **Push** channel to an
   account with a registered phone; one `push_outbox` row with
   `kind = 'announcement'` and `dedupe_key = 'campaign:<id>:<user>'` appears
   per recipient.

## 6. Local checks (no production access)

```sh
npm run test:unit
node scripts/check-locale-bundles.mjs
node --test src/i18n/*.test.js src/Backend/services/toastCopy.test.js
npx eslint . --ignore-pattern ".claude/**"
npm run build
# SQL (disposable local Postgres 16 with contrib/dblink):
createdb -h /tmp -p 55432 -U pgtest native_push_delivery_test
psql -h /tmp -p 55432 -U pgtest -d native_push_delivery_test -v ON_ERROR_STOP=1 -f supabase/tests/native_push_delivery.sql
psql -h /tmp -p 55432 -U pgtest -d push_device_tokens_test -v ON_ERROR_STOP=1 -f supabase/tests/native_push_tokens.sql
```

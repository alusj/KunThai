# Native push notifications and biometric unlock (2026-10-09)

What shipped in code, and the exact steps the owner takes to switch it on.
No key, certificate or service-account file is in this repository, and none
should ever be: they go into Apple, Firebase and Supabase secret storage only.
Never paste their values into chat, issues, commits, SQL files or logs.

## What is in the code

**Biometric unlock (Security > Biometric unlock)**

- In the iOS / Android app, `src/Backend/services/biometricService.js` uses
  `@aparajita/capacitor-biometric-auth@10.0.0` (Face ID, Touch ID, Android
  fingerprint / face, with the device passcode as fallback). The app runs from
  `capacitor://localhost`, where WebAuthn cannot work.
- In a browser it keeps using WebAuthn (a platform credential), as before.
- `ios/App/App/Info.plist` has `NSFaceIDUsageDescription`;
  `android/app/src/main/AndroidManifest.xml` has `USE_BIOMETRIC`.

**Push notifications in the app**

- `@capacitor/push-notifications@8.1.3`. Settings > Push alerts asks for
  permission, registers the phone with APNs (iOS) or FCM (Android) and saves
  the token with `register_push_device_token()` into
  `public.push_device_tokens`. Turning it off, signing out or switching
  accounts removes the token. If the build has no push set up yet, Settings
  says so instead of pretending.
- Migration `supabase/migrations/20261009150000_native_push_tokens.sql`:
  - `push_device_tokens` (own-row RLS, upsert by token through the RPC).
  - `push_outbox`, filled by triggers on `explore_notifications` (reactions,
    comments and replies, mentions, follows), `explore_messages` (new direct
    messages) and `marketplace_orders` (status changes, to the buyer). A push
    is only queued when the recipient has a device, `push_enabled` (plus
    `social_enabled` / `commerce_enabled`) in `user_notification_preferences`,
    has not switched that alert type off in Explore settings, and has not
    blocked the sender or their Space.
  - `push_outbox_claim()` / `push_outbox_finish()` for the sender (service
    role only).
- Edge Function `supabase/functions/send-native-push` drains the queue and
  sends to APNs (HTTP/2, token-based JWT) and FCM HTTP v1. With no keys set it
  logs `push not configured` and does nothing.
- Tapping a push opens its screen: `conversation:<id>` opens the chat,
  `notifications` opens Notifications, `orders` opens UrMall orders.
- iOS `AppDelegate.swift` passes the APNs token to the plugin; Android
  `POST_NOTIFICATIONS` is declared; `android/app/build.gradle` applies the
  google-services plugin only when `android/app/google-services.json` exists.

## 1. Apple (iOS push)

1. Apple Developer > Certificates, Identifiers & Profiles > Identifiers >
   `app.kunthai.mobile` > enable **Push Notifications** > Save. (Regenerate the
   provisioning profiles if Xcode does not manage signing automatically.)
2. Keys > **+** > name it (e.g. "KunThai APNs") > tick **Apple Push
   Notifications service (APNs)** > Continue > Register > **Download** the
   `.p8` file. It can be downloaded only once; keep it in your password
   manager, never in this repository (`*.p8` is git-ignored).
3. Note the **Key ID** (shown with the key) and your **Team ID** (top right of
   the developer portal, or Membership details).

## 2. Xcode

1. `npm install && npm run build && npx cap sync ios`, then open
   `ios/App/App.xcodeproj`.
2. Target **App** > **Signing & Capabilities** > **+ Capability** >
   **Push Notifications**.
3. **+ Capability** > **Background Modes** > tick **Remote notifications**.
4. Build and run on a real iPhone (the simulator cannot receive APNs pushes
   from a server). Builds run from Xcode use the APNs **sandbox**; TestFlight
   and App Store builds use **production** (see `APNS_ENV` below).

## 3. Firebase (Android push)

1. <https://console.firebase.google.com> > **Add project** (Analytics is not
   needed).
2. Project overview > **Add app** > Android > package name
   `app.kunthai.mobile` > Register.
3. Download `google-services.json` and put it at
   `android/app/google-services.json`. It is git-ignored: do not commit it.
4. Project settings > **Service accounts** > **Generate new private key**.
   This downloads the service-account JSON used by the Edge Function to send
   through FCM HTTP v1. Keep it in your password manager; never commit it.
5. Project settings > Cloud Messaging: make sure **Firebase Cloud Messaging
   API (V1)** is enabled.
6. `npm install && npm run build && npx cap sync android`, open `android/` in
   Android Studio and run on a device. Android 13+ asks for the notification
   permission when push is turned on in Settings.

## 4. Supabase

1. Apply the migrations (in order), e.g. `supabase db push`:
   - `20261009140000_explore_saved_collections_sync.sql`
   - `20261009150000_native_push_tokens.sql`
2. Set the function secrets from your terminal. Type or paste the values
   only into your terminal, never into chat or files in the repo:

   ```sh
   supabase secrets set APNS_KEY_ID=<key id> APNS_TEAM_ID=<team id> \
     APNS_BUNDLE_ID=app.kunthai.mobile APNS_ENV=production
   supabase secrets set APNS_KEY_P8="$(cat /path/outside/repo/AuthKey_XXXX.p8)"
   supabase secrets set FCM_SERVICE_ACCOUNT_JSON="$(cat /path/outside/repo/service-account.json)"
   supabase secrets set PUSH_DRAIN_SECRET="$(openssl rand -hex 32)"
   ```

   - `APNS_ENV=development` (or `sandbox`) while testing builds run from
     Xcode; `production` for TestFlight / App Store builds.
   - Only iOS or only Android can be configured; the other platform's devices
     are then skipped.
   - `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided to functions
     by Supabase automatically.
3. Deploy the function (it checks its own caller, so JWT verification is
   off):

   ```sh
   supabase functions deploy send-native-push --no-verify-jwt
   ```

   It accepts either `Authorization: Bearer <service role key>` or the header
   `x-push-secret: <PUSH_DRAIN_SECRET>`. Anything else gets 401.
4. Drain the queue: choose one (both is fine; rows are claimed safely).

   **a. Cron schedule (every minute).** Store the drain secret in Vault
   once, from the SQL editor (type the value there; it is not saved in any
   repository file):

   ```sql
   select vault.create_secret('<the PUSH_DRAIN_SECRET value>', 'push_drain_secret');
   ```

   Then enable the `pg_cron` and `pg_net` extensions (Database > Extensions)
   and schedule:

   ```sql
   select cron.schedule(
     'send-native-push',
     '* * * * *',
     $$
     select net.http_post(
       url := 'https://<project-ref>.supabase.co/functions/v1/send-native-push',
       headers := jsonb_build_object(
         'Content-Type', 'application/json',
         'x-push-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'push_drain_secret')
       ),
       body := '{}'::jsonb
     );
     $$
   );
   ```

   (The dashboard's Cron integration can create the same job: an HTTP
   request / Edge Function job for `send-native-push`, every minute, with the
   `x-push-secret` header.)

   **b. Database Webhook (sends within seconds).** Database > Webhooks >
   Create: table `public.push_outbox`, event **Insert**, type **Supabase Edge
   Functions** > `send-native-push`, method POST, add the header
   `x-push-secret` with the drain secret (or an `Authorization: Bearer`
   header with the service-role key, if the dashboard offers to add it). The body is ignored; each call
   drains up to 100 queued pushes. Keep the cron job as a safety net for
   retries.
5. Check it: Edge Functions > send-native-push > Logs. Every call returns
   `{claimed, delivered, failed, removedTokens}`; `push not configured` means
   the secrets are missing. Failed rows are retried (up to 5 attempts within a
   day); tokens APNs/FCM report as gone are deleted.

## 5. Biometric plugin

Already installed (`@aparajita/capacitor-biometric-auth@10.0.0`, Capacitor 8).
After pulling: `npm install && npm run build && npx cap sync`, then rebuild in
Xcode / Android Studio. No keys are needed. On a device: Security > Biometric
unlock > Turn on, confirm with Face ID / Touch ID / fingerprint; KunThai then
asks on launch and after more than a minute in the background (the system
prompt appears by itself; the device passcode is accepted as a fallback).

## 6. After any change

```sh
npm install && npm run build && npx cap sync
```

then rebuild and run from Xcode (iOS) and Android Studio (Android).

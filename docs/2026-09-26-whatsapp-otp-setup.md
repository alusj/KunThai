# WhatsApp-first phone OTP: setup and security model

_Updated 2026-09-29. Do not enable the Send SMS hook until every item in
"Before enabling" is done._

## Who owns and validates the code

There are two codes per sign-in attempt. Only one of them ever reaches a person.

| | Supabase Auth internal code | KunThai code |
| --- | --- | --- |
| Issued by | Supabase Auth (`crypto.GenerateOtp(sms_otp_length)`) | `otp-delivery` (`generateNumericCode`) |
| Length | **10 digits** (`sms_otp_length = 10`) | 6 digits |
| Delivered to | nobody — handed to the Send SMS hook only | the person, by WhatsApp (or SMS) |
| Stored as | hash in `auth.users` (Supabase) + AES-GCM ciphertext in `kunthai_otp_deliveries.auth_code_ciphertext` until used | HMAC in `user_code_hash`; AES-GCM ciphertext only while an SMS of the same code may still go out |
| Expiry | `sms_otp_exp` (Supabase, set **600 s**) | `OTP_CODE_TTL_SECONDS` (600 s, ≤ Supabase's) |
| Checked by | Supabase `/verify`, called **only by otp-delivery** | otp-delivery `/verify`: 5 attempts per code, counted atomically |
| Issues the session | Supabase Auth | — |

Flow: app asks Supabase for a code → Supabase calls the hook with its 10-digit
code → otp-delivery stores it encrypted, makes a 6-digit code, sends that on
WhatsApp → the person types the 6-digit code → app calls
`otp-delivery/verify` → after the attempt check, otp-delivery calls Supabase
`/verify` with the 10-digit code → Supabase issues the session → the app calls
`supabase.auth.setSession`.

Source check (supabase/auth, `internal/api/verify.go`): with the hook enabled
Supabase does **not** ask Twilio Verify to check codes
(`if !config.Hook.SendSMS.Enabled && config.Sms.IsTwilioVerifyProvider()`); it
compares the hash itself with `isOtpValid(..., config.Sms.OtpExp)`. It has **no
per-code failed-attempt counter**, only a per-IP verify rate limit.

### Why the direct-Supabase bypass is closed

Anyone can call Supabase `/verify` with the public anon key. They can't use it
to skip KunThai's attempt limit:

- The 6-digit code people receive is not Supabase's code, so Supabase rejects it.
- Supabase's own code is 10 digits and never sent anywhere. At a verify limit of
  even 1,000 requests per IP per 5 minutes, one IP gets ~2,000 guesses in a
  10-minute code life: a 2 in 10,000,000 chance. Guessing needs millions of IPs.
- The hook **fails closed**: if Supabase sends a code shorter than
  `OTP_MIN_AUTH_OTP_LENGTH` (10), nothing is delivered and the request errors.
  Forgetting to set `sms_otp_length` can't silently reopen the bypass.

Guessing the 6-digit code through KunThai: 5 attempts per code, at most 10
codes per number per day → at most 50 guesses per day out of 1,000,000
(0.005 %).

### Send limits (revised)

| Limit | Value | Enforced by |
| --- | --- | --- |
| Between codes for one account | 60 s | Supabase `sms_max_frequency` |
| Codes per number | 5 per rolling hour, 10 per rolling 24 h | hook (`OTP_MAX_CODES_PER_HOUR`, `OTP_MAX_CODES_PER_DAY`) |
| Lockout | none beyond the rolling window: sending resumes as soon as the oldest code ages out | hook |
| Project-wide SMS/WhatsApp volume | Supabase "SMS sent" rate limit | Supabase |
| App-side pacing (UX only) | 5 per hour, then wait 1 hour | `otpRequestGuardService.js` |

The old 72-hour lockout was removed: anyone can request codes for any number,
so a long lockout let a stranger block a real user's signup or recovery for
three days. Turn on Supabase CAPTCHA (Turnstile/hCaptcha) for sign-up and
password recovery to cut abuse further.

### SMS fallback: one attempt, never a conflicting code

SMS goes out only on a definite WhatsApp failure (API error or a `failed`
status webhook) or when the person taps "Send by SMS". No timer.

`OTP_SMS_MODE` picks how:

| Mode | What the SMS carries | Needs |
| --- | --- | --- |
| `verify_native` (default) | Twilio Verify's own code | any Verify service |
| `verify_custom_code` | the same KunThai code | Twilio to enable custom codes on the service |
| `messaging` | the same KunThai code | a Twilio Messaging Service with a sender for Sierra Leone |
| `off` | no SMS | — |

In `verify_native` the person may hold two codes (WhatsApp and SMS), but both
belong to **one** delivery row, **one** attempt counter and **one** Supabase
code. Either code works; the first correct one finishes the attempt, the
Twilio verification is cancelled, and the Supabase code is used once. There is
never a second Supabase code, so two sessions can't come from one attempt.

### Secrets and data

- `OTP_CODE_KEY` derives separate HMAC and AES keys. Ciphertexts are bound to
  their row and purpose (AES-GCM associated data).
- A database check refuses finished rows that still hold code material.
- Tables are service-role only (RLS on, grants revoked from `anon` and
  `authenticated`).
- Logs contain a masked phone (`+232…72`), the channel and provider error
  codes. Never codes, tokens or secrets.
- Residual risk: someone holding **both** the database and `OTP_CODE_KEY` could
  finish a pending sign-in within its 10 minutes. Keep the key only in Edge
  Function secrets.

## Endpoints (`/functions/v1/otp-delivery`, deployed with `--no-verify-jwt`)

- `POST /` — Send SMS hook (Standard Webhooks signature, `SEND_SMS_HOOK_SECRET`)
- `GET /webhook` — Meta `hub.challenge` (`WHATSAPP_WEBHOOK_VERIFY_TOKEN`)
- `POST /webhook` — Meta status events, `X-Hub-Signature-256` with `WHATSAPP_APP_SECRET`
- `POST /fallback` — `{ phone }`, "Send by SMS", once per code, same answer always
- `POST /verify` — `{ phone, token, type? }`, attempt-limited; returns a Supabase session

## Before enabling (in this order)

1. Meta: `kunthai_login_code` approved (Authentication, Copy code, security
   line, "Expires in 10 minutes", language `en`); app published; webhook set
   with the `messages` field; WABA `1085681717402830` subscribed to the app.
2. Apply migrations `20260926170000_otp_delivery_chain.sql` and
   `20260928120000_otp_delivery_hardening.sql`.
3. Supabase Auth config (Management API or dashboard):
   `sms_otp_length = 10`, `sms_otp_exp = 600`; raise the token-verification
   rate limit (all `/verify` calls now come from the Edge Function).
4. Secrets: `OTP_CODE_KEY` (`openssl rand -base64 32`), `WHATSAPP_ACCESS_TOKEN`
   (system user **kunthai-otp**, never the temporary token),
   `WHATSAPP_PHONE_NUMBER_ID=1394928910365376`,
   `WHATSAPP_OTP_TEMPLATE=kunthai_login_code`, `WHATSAPP_OTP_TEMPLATE_LANG=en`,
   `WHATSAPP_APP_SECRET`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN`, `TWILIO_ACCOUNT_SID`,
   `TWILIO_AUTH_TOKEN`, `TWILIO_VERIFY_SERVICE_SID`, `OTP_SMS_MODE`.
   `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are
   provided automatically.
5. `supabase functions deploy otp-delivery --no-verify-jwt --project-ref gwiqnoymozmvzhfjvysy`
6. Ship the app change (`authService.js` verifies through `otp-delivery/verify`)
   to web **and** to Android/iOS builds, with `VITE_WHATSAPP_OTP_ENABLED=true`.
   Installed builds that call `supabase.auth.verifyOtp` directly **cannot**
   verify once the hook is on.
7. Turn on the Send SMS hook
   (`https://gwiqnoymozmvzhfjvysy.supabase.co/functions/v1/otp-delivery`) and
   save its secret as `SEND_SMS_HOOK_SECRET`.

### Rollback

Turn the hook off, then retire codes that are still open so the app stops
routing them through otp-delivery:

```sql
update kunthai_otp_deliveries
   set status = 'superseded', user_code_ciphertext = null, auth_code_ciphertext = null
 where status in ('sending', 'sent', 'delivered', 'exhausted');
```

Supabase goes back to Twilio Verify for sending and checking. The app's
`/verify` call answers `not_tracked` and the app falls back to
`supabase.auth.verifyOtp`, so no app change is needed.

## Checking it works

```sql
select left(phone, 3) || '…' || right(phone, 2) as phone, channels, step, current_channel,
       status, sms_mode, attempts, manual_fallback_used, history, created_at
  from kunthai_otp_deliveries order by created_at desc limit 20;
```

Tests: `node --experimental-strip-types --test supabase/functions/otp-delivery/handlers.test.ts`

# WhatsApp-first phone OTP: setup

_Updated 2026-09-28._

Supabase Auth still creates, hashes, expires and verifies every phone code.
The **Send SMS Hook** hands each code to the `otp-delivery` Edge Function
(`supabase/functions/otp-delivery/`), which delivers that **same** code:

1. **WhatsApp** — Meta Cloud API, Authentication template `kunthai_login_code`
   (Copy code button, security recommendation, "Expires in 10 minutes").
2. **Twilio SMS** — only when WhatsApp fails **definitely** (API error, or a
   `failed` status webhook), or when the person taps "Send by SMS".
   There is **no** timer-based SMS: a missing `delivered` webhook alone never
   sends a second message.

Because both channels carry the one code Supabase issued, two different codes
can never conflict. A new code (resend) supersedes the previous one.

## What the function enforces

| Rule | Where | Default |
| --- | --- | --- |
| Code lifetime | Supabase Auth → Phone → OTP expiry, `OTP_CODE_TTL_SECONDS`, template text | 600 s (10 min) — keep all three equal |
| Codes per number | hook (`OTP_MAX_CODES_PER_DAY`, `OTP_LOCKOUT_HOURS`) | 3 per 24 h, then 72 h lockout (the app's own limit is 2) |
| Wrong entries per code | `/check` (`OTP_MAX_ATTEMPTS`) | 5, then the code is locked |
| Stored code | `code_hash` (HMAC-SHA256, keyed) + AES-GCM ciphertext only while an SMS fallback is still possible | ciphertext wiped after SMS, success, lock, supersede or expiry |
| Logs | masked phone (`+232…72`), channel, provider error code | never codes, tokens, secrets |

Limitation: `/check` is called by the app before `supabase.auth.verifyOtp`.
A client that calls Supabase directly skips it, so also lower Supabase's
**Rate limits → Token verifications** (per IP) in the dashboard.

### Endpoints (all under `/functions/v1/otp-delivery`)
- `POST /` — Send SMS Hook (Standard Webhooks signature, `SEND_SMS_HOOK_SECRET`)
- `GET /webhook` — Meta `hub.challenge` verification (`WHATSAPP_WEBHOOK_VERIFY_TOKEN`)
- `POST /webhook` — Meta status events, `X-Hub-Signature-256` checked with `WHATSAPP_APP_SECRET`
- `POST /fallback` — `{ phone }`, "Send by SMS", once per code, same answer always
- `POST /check` — `{ phone, token }`, attempt-limited check

## Order matters: do NOT enable the hook first

While the hook is on, Supabase sends no SMS itself. If the function or its
secrets are missing, signup and password-recovery codes stop arriving.

### 1. Apply the migrations
`supabase/migrations/20260926170000_otp_delivery_chain.sql`, then
`supabase/migrations/20260928120000_otp_delivery_hardening.sql`.

### 2. Meta (KunThai business portfolio)
- WhatsApp Business Account **KunThai** — ID `1085681717402830`
- Phone number +232 30 318472 — Phone number ID `1394928910365376`
- Template `kunthai_login_code`, Authentication, language English (`en`)
- System user **kunthai-otp** → Generate token → app **KunThai Messaging**,
  expiry **Never**, permissions `whatsapp_business_messaging` +
  `whatsapp_business_management`. Paste it straight into the secret below;
  never into code, chat or GitHub. Do not use the temporary test token.
- App → Settings → Basic → **App Secret** → `WHATSAPP_APP_SECRET`.

### 3. Twilio
Either ask Twilio support to enable **Custom Verification Code** on the Verify
service and set `TWILIO_VERIFY_CUSTOM_CODE=true`, or set
`TWILIO_MESSAGING_SERVICE_SID` to send the code as a plain SMS. Without one of
these the SMS fallback is off (Verify would otherwise send a *different* code).

### 4. Secrets (Supabase Dashboard → Edge Functions → Secrets, or CLI)
```
OTP_CODE_KEY                    # 32 random bytes, base64:  openssl rand -base64 32
WHATSAPP_ACCESS_TOKEN           # system user token (step 2)
WHATSAPP_PHONE_NUMBER_ID=1394928910365376
WHATSAPP_OTP_TEMPLATE=kunthai_login_code
WHATSAPP_OTP_TEMPLATE_LANG=en
WHATSAPP_APP_SECRET
WHATSAPP_WEBHOOK_VERIFY_TOKEN   # any long random string
TWILIO_ACCOUNT_SID  TWILIO_AUTH_TOKEN  TWILIO_VERIFY_SERVICE_SID
TWILIO_VERIFY_CUSTOM_CODE=true  # or TWILIO_MESSAGING_SERVICE_SID
SEND_SMS_HOOK_SECRET            # from step 7
```
Optional: `OTP_CODE_TTL_SECONDS`, `OTP_MAX_CODES_PER_DAY`, `OTP_LOCKOUT_HOURS`,
`OTP_MAX_ATTEMPTS`, `OTP_WHATSAPP_UNREACHABLE_DAYS`, `WHATSAPP_GRAPH_VERSION`.

### 5. Deploy
```
supabase functions deploy otp-delivery --no-verify-jwt --project-ref gwiqnoymozmvzhfjvysy
```

### 6. Meta webhook
App **KunThai Messaging** → WhatsApp → Configuration → Webhook:
- Callback URL: `https://gwiqnoymozmvzhfjvysy.supabase.co/functions/v1/otp-delivery/webhook`
- Verify token: the `WHATSAPP_WEBHOOK_VERIFY_TOKEN` value
- Subscribe to the **messages** field
- Subscribe the WABA to the app:
  `POST https://graph.facebook.com/v23.0/1085681717402830/subscribed_apps`
  with the system user token.
- The app must be **Published (Live)** for production webhook events to arrive.

### 7. Enable the hook (last)
Dashboard → Authentication → Hooks → **Send SMS hook** → HTTPS:
- URL: `https://gwiqnoymozmvzhfjvysy.supabase.co/functions/v1/otp-delivery`
- Generate the secret and save it as `SEND_SMS_HOOK_SECRET`.
Then set `VITE_WHATSAPP_OTP_ENABLED=true` in Vercel and redeploy the web app.

### Rollback
Turn the Send SMS hook off and set `VITE_WHATSAPP_OTP_ENABLED=false`.
Supabase goes back to sending through Twilio Verify directly.

## Checking it works
```sql
select left(phone, 3) || '…' || right(phone, 2) as phone, channels, step,
       current_channel, status, attempts, manual_fallback_used, history, created_at
  from kunthai_otp_deliveries order by created_at desc limit 20;
```
Function logs: Dashboard → Edge Functions → otp-delivery → Logs.

Tests: `node --experimental-strip-types --test supabase/functions/otp-delivery/handlers.test.ts`

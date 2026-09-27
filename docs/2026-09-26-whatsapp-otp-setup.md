# WhatsApp-first phone OTP: setup

Supabase Auth still creates and checks every phone code. The **Send SMS Hook**
hands each code to the `otp-delivery` Edge Function
(`supabase/functions/otp-delivery/`), which delivers that same code:

1. **WhatsApp** (Meta Cloud API, Authentication template)
2. **Twilio Verify** SMS: used if WhatsApp fails, reports the number undeliverable,
   has not reported delivery after 20 s, or the person taps "Send by SMS".

Channel order per country is stored in `kunthai_otp_routes` (default `*` =
whatsapp → twilio_verify). Orange will be added there later as `orange_sms`.

## Order matters: do NOT enable the hook first

While the hook is on, Supabase sends no SMS itself. If the function or its
secrets are missing, signup and password-recovery codes stop arriving. Follow
the steps in order.

### 1. Apply the migration
Run `web/supabase/migrations/20260926170000_otp_delivery_chain.sql` in the SQL
Editor.

### 2. Meta
- WhatsApp Manager → Message templates → create an **Authentication** template
  with a **Copy code** button (e.g. name `kunthai_otp`, language English (US) `en_US`).
- Get the **Phone Number ID** and a **permanent System User token** with
  `whatsapp_business_messaging`.
- App → Settings → Basic → **App Secret**.

### 3. Twilio
- Ask Twilio support to enable **Custom Verification Code** on your Verify
  service. Until they do, Verify refuses our code. Optionally set
  `TWILIO_MESSAGING_SERVICE_SID` so a plain Twilio SMS carries the code instead.

### 4. Secrets (run from `D:\Projects\KunThai`)
```
supabase secrets set --project-ref gwiqnoymozmvzhfjvysy \
  OTP_CODE_KEY="$(openssl rand -base64 32)" \
  WHATSAPP_ACCESS_TOKEN=... WHATSAPP_PHONE_NUMBER_ID=... \
  WHATSAPP_OTP_TEMPLATE=kunthai_otp WHATSAPP_OTP_TEMPLATE_LANG=en_US \
  WHATSAPP_APP_SECRET=... WHATSAPP_WEBHOOK_VERIFY_TOKEN=<any long random string> \
  TWILIO_ACCOUNT_SID=... TWILIO_AUTH_TOKEN=... TWILIO_VERIFY_SERVICE_SID=VA...
```
Optional: `TWILIO_MESSAGING_SERVICE_SID`, `OTP_CODE_TTL_SECONDS` (default 600;
keep equal to Auth → Providers → Phone → OTP expiry), `WHATSAPP_GRAPH_VERSION`.

### 5. Deploy
```
supabase functions deploy otp-delivery --no-verify-jwt --project-ref gwiqnoymozmvzhfjvysy
```

### 6. Meta webhook
App → WhatsApp → Configuration → Webhook:
- Callback URL: `https://gwiqnoymozmvzhfjvysy.supabase.co/functions/v1/otp-delivery/whatsapp-webhook`
- Verify token: the `WHATSAPP_WEBHOOK_VERIFY_TOKEN` value
- Subscribe to the **messages** field.

### 7. Enable the hook (last)
Dashboard → Authentication → Hooks → **Send SMS hook** → HTTPS:
- URL: `https://gwiqnoymozmvzhfjvysy.supabase.co/functions/v1/otp-delivery/send-sms`
- Generate the secret, then `supabase secrets set SEND_SMS_HOOK_SECRET="v1,whsec_..."`

The Twilio Verify phone provider settings can stay as they are. With the hook
on, Supabase verifies codes itself and no longer asks Twilio to check them.

### Rollback
Turn the Send SMS hook off. Supabase goes back to sending through Twilio Verify
directly. The app needs no change: the "Send by SMS" button simply does nothing.

## Checking it works
- `select phone, channels, step, current_channel, status, history, created_at
   from kunthai_otp_deliveries order by created_at desc limit 20;`
- Function logs: Dashboard → Edge Functions → otp-delivery → Logs.
- A number with no WhatsApp should show `whatsapp` failing (131026), then
  `twilio_verify` ok, and be listed in `kunthai_otp_whatsapp_unreachable`.

## Per-country routes
```sql
-- e.g. once Orange is built, for Liberia:
insert into kunthai_otp_routes (calling_code, channels)
values ('231', array['whatsapp','orange_sms','twilio_verify']);
```

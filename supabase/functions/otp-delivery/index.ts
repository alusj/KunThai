// otp-delivery Edge Function (deploy with --no-verify-jwt: Supabase Auth hook
// and Meta webhooks don't send a Supabase JWT; each route checks its own
// signature instead).
//
//   POST /otp-delivery            Supabase Send SMS Hook (Standard Webhooks signature)
//   GET  /otp-delivery/webhook    Meta webhook verification (hub.challenge)
//   POST /otp-delivery/webhook    Meta status events (X-Hub-Signature-256)
//   POST /otp-delivery/fallback   "Send code by SMS instead" (same code, once)
//   POST /otp-delivery/verify     Attempt-limited check; exchanges Supabase's
//                                 internal code for a session

import { createClient } from "npm:@supabase/supabase-js@2";
import {
  CORS_HEADERS,
  type Env,
  handleManualFallback,
  handleSendSmsHook,
  handleWebhookEvent,
  handleVerify,
  handleWebhookVerify,
} from "./handlers.ts";
import type { SmsMode } from "./providers.ts";
import { supabaseStore } from "./store.ts";

const num = (v: string | undefined, d: number) => (v && Number.isFinite(Number(v)) ? Number(v) : d);
const get = (k: string) => Deno.env.get(k) ?? "";

const env: Env = {
  otpCodeKey: get("OTP_CODE_KEY"),
  sendSmsHookSecret: get("SEND_SMS_HOOK_SECRET"),
  whatsappAppSecret: get("WHATSAPP_APP_SECRET"),
  webhookVerifyToken: get("WHATSAPP_WEBHOOK_VERIFY_TOKEN"),
  supabaseUrl: get("SUPABASE_URL"),
  supabaseAnonKey: get("SUPABASE_ANON_KEY"),
  graphVersion: get("WHATSAPP_GRAPH_VERSION") || "v26.0",
  whatsappToken: get("WHATSAPP_ACCESS_TOKEN"),
  whatsappPhoneNumberId: get("WHATSAPP_PHONE_NUMBER_ID"),
  whatsappTemplate: get("WHATSAPP_OTP_TEMPLATE") || "kunthai_login_code",
  whatsappTemplateLang: get("WHATSAPP_OTP_TEMPLATE_LANG") || "en",
  twilioAccountSid: get("TWILIO_ACCOUNT_SID"),
  twilioAuthToken: get("TWILIO_AUTH_TOKEN"),
  twilioVerifyServiceSid: get("TWILIO_VERIFY_SERVICE_SID"),
  twilioMessagingServiceSid: get("TWILIO_MESSAGING_SERVICE_SID"),
  // verify_native (default) | verify_custom_code | messaging | off
  smsMode: (["verify_native", "verify_custom_code", "messaging", "off"].includes(get("OTP_SMS_MODE"))
    ? get("OTP_SMS_MODE")
    : "verify_native") as SmsMode,
  // Must be <= Supabase Auth sms_otp_exp and match the template's
  // "Expires in 10 minutes" line.
  codeTtlSeconds: num(Deno.env.get("OTP_CODE_TTL_SECONDS"), 600),
  userCodeDigits: num(Deno.env.get("OTP_USER_CODE_DIGITS"), 6),
  // Supabase Auth → sms_otp_length must be 10; the hook refuses shorter codes.
  minAuthOtpLength: num(Deno.env.get("OTP_MIN_AUTH_OTP_LENGTH"), 10),
  maxCodesPerHour: num(Deno.env.get("OTP_MAX_CODES_PER_HOUR"), 5),
  maxCodesPerDay: num(Deno.env.get("OTP_MAX_CODES_PER_DAY"), 10),
  maxAttempts: num(Deno.env.get("OTP_MAX_ATTEMPTS"), 5),
  unreachableDays: num(Deno.env.get("OTP_WHATSAPP_UNREACHABLE_DAYS"), 30),
};

const store = supabaseStore(
  createClient(get("SUPABASE_URL"), get("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } }),
);
const deps = { env, store };

Deno.serve(async (req) => {
  const path = new URL(req.url).pathname.replace(/\/+$/, "");
  const route = path.slice(path.lastIndexOf("/otp-delivery") + "/otp-delivery".length) || "/";
  try {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
    if (route === "/" && req.method === "POST") return await handleSendSmsHook(req, deps);
    if (route === "/webhook" && req.method === "GET") return handleWebhookVerify(req, deps);
    if (route === "/webhook" && req.method === "POST") return await handleWebhookEvent(req, deps);
    if (route === "/fallback" && req.method === "POST") return await handleManualFallback(req, deps);
    if (route === "/verify" && req.method === "POST") return await handleVerify(req, deps);
    return new Response("Not found", { status: 404 });
  } catch (err) {
    console.log(JSON.stringify({ fn: "otp-delivery", event: "unhandled", route, message: (err as Error).message }));
    if (route === "/") {
      return new Response(JSON.stringify({ error: { http_code: 500, message: "Could not send code" } }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response("Error", { status: 500, headers: CORS_HEADERS });
  }
});

// otp-delivery request handlers.
//
// Who owns what (see docs/2026-09-26-whatsapp-otp-setup.md, "Security model"):
//
// * Supabase Auth owns accounts and sessions. With the Send SMS Hook on, it
//   generates an internal OTP (sms_otp_length = 10), stores only its hash,
//   enforces its expiry, and hands it to this function. That internal code is
//   NEVER delivered to anyone: it is kept encrypted and used once, server-side,
//   to call Supabase's /verify after the person proved the code they received.
// * This function owns the code the person sees: a fresh 6-digit code sent by
//   WhatsApp (or by SMS). It enforces send limits, attempts per code and
//   expiry, then exchanges the internal code for a Supabase session.
//
// Calling Supabase /verify directly with the 6-digit code does nothing (it is
// not Supabase's code), and guessing the 10-digit internal code is out of
// reach, so the attempt limit here cannot be bypassed.
//
// Codes, tokens and full phone numbers are never logged.

import {
  decryptCode,
  encryptCode,
  generateNumericCode,
  hashCode,
  timingSafeEqual,
  verifyMetaSignature,
  verifyStandardWebhook,
} from "./crypto.ts";
import {
  checkTwilioVerification,
  type Config,
  type Fetch,
  type SendResult,
  sendSms,
  sendWhatsApp,
  setTwilioVerificationStatus,
  WHATSAPP_UNREACHABLE,
} from "./providers.ts";
import type { Channel, Delivery, Store } from "./store.ts";

export interface Env extends Config {
  otpCodeKey: string;
  sendSmsHookSecret: string;
  whatsappAppSecret: string;
  webhookVerifyToken: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  codeTtlSeconds: number;
  userCodeDigits: number;
  minAuthOtpLength: number;
  maxCodesPerHour: number;
  maxCodesPerDay: number;
  maxAttempts: number;
  unreachableDays: number;
  // Supabase Auth waits at most 5 s for an HTTP hook (all retries included);
  // the hook must answer well inside that.
  hookBudgetMs: number;
}

export interface Deps {
  env: Env;
  store: Store;
  fetch?: Fetch;
  now?: () => Date;
  log?: (event: Record<string, unknown>) => void;
  uuid?: () => string;
  newCode?: (digits: number) => string;
}

export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (status: number, body: unknown, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...extra } });

// Auth hook error shape understood by Supabase Auth.
const hookError = (httpCode: number, message: string) => json(httpCode, { error: { http_code: httpCode, message } });

export const digitsOnly = (p: unknown) => String(p ?? "").replace(/\D/g, "");
export const maskPhone = (p: string) => (p.length > 4 ? `+${p.slice(0, 3)}…${p.slice(-2)}` : "…");

const defaultLog = (e: Record<string, unknown>) => console.log(JSON.stringify({ fn: "otp-delivery", ...e }));

const HOUR = 3600_000;

// Send limit: at most `perHour` codes in any rolling hour and `perDay` in any
// rolling 24 h. Returns when the next code may be sent (ms), or 0 if now.
// There is no extra lockout: the block ends as soon as the window allows.
export function nextSendAllowedAt(sendTimesIso: string[], now: Date, perHour: number, perDay: number): number {
  const t = sendTimesIso.map((s) => Date.parse(s)).filter(Number.isFinite).sort((a, b) => b - a); // newest first
  const n = now.getTime();
  let until = 0;
  const inHour = t.filter((x) => x > n - HOUR);
  if (inHour.length >= perHour) until = Math.max(until, inHour[perHour - 1] + HOUR);
  const inDay = t.filter((x) => x > n - 24 * HOUR);
  if (inDay.length >= perDay) until = Math.max(until, inDay[perDay - 1] + 24 * HOUR);
  return until > n ? until : 0;
}

type Ctx = Required<Pick<Deps, "env" | "store" | "fetch" | "now" | "log" | "uuid" | "newCode">>;

function ctx(d: Deps): Ctx {
  return {
    env: d.env,
    store: d.store,
    fetch: d.fetch ?? fetch,
    now: d.now ?? (() => new Date()),
    log: d.log ?? defaultLog,
    uuid: d.uuid ?? (() => crypto.randomUUID()),
    newCode: d.newCode ?? generateNumericCode,
  };
}

const userAad = (id: string) => `${id}:user`;
const authAad = (id: string) => `${id}:auth`;
const isSms = (ch: Channel | null) => ch === "twilio_verify" || ch === "orange_sms";

async function sendOn(c: Ctx, channel: Channel, phone: string, code: string, timeoutMs: number): Promise<SendResult> {
  if (channel === "whatsapp") return await sendWhatsApp(c.env, phone, code, c.fetch, timeoutMs);
  if (channel === "twilio_verify") return await sendSms(c.env, phone, code, c.fetch, timeoutMs);
  return { ok: false, definite: true, errorCode: "channel_unavailable" }; // orange_sms: not built yet
}

// Tries channels from `startStep` on. Stops at the first accepted send, or at
// a non-definite failure (no automatic second message on uncertainty).
async function deliverFrom(
  c: Ctx,
  row: Delivery,
  code: string,
  startStep: number,
  reason: string,
  budgetMs = 20_000,
): Promise<{ delivered: boolean; patch: Partial<Delivery> }> {
  const history = [...(row.history ?? [])];
  const nowIso = () => c.now().toISOString();
  const deadline = Date.now() + budgetMs;
  for (let step = startStep; step < row.channels.length; step++) {
    const channel = row.channels[step];
    if (channel === "whatsapp" && (await c.store.isWhatsAppUnreachable(row.phone, nowIso()))) {
      history.push({ at: nowIso(), channel, result: "skipped_unreachable" });
      continue;
    }
    const remaining = deadline - Date.now();
    if (remaining < 500) {
      // Out of time: don't risk Supabase giving up on the hook. The code is
      // kept, so "Send by SMS" still works.
      history.push({ at: nowIso(), channel, result: "skipped_no_time" });
      c.log({ event: "send_skipped_no_time", id: row.id, channel });
      return { delivered: true, patch: { step: Math.max(startStep, step - 1), status: "sent", history } };
    }
    const r = await sendOn(c, channel, row.phone, code, Math.min(10_000, remaining));
    history.push({ at: nowIso(), channel, reason, result: r.ok ? "accepted" : r.errorCode });
    c.log({ event: "send", id: row.id, phone: maskPhone(row.phone), channel, reason, ok: r.ok, error: r.ok ? undefined : r.errorCode });
    if (r.ok) {
      const sms = isSms(channel);
      return {
        delivered: true,
        patch: {
          step,
          current_channel: channel,
          status: "sent",
          provider_message_id: sms ? row.provider_message_id : r.messageId,
          sms_mode: sms ? (r.smsMode ?? null) : row.sms_mode,
          twilio_verification_sid: sms && r.smsMode !== "messaging" ? r.messageId : row.twilio_verification_sid,
          history,
          // Once SMS went out there is nothing left to fall back to.
          user_code_ciphertext: sms ? null : row.user_code_ciphertext,
        },
      };
    }
    if (channel === "whatsapp" && r.unreachable) {
      await c.store.markWhatsAppUnreachable(row.phone, r.errorCode, new Date(c.now().getTime() + c.env.unreachableDays * 86400_000).toISOString());
    }
    if (!r.definite) {
      return { delivered: true, patch: { step, current_channel: channel, status: "sent", history } };
    }
  }
  return { delivered: false, patch: { status: "failed", user_code_ciphertext: null, auth_code_ciphertext: null, history } };
}

// POST /otp-delivery  (Supabase Send SMS Hook)
export async function handleSendSmsHook(req: Request, deps: Deps): Promise<Response> {
  const c = ctx(deps);
  const raw = await req.text();
  if (!(await verifyStandardWebhook(c.env.sendSmsHookSecret, req.headers, raw, Math.floor(c.now().getTime() / 1000)))) {
    c.log({ event: "hook_rejected", reason: "bad_signature" });
    return hookError(401, "Invalid hook signature");
  }
  let payload: { user?: { id?: string; phone?: string }; sms?: { otp?: string; phone?: string; sms_type?: string } };
  try {
    payload = JSON.parse(raw);
  } catch {
    return hookError(400, "Invalid payload");
  }
  // sms.phone is where Supabase wants the code to go (the new number for a
  // phone change); fall back to the account phone.
  // SMS MFA is disabled for KunThai. If it is ever turned on, its codes are
  // checked inside Supabase (and by Twilio Verify while that is the SMS
  // provider), so a KunThai-issued code could never work: refuse loudly.
  if (payload.sms?.sms_type === "mfa") {
    c.log({ event: "hook_rejected", reason: "mfa_not_supported" });
    return hookError(400, "SMS two-step verification is not available. Use your authenticator app.");
  }
  const phone = digitsOnly(payload.sms?.phone || payload.user?.phone);
  const authCode = String(payload.sms?.otp ?? "");
  if (phone.length < 8 || !/^\d+$/.test(authCode)) return hookError(400, "Invalid payload");

  // Fail closed if Supabase is still issuing short codes: the security model
  // relies on its internal code being too long to guess.
  if (authCode.length < c.env.minAuthOtpLength) {
    c.log({ event: "hook_rejected", reason: "auth_otp_too_short", length: authCode.length });
    return hookError(500, "Phone verification is being configured. Please try again later.");
  }

  const now = c.now();
  const recent = await c.store.recentSendTimes(phone, new Date(now.getTime() - 24 * HOUR).toISOString());
  if (nextSendAllowedAt(recent, now, c.env.maxCodesPerHour, c.env.maxCodesPerDay)) {
    c.log({ event: "rate_limited", phone: maskPhone(phone) });
    return hookError(429, "Too many codes requested for this number. Please wait a little and try again.");
  }

  // Only the newest code is valid in Supabase; retire older rows (and their secrets).
  await c.store.supersedeActive(phone);

  const route = await c.store.getRoute(phone);
  const id = c.uuid();
  const userCode = c.newCode(c.env.userCodeDigits);
  const row: Delivery = {
    id,
    user_id: payload.user?.id ?? null,
    phone,
    calling_code: route.calling_code,
    channels: route.channels,
    step: 0,
    current_channel: null,
    status: "sending",
    provider_message_id: null,
    user_code_hash: await hashCode(c.env.otpCodeKey, id, phone, userCode),
    user_code_ciphertext: await encryptCode(c.env.otpCodeKey, userAad(id), userCode),
    auth_code_ciphertext: await encryptCode(c.env.otpCodeKey, authAad(id), authCode),
    attempts: 0,
    manual_fallback_used: false,
    sms_mode: null,
    twilio_verification_sid: null,
    history: [],
    created_at: now.toISOString(),
    expires_at: new Date(now.getTime() + c.env.codeTtlSeconds * 1000).toISOString(),
    delivered_at: null,
    verified_at: null,
  };
  await c.store.insertDelivery(row);

  const result = await deliverFrom(c, row, userCode, 0, "initial", c.env.hookBudgetMs);
  await c.store.updateDelivery(id, result.patch);
  if (!result.delivered) return hookError(502, "We could not send your code right now. Please try again shortly.");
  return json(200, {});
}

// GET /otp-delivery/webhook  (Meta verification challenge)
export function handleWebhookVerify(req: Request, deps: Deps): Response {
  const u = new URL(req.url);
  const mode = u.searchParams.get("hub.mode");
  const token = u.searchParams.get("hub.verify_token") ?? "";
  const challenge = u.searchParams.get("hub.challenge") ?? "";
  if (mode === "subscribe" && deps.env.webhookVerifyToken && timingSafeEqual(token, deps.env.webhookVerifyToken)) {
    return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  return new Response("Forbidden", { status: 403 });
}

interface MetaStatus {
  id?: string;
  status?: string;
  errors?: { code?: number | string }[];
}

// POST /otp-delivery/webhook  (Meta status events, `messages` field)
export async function handleWebhookEvent(req: Request, deps: Deps): Promise<Response> {
  const c = ctx(deps);
  const raw = await req.text();
  if (!(await verifyMetaSignature(c.env.whatsappAppSecret, req.headers.get("x-hub-signature-256"), raw))) {
    c.log({ event: "webhook_rejected", reason: "bad_signature" });
    return new Response("Invalid signature", { status: 401 });
  }
  let body: { entry?: { changes?: { field?: string; value?: { statuses?: MetaStatus[] } }[] }[] };
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response("OK", { status: 200 });
  }
  const statuses: MetaStatus[] = [];
  for (const e of body.entry ?? []) for (const ch of e.changes ?? []) if (ch.field === "messages") statuses.push(...(ch.value?.statuses ?? []));

  for (const s of statuses) {
    if (!s.id || !s.status) continue;
    try {
      const row = await c.store.findByMessageId(s.id);
      if (!row || row.current_channel !== "whatsapp") continue;
      if (s.status === "delivered" || s.status === "read") {
        if (row.status === "sent") await c.store.updateDelivery(row.id, { status: "delivered", delivered_at: c.now().toISOString() });
        c.log({ event: "status", id: row.id, status: s.status });
      } else if (s.status === "failed") {
        const errCode = String(s.errors?.[0]?.code ?? "unknown");
        c.log({ event: "status", id: row.id, status: "failed", error: errCode });
        if (WHATSAPP_UNREACHABLE.has(errCode)) {
          await c.store.markWhatsAppUnreachable(row.phone, `whatsapp_${errCode}`, new Date(c.now().getTime() + c.env.unreachableDays * 86400_000).toISOString());
        }
        // Definite failure: next channel, once, same attempt.
        if (row.status !== "sent" || Date.parse(row.expires_at) <= c.now().getTime()) continue;
        const code = row.user_code_ciphertext ? await decryptCode(c.env.otpCodeKey, userAad(row.id), row.user_code_ciphertext) : "";
        if (!code && c.env.smsMode !== "verify_native") continue;
        const r = await deliverFrom(c, row, code, row.step + 1, `whatsapp_failed_${errCode}`);
        await c.store.updateDelivery(row.id, r.delivered ? r.patch : { ...r.patch, status: "exhausted" });
      }
    } catch (err) {
      c.log({ event: "webhook_error", message: (err as Error).message });
    }
  }
  return new Response("OK", { status: 200 });
}

// POST /otp-delivery/fallback  {phone}  ("Send code by SMS instead")
// Same answer whatever happens, so it reveals nothing about the number.
export async function handleManualFallback(req: Request, deps: Deps): Promise<Response> {
  const c = ctx(deps);
  const done = () => json(200, { ok: true }, CORS_HEADERS);
  let phone = "";
  try {
    phone = digitsOnly((await req.json())?.phone);
  } catch {
    return done();
  }
  if (phone.length < 8 || c.env.smsMode === "off") return done();
  try {
    const row = await c.store.latestActive(phone, c.now().toISOString());
    if (!row || row.manual_fallback_used || isSms(row.current_channel)) return done();
    const needsOurCode = c.env.smsMode !== "verify_native";
    if (needsOurCode && !row.user_code_ciphertext) return done();
    // Claim the fallback first so double taps can't send twice.
    await c.store.updateDelivery(row.id, { manual_fallback_used: true });
    const smsStep = row.channels.findIndex((ch, i) => i > row.step && isSms(ch));
    const channels = smsStep >= 0 ? row.channels : [...row.channels, "twilio_verify" as Channel];
    const startStep = smsStep >= 0 ? smsStep : channels.length - 1;
    const code = needsOurCode ? await decryptCode(c.env.otpCodeKey, userAad(row.id), row.user_code_ciphertext!) : "";
    const r = await deliverFrom(c, { ...row, channels }, code, startStep, "manual");
    const keepStatus = row.status === "delivered" ? "delivered" : "sent";
    await c.store.updateDelivery(row.id, r.delivered ? { ...r.patch, channels, status: keepStatus } : { history: r.patch.history });
  } catch (err) {
    c.log({ event: "fallback_error", message: (err as Error).message });
  }
  return done();
}

// POST /otp-delivery/verify  {phone, token, type?}
// The only way to turn a received code into a session while the hook is on.
export async function handleVerify(req: Request, deps: Deps): Promise<Response> {
  const c = ctx(deps);
  const reply = (status: number, body: unknown) => json(status, body, CORS_HEADERS);
  let phone = "", token = "", type = "sms";
  try {
    const b = await req.json();
    phone = digitsOnly(b?.phone);
    token = String(b?.token ?? "").trim();
    type = b?.type === "phone_change" ? "phone_change" : "sms";
  } catch {
    return reply(400, { ok: false, reason: "invalid" });
  }
  if (phone.length < 8 || !/^\d{4,10}$/.test(token)) return reply(400, { ok: false, reason: "invalid" });

  const row = await c.store.latestActive(phone, c.now().toISOString());
  if (!row || !row.auth_code_ciphertext) return reply(404, { ok: false, reason: "not_tracked" });
  if (row.attempts >= c.env.maxAttempts) return reply(429, { ok: false, reason: "locked" });

  // Reserve the attempt before checking, so parallel guesses all count.
  const attempts = await c.store.registerAttempt(row.id);
  if (attempts > c.env.maxAttempts) return reply(429, { ok: false, reason: "locked" });

  let ok = timingSafeEqual(await hashCode(c.env.otpCodeKey, row.id, phone, token), row.user_code_hash);
  let viaTwilio = false;
  if (!ok && row.sms_mode === "verify_native" && row.twilio_verification_sid) {
    ok = await checkTwilioVerification(c.env, row.twilio_verification_sid, token, c.fetch);
    viaTwilio = ok;
  }
  if (!ok) {
    const left = Math.max(0, c.env.maxAttempts - attempts);
    if (left === 0) {
      await c.store.updateDelivery(row.id, { status: "locked", user_code_ciphertext: null, auth_code_ciphertext: null });
      if (row.twilio_verification_sid && row.sms_mode !== "messaging") {
        await setTwilioVerificationStatus(c.env, row.twilio_verification_sid, "canceled", c.fetch);
      }
      c.log({ event: "locked", id: row.id });
    }
    return reply(400, { ok: false, reason: left === 0 ? "locked" : "wrong_code", attemptsLeft: left });
  }

  // Exchange Supabase's internal code for a session. Only this function ever knows it.
  const authCode = await decryptCode(c.env.otpCodeKey, authAad(row.id), row.auth_code_ciphertext);
  let res: Response;
  try {
    res = await c.fetch(`${c.env.supabaseUrl}/auth/v1/verify`, {
      method: "POST",
      headers: { apikey: c.env.supabaseAnonKey, "Content-Type": "application/json" },
      body: JSON.stringify({ type, phone: `+${phone}`, token: authCode }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return reply(502, { ok: false, reason: "unavailable" });
  }
  const session = await res.json().catch(() => ({}));
  if (!res.ok) {
    c.log({ event: "auth_verify_failed", id: row.id, status: res.status, code: session?.error_code ?? session?.code });
    // Expired or already used in Supabase: this code is finished either way.
    await c.store.updateDelivery(row.id, { status: "failed", user_code_ciphertext: null, auth_code_ciphertext: null });
    return reply(400, { ok: false, reason: "expired" });
  }
  await c.store.updateDelivery(row.id, {
    status: "verified",
    verified_at: c.now().toISOString(),
    user_code_ciphertext: null,
    auth_code_ciphertext: null,
  });
  // Close the Twilio side of the same attempt (feedback for custom codes,
  // cancel a native verification the WhatsApp code won).
  if (row.twilio_verification_sid && row.sms_mode === "verify_custom_code") {
    await setTwilioVerificationStatus(c.env, row.twilio_verification_sid, "approved", c.fetch);
  } else if (row.twilio_verification_sid && row.sms_mode === "verify_native" && !viaTwilio) {
    await setTwilioVerificationStatus(c.env, row.twilio_verification_sid, "canceled", c.fetch);
  }
  c.log({ event: "verified", id: row.id, via: viaTwilio ? "twilio_code" : "kunthai_code" });
  return reply(200, { ok: true, session });
}

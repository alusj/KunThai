// otp-delivery request handlers.
//
// Supabase Auth generates every phone code and stores only its hash. With the
// Send SMS Hook enabled, Auth hands the code to POST /otp-delivery, which
// delivers that SAME code: WhatsApp first, Twilio SMS only when WhatsApp fails
// definitely (API error or a `failed` status webhook) or when the person taps
// "Send code by SMS instead". There is never a second, different code, so the
// two channels can't conflict. No timer-based SMS is sent.
//
// Codes, tokens and full phone numbers are never logged.

import { decryptCode, encryptCode, hashCode, timingSafeEqual, verifyMetaSignature, verifyStandardWebhook } from "./crypto.ts";
import { type Config, type Fetch, type SendResult, sendTwilio, sendWhatsApp } from "./providers.ts";
import type { Channel, Delivery, Store } from "./store.ts";

export interface Env extends Config {
  otpCodeKey: string;
  sendSmsHookSecret: string;
  whatsappAppSecret: string;
  webhookVerifyToken: string;
  codeTtlSeconds: number;
  maxCodesPerDay: number;
  lockoutHours: number;
  maxAttempts: number;
  unreachableDays: number;
}

export interface Deps {
  env: Env;
  store: Store;
  fetch?: Fetch;
  now?: () => Date;
  log?: (event: Record<string, unknown>) => void;
  uuid?: () => string;
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

// Resend limit, enforced on the server. Once `maxPerDay` codes were sent for a
// number within 24 h, no further code is sent until `lockoutHours` after the
// last of them. Returns the time the number is blocked until (ms), or 0.
export function blockedUntil(sendTimesIso: string[], now: Date, maxPerDay: number, lockoutHours: number): number {
  const t = sendTimesIso.map((s) => Date.parse(s)).filter(Number.isFinite).sort((a, b) => a - b);
  const DAY = 24 * 3600_000;
  let until = 0;
  for (let i = maxPerDay - 1; i < t.length; i++) {
    if (t[i] - t[i - maxPerDay + 1] <= DAY) until = Math.max(until, t[i] + lockoutHours * 3600_000);
  }
  return until > now.getTime() ? until : 0;
}

type Ctx = Required<Pick<Deps, "env" | "store" | "fetch" | "now" | "log" | "uuid">>;

function ctx(d: Deps): Ctx {
  return {
    env: d.env,
    store: d.store,
    fetch: d.fetch ?? fetch,
    now: d.now ?? (() => new Date()),
    log: d.log ?? defaultLog,
    uuid: d.uuid ?? (() => crypto.randomUUID()),
  };
}

async function sendOn(c: Ctx, channel: Channel, phone: string, code: string): Promise<SendResult> {
  if (channel === "whatsapp") return await sendWhatsApp(c.env, phone, code, c.fetch);
  if (channel === "twilio_verify") return await sendTwilio(c.env, phone, code, c.fetch);
  return { ok: false, definite: true, errorCode: "channel_unavailable" }; // orange_sms: not built yet
}

const isSms = (ch: Channel | null) => ch === "twilio_verify" || ch === "orange_sms";

// Tries channels from `startStep` on. Stops at the first accepted send, or at
// a non-definite WhatsApp failure (no automatic SMS on uncertainty).
async function deliverFrom(
  c: Ctx,
  row: Delivery,
  code: string,
  startStep: number,
  reason: string,
): Promise<{ delivered: boolean; patch: Partial<Delivery> }> {
  const history = [...(row.history ?? [])];
  const nowIso = () => c.now().toISOString();
  for (let step = startStep; step < row.channels.length; step++) {
    const channel = row.channels[step];
    if (channel === "whatsapp" && (await c.store.isWhatsAppUnreachable(row.phone, nowIso()))) {
      history.push({ at: nowIso(), channel, result: "skipped_unreachable" });
      continue;
    }
    const r = await sendOn(c, channel, row.phone, code);
    history.push({ at: nowIso(), channel, reason, result: r.ok ? "accepted" : r.errorCode });
    c.log({ event: "send", id: row.id, phone: maskPhone(row.phone), channel, reason, ok: r.ok, error: r.ok ? undefined : r.errorCode });
    if (r.ok) {
      const done = isSms(channel);
      return {
        delivered: true,
        patch: {
          step,
          current_channel: channel,
          status: "sent",
          provider_message_id: r.messageId,
          history,
          // Once SMS went out there is nothing left to fall back to.
          code_ciphertext: done ? null : row.code_ciphertext,
        },
      };
    }
    if (channel === "whatsapp" && r.unreachable) {
      const until = new Date(c.now().getTime() + c.env.unreachableDays * 86400_000).toISOString();
      await c.store.markWhatsAppUnreachable(row.phone, r.errorCode, until);
    }
    if (!r.definite) {
      // Uncertain (e.g. timeout). Keep the code for the manual SMS button.
      return { delivered: true, patch: { step, current_channel: channel, status: "sent", history } };
    }
  }
  return { delivered: false, patch: { status: "failed", code_ciphertext: null, history } };
}

// POST /otp-delivery  (Supabase Send SMS Hook)
export async function handleSendSmsHook(req: Request, deps: Deps): Promise<Response> {
  const c = ctx(deps);
  const raw = await req.text();
  if (!(await verifyStandardWebhook(c.env.sendSmsHookSecret, req.headers, raw, Math.floor(c.now().getTime() / 1000)))) {
    c.log({ event: "hook_rejected", reason: "bad_signature" });
    return hookError(401, "Invalid hook signature");
  }
  let payload: { user?: { id?: string; phone?: string }; sms?: { otp?: string } };
  try {
    payload = JSON.parse(raw);
  } catch {
    return hookError(400, "Invalid payload");
  }
  const phone = digitsOnly(payload.user?.phone);
  const code = String(payload.sms?.otp ?? "");
  if (phone.length < 8 || !/^\d{4,10}$/.test(code)) return hookError(400, "Invalid payload");

  const now = c.now();
  const since = new Date(now.getTime() - (24 + c.env.lockoutHours) * 3600_000).toISOString();
  const recent = await c.store.recentSendTimes(phone, since);
  const until = blockedUntil(recent, now, c.env.maxCodesPerDay, c.env.lockoutHours);
  if (until) {
    c.log({ event: "rate_limited", phone: maskPhone(phone) });
    return hookError(429, "Too many codes requested for this number. Please try again later.");
  }

  // Only the newest code is valid in Supabase; retire older delivery rows.
  await c.store.supersedeActive(phone);

  const route = await c.store.getRoute(phone);
  const id = c.uuid();
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
    code_ciphertext: await encryptCode(c.env.otpCodeKey, id, code),
    code_hash: await hashCode(c.env.otpCodeKey, id, phone, code),
    attempts: 0,
    manual_fallback_used: false,
    history: [],
    created_at: now.toISOString(),
    expires_at: new Date(now.getTime() + c.env.codeTtlSeconds * 1000).toISOString(),
    delivered_at: null,
    precheck_passed_at: null,
  };
  await c.store.insertDelivery(row);

  const result = await deliverFrom(c, row, code, 0, "initial");
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
      const nowIso = c.now().toISOString();
      if (s.status === "delivered" || s.status === "read") {
        if (row.status === "sent") await c.store.updateDelivery(row.id, { status: "delivered", delivered_at: nowIso });
        c.log({ event: "status", id: row.id, status: s.status });
      } else if (s.status === "failed") {
        const errCode = String(s.errors?.[0]?.code ?? "unknown");
        c.log({ event: "status", id: row.id, status: "failed", error: errCode });
        if (["131026", "131049", "131050"].includes(errCode)) {
          const until = new Date(c.now().getTime() + c.env.unreachableDays * 86400_000).toISOString();
          await c.store.markWhatsAppUnreachable(row.phone, `whatsapp_${errCode}`, until);
        }
        // Definite failure: send the same code on the next channel, once.
        if (row.status !== "sent" || !row.code_ciphertext || Date.parse(row.expires_at) <= c.now().getTime()) continue;
        const code = await decryptCode(c.env.otpCodeKey, row.id, row.code_ciphertext);
        const r = await deliverFrom(c, row, code, row.step + 1, `whatsapp_failed_${errCode}`);
        await c.store.updateDelivery(row.id, r.delivered ? r.patch : { ...r.patch, status: "exhausted" });
      }
    } catch (err) {
      c.log({ event: "webhook_error", message: (err as Error).message });
    }
  }
  // Always 200 so Meta doesn't retry events we've handled.
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
  if (phone.length < 8) return done();
  try {
    const row = await c.store.latestActive(phone, c.now().toISOString());
    if (!row || row.manual_fallback_used || !row.code_ciphertext || isSms(row.current_channel)) return done();
    // Claim the fallback first so double taps can't send twice.
    await c.store.updateDelivery(row.id, { manual_fallback_used: true });
    const smsStep = row.channels.findIndex((ch, i) => i > row.step && isSms(ch));
    const channels = smsStep >= 0 ? row.channels : [...row.channels, "twilio_verify" as Channel];
    const startStep = smsStep >= 0 ? smsStep : channels.length - 1;
    const code = await decryptCode(c.env.otpCodeKey, row.id, row.code_ciphertext);
    const r = await deliverFrom(c, { ...row, channels }, code, startStep, "manual");
    await c.store.updateDelivery(row.id, {
      ...r.patch,
      channels,
      status: r.delivered ? (row.status === "delivered" ? "delivered" : "sent") : row.status,
      code_ciphertext: null,
    });
  } catch (err) {
    c.log({ event: "fallback_error", message: (err as Error).message });
  }
  return done();
}

// POST /otp-delivery/check  {phone, token}
// Server-side attempt limit. The app calls this before supabase.auth.verifyOtp.
// After `maxAttempts` wrong entries the code is locked and a new one is needed.
export async function handleCheck(req: Request, deps: Deps): Promise<Response> {
  const c = ctx(deps);
  let phone = "", token = "";
  try {
    const b = await req.json();
    phone = digitsOnly(b?.phone);
    token = String(b?.token ?? "").trim();
  } catch {
    return json(400, { ok: false, reason: "invalid" }, CORS_HEADERS);
  }
  if (phone.length < 8 || !/^\d{4,10}$/.test(token)) return json(400, { ok: false, reason: "invalid" }, CORS_HEADERS);

  const row = await c.store.latestActive(phone, c.now().toISOString());
  // No tracked code (e.g. hook not enabled yet): let Supabase decide.
  if (!row || !row.code_hash) return json(200, { ok: true, tracked: false }, CORS_HEADERS);
  if (row.attempts >= c.env.maxAttempts) return json(429, { ok: false, reason: "locked" }, CORS_HEADERS);

  const attempts = await c.store.registerAttempt(row.id);
  if (attempts > c.env.maxAttempts) return json(429, { ok: false, reason: "locked" }, CORS_HEADERS);

  const candidate = await hashCode(c.env.otpCodeKey, row.id, phone, token);
  if (!timingSafeEqual(candidate, row.code_hash)) {
    const left = Math.max(0, c.env.maxAttempts - attempts);
    if (left === 0) await c.store.updateDelivery(row.id, { code_ciphertext: null });
    return json(400, { ok: false, reason: left === 0 ? "locked" : "wrong_code", attemptsLeft: left }, CORS_HEADERS);
  }
  await c.store.updateDelivery(row.id, { precheck_passed_at: c.now().toISOString(), code_ciphertext: null });
  return json(200, { ok: true, tracked: true }, CORS_HEADERS);
}

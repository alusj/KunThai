// Run: node --experimental-strip-types --test supabase/functions/otp-delivery/handlers.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { bytesToBase64, bytesToHex, hmacSha256 } from "./crypto.ts";
import {
  type Env,
  handleManualFallback,
  handleSendSmsHook,
  handleVerify,
  handleWebhookEvent,
  handleWebhookVerify,
  nextSendAllowedAt,
} from "./handlers.ts";
import type { SmsMode } from "./providers.ts";
import { ACTIVE_STATUSES, type Delivery, type Store } from "./store.ts";

const enc = new TextEncoder();
const HOOK_KEY = crypto.getRandomValues(new Uint8Array(32));
const AUTH_OTP = "8350129946"; // Supabase's internal 10-digit code
const USER_CODE = "482913"; // what the person receives

const baseEnv: Env = {
  otpCodeKey: bytesToBase64(crypto.getRandomValues(new Uint8Array(32))),
  sendSmsHookSecret: `v1,whsec_${bytesToBase64(HOOK_KEY)}`,
  whatsappAppSecret: "app-secret-test",
  webhookVerifyToken: "verify-token-test",
  supabaseUrl: "https://proj.supabase.co",
  supabaseAnonKey: "anon-test",
  graphVersion: "v26.0",
  whatsappToken: "wa-token-test",
  whatsappPhoneNumberId: "1394928910365376",
  whatsappTemplate: "kunthai_login_code",
  whatsappTemplateLang: "en",
  twilioAccountSid: "ACtest",
  twilioAuthToken: "twilio-test",
  twilioVerifyServiceSid: "VAtest",
  twilioMessagingServiceSid: "MGtest",
  smsMode: "verify_native",
  codeTtlSeconds: 600,
  userCodeDigits: 6,
  minAuthOtpLength: 10,
  maxCodesPerHour: 5,
  maxCodesPerDay: 10,
  maxAttempts: 5,
  unreachableDays: 30,
  hookBudgetMs: 4000,
};
const envWith = (smsMode: SmsMode): Env => ({ ...baseEnv, smsMode });

function memStore() {
  const rows = new Map<string, Delivery>();
  const unreachable = new Map<string, string>();
  const store: Store = {
    async getRoute() {
      return { calling_code: "*", channels: ["whatsapp", "twilio_verify"] };
    },
    async isWhatsAppUnreachable(phone, nowIso) {
      const u = unreachable.get(phone);
      return !!u && u > nowIso;
    },
    async markWhatsAppUnreachable(phone, _r, until) {
      unreachable.set(phone, until);
    },
    async recentSendTimes(phone, since) {
      return [...rows.values()].filter((r) => r.phone === phone && r.created_at >= since && r.status !== "failed").map((r) => r.created_at);
    },
    async supersedeActive(phone) {
      for (const r of rows.values()) {
        if (r.phone === phone && ACTIVE_STATUSES.includes(r.status)) {
          Object.assign(r, { status: "superseded", user_code_ciphertext: null, auth_code_ciphertext: null });
        }
      }
    },
    async insertDelivery(row) {
      rows.set(row.id, structuredClone(row));
    },
    async updateDelivery(id, patch) {
      Object.assign(rows.get(id)!, structuredClone(patch));
    },
    async findByMessageId(mid) {
      return structuredClone([...rows.values()].find((r) => r.provider_message_id === mid) ?? null);
    },
    async latestActive(phone, nowIso) {
      const list = [...rows.values()]
        .filter((r) => r.phone === phone && ACTIVE_STATUSES.includes(r.status) && r.expires_at > nowIso)
        .sort((a, b) => b.created_at.localeCompare(a.created_at));
      return list[0] ? structuredClone(list[0]) : null;
    },
    async registerAttempt(id) {
      const r = rows.get(id)!;
      r.attempts += 1;
      return r.attempts;
    },
  };
  return { store, rows, unreachable };
}

type Call = { url: string; body: string };
function mockFetch(plan: {
  whatsapp?: () => Response;
  twilioSend?: () => Response;
  twilioCheck?: (body: string) => Response;
  auth?: (body: string) => Response;
} = {}) {
  const calls: Call[] = [];
  const f = (async (url: string, init: RequestInit) => {
    const body = String(init.body);
    calls.push({ url, body });
    if (url.includes("graph.facebook.com")) return plan.whatsapp ? plan.whatsapp() : Response.json({ messages: [{ id: "wamid.OK1" }] });
    if (url.endsWith("/VerificationCheck")) return plan.twilioCheck ? plan.twilioCheck(body) : Response.json({ status: "pending" });
    if (/Verifications\/VE/.test(url)) return Response.json({ status: "canceled" });
    if (url.includes("twilio.com")) return plan.twilioSend ? plan.twilioSend() : Response.json({ sid: "VE123" }, { status: 201 });
    if (url.endsWith("/auth/v1/verify")) {
      if (plan.auth) return plan.auth(body);
      return JSON.parse(body).token === AUTH_OTP
        ? Response.json({ access_token: "at", refresh_token: "rt", user: { id: "u1" } })
        : Response.json({ error_code: "otp_expired" }, { status: 403 });
    }
    throw new Error("unexpected " + url);
  }) as unknown as typeof fetch;
  return { f, calls };
}

let clock = new Date("2026-09-28T12:00:00Z");
const now = () => clock;
let n = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
const logs: Record<string, unknown>[] = [];
const log = (e: Record<string, unknown>) => logs.push(e);
const newCode = () => USER_CODE;

async function hookRequest(phone: string, otp = AUTH_OTP, secret = HOOK_KEY, extra: { user?: object; sms?: object } = {}) {
  const body = JSON.stringify({
    metadata: { name: "send-sms", ip_address: "203.0.113.9" },
    user: { id: "u1", phone, ...(extra.user ?? {}) },
    sms: { otp, phone, ...(extra.sms ?? {}) },
  });
  const id = "msg_1";
  const ts = String(Math.floor(clock.getTime() / 1000));
  const sig = bytesToBase64(await hmacSha256(secret, `${id}.${ts}.${body}`));
  return new Request("https://x/functions/v1/otp-delivery", {
    method: "POST",
    headers: { "webhook-id": id, "webhook-timestamp": ts, "webhook-signature": `v1,${sig}` },
    body,
  });
}
async function metaRequest(payload: unknown, secret = baseEnv.whatsappAppSecret) {
  const raw = JSON.stringify(payload);
  const sig = bytesToHex(await hmacSha256(enc.encode(secret), raw));
  return new Request("https://x/otp-delivery/webhook", { method: "POST", headers: { "x-hub-signature-256": `sha256=${sig}` }, body: raw });
}
const statusEvent = (id: string, status: string, code?: number) => ({
  entry: [{ changes: [{ field: "messages", value: { statuses: [{ id, status, ...(code ? { errors: [{ code }] } : {}) }] } }] }],
});
const post = (path: string, body: unknown) => new Request(`https://x/otp-delivery/${path}`, { method: "POST", body: JSON.stringify(body) });

function setup(mode: SmsMode = "verify_native", plan = {}) {
  const m = memStore();
  const fx = mockFetch(plan);
  const deps = { env: envWith(mode), store: m.store, fetch: fx.f, now, log, uuid, newCode };
  return { ...m, ...fx, deps };
}

test("hook rejects a bad signature", async () => {
  const { deps } = setup();
  assert.equal((await handleSendSmsHook(await hookRequest("23230318472", AUTH_OTP, new Uint8Array(32)), deps)).status, 401);
});

test("hook fails closed while Supabase still issues short (6-digit) codes", async () => {
  const { deps, calls } = setup();
  const res = await handleSendSmsHook(await hookRequest("23230318472", "123456"), deps);
  assert.equal(res.status, 500);
  assert.equal(calls.length, 0, "nothing sent");
});

test("hook delivers OUR 6-digit code on WhatsApp; Supabase's code is never sent or logged", async () => {
  const { deps, calls, rows } = setup();
  logs.length = 0;
  const res = await handleSendSmsHook(await hookRequest("+232 30 318472"), deps);
  assert.equal(res.status, 200);
  assert.equal(calls.length, 1);
  const sent = JSON.parse(calls[0].body);
  assert.equal(sent.template.name, "kunthai_login_code");
  assert.equal(sent.template.components[0].parameters[0].text, USER_CODE);
  assert.ok(!calls[0].body.includes(AUTH_OTP));
  const row = [...rows.values()][0];
  assert.equal(row.status, "sent");
  for (const secret of [AUTH_OTP, USER_CODE]) {
    assert.ok(!JSON.stringify(row).includes(secret), "no plaintext code stored");
    assert.ok(!JSON.stringify(logs).includes(secret), "no code in logs");
  }
  assert.ok(!JSON.stringify(logs).includes("30318472"));
});

test("send limits: 5 per hour, 10 per day, no multi-day lockout", async () => {
  const { deps } = setup();
  const phone = "23277000004";
  const start = clock;
  for (let i = 0; i < 5; i++) {
    clock = new Date(start.getTime() + i * 60_000);
    assert.equal((await handleSendSmsHook(await hookRequest(phone), deps)).status, 200, `code ${i + 1}`);
  }
  clock = new Date(start.getTime() + 10 * 60_000);
  assert.equal((await handleSendSmsHook(await hookRequest(phone), deps)).status, 429, "6th in the hour");
  clock = new Date(start.getTime() + 61 * 60_000);
  assert.equal((await handleSendSmsHook(await hookRequest(phone), deps)).status, 200, "hour window freed");
  clock = start;
});

test("nextSendAllowedAt", () => {
  const t0 = new Date("2026-01-01T12:00:00Z");
  assert.equal(nextSendAllowedAt([], t0, 5, 10), 0);
  const ten = Array.from({ length: 10 }, (_, i) => new Date(t0.getTime() - (23 - i) * 3600_000).toISOString());
  const until = nextSendAllowedAt(ten, t0, 5, 10);
  assert.equal(until, Date.parse(ten[0]) + 24 * 3600_000, "frees when the oldest ages out (1 h), not 72 h");
});

test("verify: right code -> Supabase verified server-side with the INTERNAL code -> session", async () => {
  const { deps, calls, rows } = setup();
  await handleSendSmsHook(await hookRequest("23277000001"), deps);
  const res = await handleVerify(post("verify", { phone: "+23277000001", token: USER_CODE }), deps);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.session.access_token, "at");
  const authCall = calls.find((c) => c.url.endsWith("/auth/v1/verify"))!;
  assert.deepEqual(JSON.parse(authCall.body), { type: "sms", phone: "+23277000001", token: AUTH_OTP });
  const row = [...rows.values()][0];
  assert.equal(row.status, "verified");
  assert.equal(row.auth_code_ciphertext, null);
  assert.equal(row.user_code_ciphertext, null);
});

test("bypass closed: Supabase never accepts the 6-digit code the person holds", async () => {
  // Model of Supabase /verify: only its own 10-digit code works.
  const { deps } = setup();
  await handleSendSmsHook(await hookRequest("23277000002"), deps);
  const direct = await deps.fetch("https://proj.supabase.co/auth/v1/verify", {
    method: "POST",
    body: JSON.stringify({ type: "sms", phone: "+23277000002", token: USER_CODE }),
  });
  assert.equal(direct.status, 403);
});

test("verify: 5 wrong codes lock the attempt, even the right code is refused afterwards", async () => {
  const { deps, rows, calls } = setup();
  await handleSendSmsHook(await hookRequest("23277000003"), deps);
  const r1 = await handleVerify(post("verify", { phone: "23277000003", token: "000000" }), deps);
  assert.equal((await r1.json()).attemptsLeft, 4);
  for (let i = 0; i < 4; i++) await handleVerify(post("verify", { phone: "23277000003", token: "000000" }), deps);
  const locked = await handleVerify(post("verify", { phone: "23277000003", token: USER_CODE }), deps);
  assert.ok([404, 429].includes(locked.status));
  const row = [...rows.values()][0];
  assert.equal(row.status, "locked");
  assert.equal(row.auth_code_ciphertext, null);
  assert.ok(!calls.some((c) => c.url.endsWith("/auth/v1/verify")), "Supabase never called");
});

test("verify: parallel guesses are all counted", async () => {
  const { deps } = setup();
  await handleSendSmsHook(await hookRequest("23277000013"), deps);
  const results = await Promise.all(
    Array.from({ length: 8 }, () => handleVerify(post("verify", { phone: "23277000013", token: "111111" }), deps)),
  );
  assert.equal(results.filter((r) => r.status === 400).length, 5);
  assert.equal(results.filter((r) => r.status === 429).length, 3);
});

test("verify: expired code is not tracked; client falls back to Supabase (which also refuses)", async () => {
  const { deps } = setup();
  await handleSendSmsHook(await hookRequest("23277000010"), deps);
  const saved = clock;
  clock = new Date(clock.getTime() + 11 * 60_000);
  const r = await handleVerify(post("verify", { phone: "23277000010", token: USER_CODE }), deps);
  assert.equal(r.status, 404);
  clock = saved;
});

test("verify: Supabase refuses (e.g. its expiry shorter) -> expired, secrets wiped", async () => {
  const { deps, rows } = setup("verify_native", { auth: () => Response.json({ error_code: "otp_expired" }, { status: 403 }) });
  await handleSendSmsHook(await hookRequest("23277000011"), deps);
  const r = await handleVerify(post("verify", { phone: "23277000011", token: USER_CODE }), deps);
  assert.equal((await r.json()).reason, "expired");
  assert.equal([...rows.values()][0].auth_code_ciphertext, null);
});

test("WhatsApp API error -> Twilio Verify (native) SMS; Twilio's code accepted in the SAME attempt", async () => {
  const { deps, calls, rows } = setup("verify_native", {
    whatsapp: () => Response.json({ error: { code: 131026 } }, { status: 400 }),
    twilioCheck: (b: string) => Response.json({ status: new URLSearchParams(b).get("Code") === "777777" ? "approved" : "pending" }),
  });
  assert.equal((await handleSendSmsHook(await hookRequest("23277000005"), deps)).status, 200);
  const send = calls.find((c) => c.url.endsWith("/Verifications"))!;
  assert.ok(!new URLSearchParams(send.body).has("CustomCode"), "native mode: Twilio makes its own code");
  const row = [...rows.values()][0];
  assert.equal(row.sms_mode, "verify_native");
  assert.equal(row.twilio_verification_sid, "VE123");
  // Wrong code counts against the one shared attempt counter.
  await handleVerify(post("verify", { phone: "23277000005", token: "123123" }), deps);
  const ok = await handleVerify(post("verify", { phone: "23277000005", token: "777777" }), deps);
  assert.equal(ok.status, 200);
  assert.equal(rows.get(row.id)!.attempts, 2);
});

test("WhatsApp code wins after a native SMS went out -> Twilio verification canceled", async () => {
  const { deps, calls } = setup("verify_native");
  await handleSendSmsHook(await hookRequest("23277000006"), deps);
  await handleManualFallback(post("fallback", { phone: "23277000006" }), deps);
  const ok = await handleVerify(post("verify", { phone: "23277000006", token: USER_CODE }), deps);
  assert.equal(ok.status, 200);
  const cancel = calls.find((c) => /Verifications\/VE123$/.test(c.url))!;
  assert.equal(new URLSearchParams(cancel.body).get("Status"), "canceled");
});

test("custom-code mode sends the SAME code and reports 'approved' feedback", async () => {
  const { deps, calls } = setup("verify_custom_code", { whatsapp: () => Response.json({ error: { code: 100 } }, { status: 400 }) });
  await handleSendSmsHook(await hookRequest("23277000007"), deps);
  const send = calls.find((c) => c.url.endsWith("/Verifications"))!;
  assert.equal(new URLSearchParams(send.body).get("CustomCode"), USER_CODE);
  await handleVerify(post("verify", { phone: "23277000007", token: USER_CODE }), deps);
  const fb = calls.find((c) => /Verifications\/VE123$/.test(c.url))!;
  assert.equal(new URLSearchParams(fb.body).get("Status"), "approved");
});

test("messaging mode sends the SAME code as plain SMS", async () => {
  const { deps, calls } = setup("messaging", { whatsapp: () => Response.json({ error: { code: 100 } }, { status: 400 }) });
  await handleSendSmsHook(await hookRequest("23277000008"), deps);
  const sms = calls.find((c) => c.url.includes("Messages.json"))!;
  assert.match(new URLSearchParams(sms.body).get("Body")!, new RegExp(`^${USER_CODE} is your KunThai`));
});

test("WhatsApp timeout is not definite -> no automatic SMS", async () => {
  const { deps, calls } = setup("verify_native", {
    whatsapp: () => {
      throw new Error("timeout");
    },
  });
  assert.equal((await handleSendSmsHook(await hookRequest("23277000009"), deps)).status, 200);
  assert.equal(calls.length, 1);
});

test("all channels fail -> error to Supabase, secrets wiped", async () => {
  const { deps, rows } = setup("verify_native", {
    whatsapp: () => Response.json({ error: { code: 100 } }, { status: 400 }),
    twilioSend: () => Response.json({ code: 60200 }, { status: 400 }),
  });
  const res = await handleSendSmsHook(await hookRequest("23277000012"), deps);
  assert.equal(res.status, 502);
  const row = [...rows.values()][0];
  assert.equal(row.auth_code_ciphertext, null);
});

test("webhook GET challenge and POST signature", async () => {
  const { deps } = setup();
  assert.equal(handleWebhookVerify(new Request("https://x/w?hub.mode=subscribe&hub.verify_token=verify-token-test&hub.challenge=9"), deps).status, 200);
  assert.equal(handleWebhookVerify(new Request("https://x/w?hub.mode=subscribe&hub.verify_token=no&hub.challenge=9"), deps).status, 403);
  assert.equal((await handleWebhookEvent(await metaRequest(statusEvent("x", "delivered"), "wrong"), deps)).status, 401);
});

test("webhook: failed status -> SMS once; delivered status recorded", async () => {
  const { deps, calls, rows } = setup("messaging");
  await handleSendSmsHook(await hookRequest("23277000014"), deps);
  const row = [...rows.values()][0];
  await handleWebhookEvent(await metaRequest(statusEvent(row.provider_message_id!, "failed", 131047)), deps);
  await handleWebhookEvent(await metaRequest(statusEvent(row.provider_message_id!, "failed", 131047)), deps);
  assert.equal(calls.filter((c) => c.url.includes("Messages.json")).length, 1);

  const s2 = setup();
  await handleSendSmsHook(await hookRequest("23277000015"), s2.deps);
  const r2 = [...s2.rows.values()][0];
  await handleWebhookEvent(await metaRequest(statusEvent(r2.provider_message_id!, "delivered")), s2.deps);
  assert.equal(s2.rows.get(r2.id)!.status, "delivered");
});

test("manual fallback: once per code, same answer for unknown numbers", async () => {
  const { deps, calls } = setup("messaging");
  await handleSendSmsHook(await hookRequest("23277000016"), deps);
  await handleManualFallback(post("fallback", { phone: "23277000016" }), deps);
  await handleManualFallback(post("fallback", { phone: "23277000016" }), deps);
  assert.equal(calls.filter((c) => c.url.includes("Messages.json")).length, 1);
  assert.equal((await handleManualFallback(post("fallback", { phone: "23277999999" }), deps)).status, 200);
});

test("a new code supersedes the old one: old code and old internal code are dead", async () => {
  const { deps, rows } = setup();
  await handleSendSmsHook(await hookRequest("23277000017"), deps);
  clock = new Date(clock.getTime() + 90_000);
  await handleSendSmsHook(await hookRequest("23277000017", "9999999999"), deps);
  const [a, b] = [...rows.values()];
  assert.equal(a.status, "superseded");
  assert.equal(a.auth_code_ciphertext, null);
  assert.equal(b.status, "sent");
});

// Payload shapes below follow supabase/auth internal/api/phone.go and mfa.go:
// phone change sends sms.phone = the NEW number with user.phone = the old one;
// MFA sets sms_type "mfa"; signup/recovery/reauthentication send no sms_type.

test("phone change: code goes to the NEW number and verifies as phone_change", async () => {
  const { deps, calls } = setup();
  const req = await hookRequest("23277000020", AUTH_OTP, HOOK_KEY, {
    user: { phone: "23277000019", phone_change: "23277000020" },
    sms: { phone: "23277000020" },
  });
  assert.equal((await handleSendSmsHook(req, deps)).status, 200);
  assert.equal(JSON.parse(calls[0].body).to, "23277000020");
  const res = await handleVerify(post("verify", { phone: "+23277000020", token: USER_CODE, type: "phone_change" }), deps);
  assert.equal(res.status, 200);
  const authCall = calls.find((c) => c.url.endsWith("/auth/v1/verify"))!;
  assert.deepEqual(JSON.parse(authCall.body), { type: "phone_change", phone: "+23277000020", token: AUTH_OTP });
  // The OLD number has no code to use.
  assert.equal((await handleVerify(post("verify", { phone: "23277000019", token: USER_CODE }), deps)).status, 404);
});

test("verify only forwards the sms / phone_change types to Supabase", async () => {
  const { deps, calls } = setup();
  await handleSendSmsHook(await hookRequest("23277000021"), deps);
  await handleVerify(post("verify", { phone: "23277000021", token: USER_CODE, type: "recovery" }), deps);
  const authCall = calls.find((c) => c.url.endsWith("/auth/v1/verify"))!;
  assert.equal(JSON.parse(authCall.body).type, "sms");
});

test("SMS MFA challenge is refused (not supported with the two-code model)", async () => {
  const { deps, calls } = setup();
  const res = await handleSendSmsHook(await hookRequest("23277000022", "123456", HOOK_KEY, { sms: { sms_type: "mfa" } }), deps);
  assert.equal(res.status, 400);
  assert.match((await res.json()).error.message, /authenticator app/);
  assert.equal(calls.length, 0);
});

test("hook answers inside Supabase's 5 s window even if WhatsApp hangs", async () => {
  const m = memStore();
  let whatsappCalls = 0;
  const hanging = (async (url: string, init: RequestInit) => {
    if (url.includes("graph.facebook.com")) {
      whatsappCalls++;
      return await new Promise<Response>((_, reject) => init.signal!.addEventListener("abort", () => reject(new Error("aborted"))));
    }
    throw new Error("no other call expected");
  }) as unknown as typeof fetch;
  const deps = { env: { ...envWith("verify_native"), hookBudgetMs: 800 }, store: m.store, fetch: hanging, now, log, uuid, newCode };
  const t0 = Date.now();
  const keepAlive = setInterval(() => {}, 50); // AbortSignal.timeout timers are unref'd in Node
  const res = await handleSendSmsHook(await hookRequest("23277000023"), deps);
  clearInterval(keepAlive);
  assert.equal(res.status, 200);
  assert.ok(Date.now() - t0 < 1500, "answered quickly");
  assert.equal(whatsappCalls, 1);
  assert.ok([...m.rows.values()][0].user_code_ciphertext, "code kept for the SMS button");
});

test("definite WhatsApp failure with no time left: no SMS inside the hook, button still works", async () => {
  const m = memStore();
  const calls: string[] = [];
  const slowFail = (async (url: string) => {
    calls.push(url);
    if (url.includes("graph.facebook.com")) {
      await new Promise((r) => setTimeout(r, 400));
      return Response.json({ error: { code: 100 } }, { status: 400 });
    }
    return Response.json({ sid: "VE9" }, { status: 201 });
  }) as unknown as typeof fetch;
  const deps = { env: { ...envWith("verify_native"), hookBudgetMs: 700 }, store: m.store, fetch: slowFail, now, log, uuid, newCode };
  assert.equal((await handleSendSmsHook(await hookRequest("23277000024"), deps)).status, 200);
  assert.equal(calls.filter((u) => u.includes("twilio")).length, 0);
  await handleManualFallback(post("fallback", { phone: "23277000024" }), deps);
  assert.equal(calls.filter((u) => u.includes("twilio")).length, 1);
});

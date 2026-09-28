// Run: node --experimental-strip-types --test supabase/functions/otp-delivery/handlers.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { bytesToBase64, bytesToHex, hmacSha256 } from "./crypto.ts";
import {
  blockedUntil,
  type Env,
  handleCheck,
  handleManualFallback,
  handleSendSmsHook,
  handleWebhookEvent,
  handleWebhookVerify,
} from "./handlers.ts";
import type { Delivery, Store } from "./store.ts";

const enc = new TextEncoder();
const HOOK_KEY = crypto.getRandomValues(new Uint8Array(32));
const HOOK_SECRET = `v1,whsec_${bytesToBase64(HOOK_KEY)}`;

const env: Env = {
  otpCodeKey: bytesToBase64(crypto.getRandomValues(new Uint8Array(32))),
  sendSmsHookSecret: HOOK_SECRET,
  whatsappAppSecret: "app-secret-test",
  webhookVerifyToken: "verify-token-test",
  graphVersion: "v23.0",
  whatsappToken: "wa-token-test",
  whatsappPhoneNumberId: "1394928910365376",
  whatsappTemplate: "kunthai_login_code",
  whatsappTemplateLang: "en",
  twilioAccountSid: "ACtest",
  twilioAuthToken: "twilio-test",
  twilioVerifyServiceSid: "VAtest",
  twilioVerifyCustomCode: true,
  twilioMessagingServiceSid: "",
  codeTtlSeconds: 600,
  maxCodesPerDay: 3,
  lockoutHours: 72,
  maxAttempts: 5,
  unreachableDays: 30,
};

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
        if (r.phone === phone && ["sending", "sent", "delivered"].includes(r.status)) {
          r.status = "superseded";
          r.code_ciphertext = null;
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
        .filter((r) => r.phone === phone && ["sending", "sent", "delivered", "exhausted"].includes(r.status) && r.expires_at > nowIso)
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
function mockFetch(plan: { whatsapp?: () => Response; twilio?: () => Response }) {
  const calls: Call[] = [];
  const f = (async (url: string, init: RequestInit) => {
    calls.push({ url, body: String(init.body) });
    if (url.includes("graph.facebook.com")) {
      return plan.whatsapp ? plan.whatsapp() : Response.json({ messages: [{ id: "wamid.OK1" }] });
    }
    return plan.twilio ? plan.twilio() : Response.json({ sid: "VEtest" }, { status: 201 });
  }) as unknown as typeof fetch;
  return { f, calls };
}

let clock = new Date("2026-09-28T12:00:00Z");
const now = () => clock;
let n = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
const logs: Record<string, unknown>[] = [];
const log = (e: Record<string, unknown>) => logs.push(e);

async function hookRequest(phone: string, otp: string, secret = HOOK_KEY) {
  const body = JSON.stringify({ user: { id: "u1", phone }, sms: { otp } });
  const id = "msg_1";
  const ts = String(Math.floor(clock.getTime() / 1000));
  const sig = bytesToBase64(await hmacSha256(secret, `${id}.${ts}.${body}`));
  return new Request("https://x/functions/v1/otp-delivery", {
    method: "POST",
    headers: { "webhook-id": id, "webhook-timestamp": ts, "webhook-signature": `v1,${sig}` },
    body,
  });
}

async function metaRequest(payload: unknown, secret = env.whatsappAppSecret) {
  const raw = JSON.stringify(payload);
  const sig = bytesToHex(await hmacSha256(enc.encode(secret), raw));
  return new Request("https://x/functions/v1/otp-delivery/webhook", {
    method: "POST",
    headers: { "x-hub-signature-256": `sha256=${sig}` },
    body: raw,
  });
}

const statusEvent = (id: string, status: string, code?: number) => ({
  entry: [{ changes: [{ field: "messages", value: { statuses: [{ id, status, ...(code ? { errors: [{ code }] } : {}) }] } }] }],
});

const post = (path: string, body: unknown) =>
  new Request(`https://x/functions/v1/otp-delivery/${path}`, { method: "POST", body: JSON.stringify(body) });

test("hook: rejects bad signature", async () => {
  const { store } = memStore();
  const res = await handleSendSmsHook(await hookRequest("23230318472", "123456", new Uint8Array(32)), { env, store, now, log, uuid });
  assert.equal(res.status, 401);
});

test("hook: sends via WhatsApp only, stores hash + ciphertext, never logs the code", async () => {
  const { store, rows } = memStore();
  const { f, calls } = mockFetch({});
  logs.length = 0;
  const res = await handleSendSmsHook(await hookRequest("+232 30 318472", "482913"), { env, store, fetch: f, now, log, uuid });
  assert.equal(res.status, 200);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /graph\.facebook\.com\/v23\.0\/1394928910365376\/messages/);
  const sent = JSON.parse(calls[0].body);
  assert.equal(sent.template.name, "kunthai_login_code");
  assert.equal(sent.template.components[1].sub_type, "url");
  const row = [...rows.values()][0];
  assert.equal(row.status, "sent");
  assert.equal(row.provider_message_id, "wamid.OK1");
  assert.ok(row.code_hash && !row.code_hash.includes("482913"));
  assert.ok(row.code_ciphertext && !row.code_ciphertext.includes("482913"));
  assert.ok(!JSON.stringify(logs).includes("482913"));
  assert.ok(!JSON.stringify(logs).includes("30318472"));
  assert.ok(!JSON.stringify(logs).includes("wa-token-test"));
});

test("hook: definite WhatsApp API error falls back to Twilio with the SAME code", async () => {
  const { store, rows, unreachable } = memStore();
  const { f, calls } = mockFetch({ whatsapp: () => Response.json({ error: { code: 131026 } }, { status: 400 }) });
  const res = await handleSendSmsHook(await hookRequest("23277000001", "111222"), { env, store, fetch: f, now, log, uuid });
  assert.equal(res.status, 200);
  assert.equal(calls.length, 2);
  assert.match(calls[1].url, /verify\.twilio\.com/);
  assert.match(calls[1].body, /CustomCode=111222/);
  const row = [...rows.values()][0];
  assert.equal(row.current_channel, "twilio_verify");
  assert.equal(row.code_ciphertext, null);
  assert.ok(unreachable.has("23277000001"));
});

test("hook: WhatsApp timeout is NOT a definite failure -> no automatic SMS", async () => {
  const { store, rows } = memStore();
  const { f, calls } = mockFetch({
    whatsapp: () => {
      throw new Error("timeout");
    },
  });
  const res = await handleSendSmsHook(await hookRequest("23277000002", "333444"), { env, store, fetch: f, now, log, uuid });
  assert.equal(res.status, 200);
  assert.equal(calls.length, 1);
  const row = [...rows.values()][0];
  assert.ok(row.code_ciphertext, "code kept for manual SMS button");
});

test("hook: all channels fail -> error to Supabase", async () => {
  const { store } = memStore();
  const { f } = mockFetch({
    whatsapp: () => Response.json({ error: { code: 100 } }, { status: 400 }),
    twilio: () => Response.json({ code: 60200 }, { status: 400 }),
  });
  const res = await handleSendSmsHook(await hookRequest("23277000003", "555666"), { env, store, fetch: f, now, log, uuid });
  assert.equal(res.status, 502);
  assert.ok((await res.json()).error.message);
});

test("hook: server-side resend limit (3 per 24h, then 72h lockout)", async () => {
  const { store } = memStore();
  const { f } = mockFetch({});
  const phone = "23277000004";
  const start = clock;
  for (let i = 0; i < 3; i++) {
    clock = new Date(start.getTime() + i * 120_000);
    const r = await handleSendSmsHook(await hookRequest(phone, `10000${i}`), { env, store, fetch: f, now, log, uuid });
    assert.equal(r.status, 200, `code ${i + 1} allowed`);
  }
  clock = new Date(start.getTime() + 10 * 60_000);
  assert.equal((await handleSendSmsHook(await hookRequest(phone, "100009"), { env, store, fetch: f, now, log, uuid })).status, 429);
  clock = new Date(start.getTime() + 60 * 3600_000);
  assert.equal((await handleSendSmsHook(await hookRequest(phone, "100010"), { env, store, fetch: f, now, log, uuid })).status, 429);
  clock = new Date(start.getTime() + 73 * 3600_000);
  assert.equal((await handleSendSmsHook(await hookRequest(phone, "100011"), { env, store, fetch: f, now, log, uuid })).status, 200);
  clock = start;
});

test("blockedUntil helper", () => {
  const t0 = new Date("2026-01-01T00:00:00Z");
  assert.equal(blockedUntil([], t0, 3, 72), 0);
  const times = ["2026-01-01T00:00:00Z", "2026-01-01T01:00:00Z", "2026-01-01T02:00:00Z"];
  assert.ok(blockedUntil(times, new Date("2026-01-01T03:00:00Z"), 3, 72) > 0);
  assert.equal(blockedUntil(["2026-01-01T00:00:00Z", "2026-01-02T01:00:00Z", "2026-01-03T02:00:00Z"], new Date("2026-01-03T03:00:00Z"), 3, 72), 0);
});

test("webhook GET: challenge only with the right verify token", () => {
  const ok = handleWebhookVerify(
    new Request("https://x/otp-delivery/webhook?hub.mode=subscribe&hub.verify_token=verify-token-test&hub.challenge=12345"),
    { env, store: memStore().store },
  );
  assert.equal(ok.status, 200);
  const bad = handleWebhookVerify(
    new Request("https://x/otp-delivery/webhook?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=12345"),
    { env, store: memStore().store },
  );
  assert.equal(bad.status, 403);
});

test("webhook POST: bad signature rejected", async () => {
  const res = await handleWebhookEvent(await metaRequest(statusEvent("x", "delivered"), "wrong"), { env, store: memStore().store, log });
  assert.equal(res.status, 401);
});

test("webhook POST: delivered marks row; failed triggers SMS with same code once", async () => {
  const { store, rows } = memStore();
  const { f, calls } = mockFetch({});
  await handleSendSmsHook(await hookRequest("23277000005", "777888"), { env, store, fetch: f, now, log, uuid });
  const row = [...rows.values()][0];
  const mid = row.provider_message_id!;

  await handleWebhookEvent(await metaRequest(statusEvent(mid, "failed", 131047)), { env, store, fetch: f, now, log, uuid });
  assert.equal(calls.length, 2);
  assert.match(calls[1].body, /CustomCode=777888/);
  const after = rows.get(row.id)!;
  assert.equal(after.current_channel, "twilio_verify");
  assert.equal(after.code_ciphertext, null);

  // A repeated failed event must not send again.
  await handleWebhookEvent(await metaRequest(statusEvent(mid, "failed", 131047)), { env, store, fetch: f, now, log, uuid });
  assert.equal(calls.length, 2);
});

test("webhook POST: delivered status", async () => {
  const { store, rows } = memStore();
  const { f } = mockFetch({});
  await handleSendSmsHook(await hookRequest("23277000006", "121212"), { env, store, fetch: f, now, log, uuid });
  const row = [...rows.values()][0];
  const res = await handleWebhookEvent(await metaRequest(statusEvent(row.provider_message_id!, "delivered")), { env, store, fetch: f, now, log, uuid });
  assert.equal(res.status, 200);
  assert.equal(rows.get(row.id)!.status, "delivered");
});

test("manual fallback: same code by SMS, only once", async () => {
  const { store, rows } = memStore();
  const { f, calls } = mockFetch({});
  await handleSendSmsHook(await hookRequest("23277000007", "989898"), { env, store, fetch: f, now, log, uuid });
  const r1 = await handleManualFallback(post("fallback", { phone: "+23277000007" }), { env, store, fetch: f, now, log, uuid });
  assert.equal(r1.status, 200);
  assert.equal(calls.length, 2);
  assert.match(calls[1].body, /CustomCode=989898/);
  await handleManualFallback(post("fallback", { phone: "+23277000007" }), { env, store, fetch: f, now, log, uuid });
  assert.equal(calls.length, 2, "second tap does nothing");
  assert.equal([...rows.values()][0].code_ciphertext, null);
  // Unknown number: same answer, no send.
  const r3 = await handleManualFallback(post("fallback", { phone: "+23277999999" }), { env, store, fetch: f, now, log, uuid });
  assert.equal(r3.status, 200);
  assert.equal(calls.length, 2);
});

test("check: wrong codes counted, locks after 5, right code passes before lock", async () => {
  const { store } = memStore();
  const { f } = mockFetch({});
  await handleSendSmsHook(await hookRequest("23277000008", "246810"), { env, store, fetch: f, now, log, uuid });
  const deps = { env, store, fetch: f, now, log, uuid };
  const r1 = await handleCheck(post("check", { phone: "23277000008", token: "000000" }), deps);
  assert.equal(r1.status, 400);
  assert.equal((await r1.json()).attemptsLeft, 4);
  const ok = await handleCheck(post("check", { phone: "23277000008", token: "246810" }), deps);
  assert.equal(ok.status, 200);

  const { store: s2 } = memStore();
  await handleSendSmsHook(await hookRequest("23277000009", "135791"), { env, store: s2, fetch: f, now, log, uuid });
  const d2 = { env, store: s2, fetch: f, now, log, uuid };
  for (let i = 0; i < 5; i++) await handleCheck(post("check", { phone: "23277000009", token: "000000" }), d2);
  const locked = await handleCheck(post("check", { phone: "23277000009", token: "135791" }), d2);
  assert.equal(locked.status, 429);
});

test("check: expired code is not tracked any more", async () => {
  const { store } = memStore();
  const { f } = mockFetch({});
  await handleSendSmsHook(await hookRequest("23277000010", "112233"), { env, store, fetch: f, now, log, uuid });
  const saved = clock;
  clock = new Date(clock.getTime() + 11 * 60_000);
  const r = await handleCheck(post("check", { phone: "23277000010", token: "112233" }), { env, store, fetch: f, now, log, uuid });
  assert.equal((await r.json()).tracked, false);
  clock = saved;
});

test("new code supersedes the old one (one valid attempt)", async () => {
  const { store, rows } = memStore();
  const { f } = mockFetch({});
  await handleSendSmsHook(await hookRequest("23277000011", "111111"), { env, store, fetch: f, now, log, uuid });
  clock = new Date(clock.getTime() + 90_000);
  await handleSendSmsHook(await hookRequest("23277000011", "222222"), { env, store, fetch: f, now, log, uuid });
  const [a, b] = [...rows.values()];
  assert.equal(a.status, "superseded");
  assert.equal(a.code_ciphertext, null);
  assert.equal(b.status, "sent");
  const oldCode = await handleCheck(post("check", { phone: "23277000011", token: "111111" }), { env, store, fetch: f, now, log, uuid });
  assert.equal(oldCode.status, 400);
});

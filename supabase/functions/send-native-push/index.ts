// Drains public.push_outbox and delivers each queued push to the recipient's
// iOS devices (APNs, token-based auth) and Android devices (FCM HTTP v1).
//
// Called by public.kunthai_kick_native_push() through pg_net: right after
// rows are queued (a trigger on push_outbox) and every minute by pg_cron as a
// safety net; see docs/2026-10-11-native-push-delivery.md. The request body is
// ignored: every call drains ready rows in batches of BATCH_SIZE for up to
// DRAIN_BUDGET_MS.
//
// Each claimed row is leased to this call (push_outbox_claim). Its outcome is
// stored with push_outbox_record: delivered, retry later (network errors,
// timeouts, 429 / 5xx, provider auth problems) or closed for good (bad
// payload, every device token invalid, no provider configured for the
// recipient's devices). Tokens APNs or FCM report as gone (APNs 410 /
// BadDeviceToken / Unregistered / DeviceTokenNotForTopic; FCM 404 /
// UNREGISTERED / SENDER_ID_MISMATCH / INVALID_ARGUMENT about the token) are
// deleted and never retried. An iOS token APNs calls BadDeviceToken is first
// tried once on the other APNs environment, so builds run from Xcode (sandbox
// tokens) and TestFlight / App Store builds (production tokens) both work
// whichever APNS_ENV is set.
//
// Secrets come only from the function's environment (supabase secrets set):
//   APNS_KEY_P8, APNS_KEY_ID, APNS_TEAM_ID, APNS_BUNDLE_ID, APNS_ENV
//   FCM_SERVICE_ACCOUNT_JSON
//   PUSH_DRAIN_SECRET (shared secret sent by pg_net as x-push-secret)
// They are never logged or returned, and neither are device tokens. With
// neither APNs nor FCM configured the function logs "push not configured"
// and leaves the queue untouched.

import { createClient } from "npm:@supabase/supabase-js@2.57.4";

type Platform = "ios" | "android";
type Device = { token: string; platform: Platform };
type OutboxRow = {
  id: string;
  user_id: string;
  title: string;
  body: string;
  route: string;
  kind: string;
  attempts: number;
  devices: Device[] | null;
};
type SendResult = { ok: boolean; invalidToken?: boolean; skipped?: boolean; retryable?: boolean; error?: string };
type RowOutcome = { delivered: boolean; invalidTokens: string[]; error: string | null; retry: boolean };

type ApnsConfig = { keyP8: string; keyId: string; teamId: string; bundleId: string; host: string; otherHost: string };
type FcmConfig = { projectId: string; clientEmail: string; privateKey: string };

const BATCH_SIZE = 100;
const PARALLEL_ROWS = 10;
const MAX_BATCHES = 5;
const DRAIN_BUDGET_MS = 25_000;
const REQUEST_TIMEOUT_MS = 10_000;
const APNS_PRODUCTION_HOST = "api.push.apple.com";
const APNS_SANDBOX_HOST = "api.sandbox.push.apple.com";
const encoder = new TextEncoder();

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-push-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function env(name: string) {
  return (Deno.env.get(name) || "").trim();
}

function base64Url(input: Uint8Array | string) {
  const bytes = typeof input === "string" ? encoder.encode(input) : input;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

// Accepts a PEM with real newlines or with "\n" escapes (as secrets often are).
function pemToDer(pem: string): ArrayBuffer {
  const body = pem
    .replace(/\\n/g, "\n")
    .replace(/-----BEGIN [A-Z ]+-----/g, "")
    .replace(/-----END [A-Z ]+-----/g, "")
    .replace(/\s+/g, "");
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
}

async function signJwt(header: Record<string, unknown>, claims: Record<string, unknown>, key: CryptoKey, algorithm: AlgorithmIdentifier | EcdsaParams) {
  const unsigned = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(claims))}`;
  const signature = new Uint8Array(await crypto.subtle.sign(algorithm, key, encoder.encode(unsigned)));
  return `${unsigned}.${base64Url(signature)}`;
}

function safeEqual(left: string, right: string) {
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  let diff = a.length ^ b.length;
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    diff |= (a[index] ?? 0) ^ (b[index] ?? 0);
  }
  return diff === 0;
}

function isRetryableStatus(status: number) {
  return status === 408 || status === 429 || status >= 500;
}

// --- APNs -------------------------------------------------------------------

function readApnsConfig(): ApnsConfig | null {
  const keyP8 = env("APNS_KEY_P8");
  const keyId = env("APNS_KEY_ID");
  const teamId = env("APNS_TEAM_ID");
  const bundleId = env("APNS_BUNDLE_ID") || "app.kunthai.mobile";
  if (!keyP8 || !keyId || !teamId) return null;
  const sandbox = ["development", "sandbox", "dev"].includes(env("APNS_ENV").toLowerCase());
  return sandbox
    ? { keyP8, keyId, teamId, bundleId, host: APNS_SANDBOX_HOST, otherHost: APNS_PRODUCTION_HOST }
    : { keyP8, keyId, teamId, bundleId, host: APNS_PRODUCTION_HOST, otherHost: APNS_SANDBOX_HOST };
}

// --- Sounds -----------------------------------------------------------------
// Mirrors pushSoundForKind in src/Backend/services/nativePushLogic.js. The
// files ship in the app (ios/App/App and android res/raw). An older app build
// without them falls back on its own: iOS plays the default sound for a
// missing file, and Android uses the manifest's default channel when the
// channel has not been created yet.

type PushSound = { sound: string; androidSound: string; channel: string; timeSensitive: boolean };

const PUSH_SOUNDS: Record<string, PushSound> = {
  ride: { sound: "kt_ride_request.wav", androidSound: "kt_ride_request", channel: "kunthai_ride_requests", timeSensitive: true },
  message: { sound: "kt_message.wav", androidSound: "kt_message", channel: "kunthai_messages", timeSensitive: false },
  order: { sound: "kt_order.wav", androidSound: "kt_order", channel: "kunthai_orders", timeSensitive: false },
  default: { sound: "default", androidSound: "default", channel: "kunthai_alerts", timeSensitive: false },
};

const PUSH_SOUND_BY_KIND: Record<string, string> = {
  urride_request: "ride",
  messages: "message",
  urmall_message: "message",
  orders: "order",
  urmall_order: "order",
  urmall_booking: "order",
  urride_trip: "order",
};

function pushSound(kind: string): PushSound {
  return PUSH_SOUNDS[PUSH_SOUND_BY_KIND[String(kind || "").toLowerCase()] || "default"];
}

let apnsKey: CryptoKey | null = null;
let apnsJwtCache: { token: string; issuedAt: number } | null = null;

async function apnsJwt(config: ApnsConfig) {
  const now = Math.floor(Date.now() / 1000);
  // Apple accepts a provider token for an hour and rejects refreshing more
  // often than every 20 minutes; reuse one for 45 minutes. The same token
  // works for the sandbox and production hosts.
  if (apnsJwtCache && now - apnsJwtCache.issuedAt < 45 * 60) return apnsJwtCache.token;
  apnsKey ??= await crypto.subtle.importKey("pkcs8", pemToDer(config.keyP8), { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const token = await signJwt({ alg: "ES256", kid: config.keyId }, { iss: config.teamId, iat: now }, apnsKey, { name: "ECDSA", hash: "SHA-256" });
  apnsJwtCache = { token, issuedAt: now };
  return token;
}

async function postApns(config: ApnsConfig, host: string, device: Device, row: OutboxRow) {
  const jwt = await apnsJwt(config);
  const tone = pushSound(row.kind);
  const response = await fetch(`https://${host}/3/device/${encodeURIComponent(device.token)}`, {
    method: "POST",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: {
      authorization: `bearer ${jwt}`,
      "apns-topic": config.bundleId,
      "apns-push-type": "alert",
      "apns-priority": "10",
      "apns-expiration": String(Math.floor(Date.now() / 1000) + 24 * 60 * 60),
      "content-type": "application/json",
    },
    body: JSON.stringify({
      aps: {
        alert: { title: row.title, body: row.body },
        sound: tone.sound,
        "thread-id": row.kind || "kunthai",
        // Ride requests break through Focus once the app has the Time
        // Sensitive Notifications capability; without it iOS treats this as
        // "active" (normal), so it is safe to send either way.
        ...(tone.timeSensitive ? { "interruption-level": "time-sensitive" } : {}),
      },
      route: row.route || "",
      kind: row.kind || "",
    }),
  });
  if (response.ok) return { status: response.status, reason: "" };
  let reason = "";
  try {
    reason = String((await response.json())?.reason || "");
  } catch {
    reason = "";
  }
  return { status: response.status, reason };
}

async function sendApns(config: ApnsConfig, device: Device, row: OutboxRow): Promise<SendResult> {
  let result = await postApns(config, config.host, device, row);
  // A token from the other APNs environment (an Xcode build with a
  // production APNS_ENV, or the reverse) is BadDeviceToken on this host.
  if (result.reason === "BadDeviceToken") {
    const other = await postApns(config, config.otherHost, device, row);
    if (other.status === 200 || other.reason !== "BadDeviceToken") result = other;
  }
  if (result.status === 200) return { ok: true };
  const { status, reason } = result;
  if (status === 410 || ["BadDeviceToken", "Unregistered", "DeviceTokenNotForTopic"].includes(reason)) {
    return { ok: false, invalidToken: true };
  }
  if (reason === "ExpiredProviderToken" || reason === "InvalidProviderToken") apnsJwtCache = null;
  // 403: provider token / key problem; fixable by the owner, so retry later.
  const retryable = isRetryableStatus(status) || status === 403;
  return { ok: false, retryable, error: `APNs ${status}${reason ? ` ${reason}` : ""}` };
}

// --- FCM HTTP v1 --------------------------------------------------------------

function readFcmConfig(): FcmConfig | null {
  const raw = env("FCM_SERVICE_ACCOUNT_JSON");
  if (!raw) return null;
  try {
    const account = JSON.parse(raw);
    const projectId = String(account?.project_id || "");
    const clientEmail = String(account?.client_email || "");
    const privateKey = String(account?.private_key || "");
    if (!projectId || !clientEmail || !privateKey) {
      console.warn("[send-native-push] FCM_SERVICE_ACCOUNT_JSON is missing project_id, client_email or private_key");
      return null;
    }
    return { projectId, clientEmail, privateKey };
  } catch {
    console.warn("[send-native-push] FCM_SERVICE_ACCOUNT_JSON is not valid JSON");
    return null;
  }
}

let fcmKey: CryptoKey | null = null;
let fcmAccessCache: { token: string; expiresAt: number } | null = null;

async function fcmAccessToken(config: FcmConfig) {
  const now = Math.floor(Date.now() / 1000);
  if (fcmAccessCache && fcmAccessCache.expiresAt - 120 > now) return fcmAccessCache.token;
  fcmKey ??= await crypto.subtle.importKey("pkcs8", pemToDer(config.privateKey), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const assertion = await signJwt(
    { alg: "RS256", typ: "JWT" },
    {
      iss: config.clientEmail,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    },
    fcmKey,
    { name: "RSASSA-PKCS1-v1_5" },
  );
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  if (!response.ok) throw new Error(`FCM auth ${response.status}`);
  const data = await response.json();
  fcmAccessCache = { token: String(data.access_token || ""), expiresAt: now + Number(data.expires_in || 3600) };
  return fcmAccessCache.token;
}

type FcmErrorBody = {
  error?: {
    status?: string;
    message?: string;
    details?: Array<{ errorCode?: string; fieldViolations?: Array<{ field?: string }> }>;
  };
};

async function sendFcm(config: FcmConfig, device: Device, row: OutboxRow): Promise<SendResult> {
  const accessToken = await fcmAccessToken(config);
  const response = await fetch(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(config.projectId)}/messages:send`, {
    method: "POST",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    body: JSON.stringify({
      message: {
        token: device.token,
        notification: { title: row.title, body: row.body },
        data: { route: row.route || "", kind: row.kind || "" },
        android: {
          priority: "HIGH",
          notification: {
            sound: pushSound(row.kind).androidSound,
            channel_id: pushSound(row.kind).channel,
            tag: row.kind || "kunthai",
          },
        },
      },
    }),
  });
  if (response.ok) return { ok: true };
  let errorCode = "";
  let status = "";
  let aboutToken = false;
  try {
    const data = (await response.json()) as FcmErrorBody;
    status = String(data?.error?.status || "");
    const details = Array.isArray(data?.error?.details) ? data.error.details : [];
    errorCode = String(details.find((detail) => detail?.errorCode)?.errorCode || "");
    // INVALID_ARGUMENT also covers a bad payload; only a complaint about the
    // token means the token itself is unusable.
    aboutToken = details.some((detail) => (detail?.fieldViolations || []).some((violation) => /token/i.test(String(violation?.field || ""))))
      || /registration token/i.test(String(data?.error?.message || ""));
  } catch {
    errorCode = "";
  }
  const code = errorCode || status;
  if (response.status === 404 || code === "UNREGISTERED" || code === "SENDER_ID_MISMATCH"
    || (response.status === 400 && code === "INVALID_ARGUMENT" && aboutToken)) {
    return { ok: false, invalidToken: true };
  }
  if (response.status === 401) fcmAccessCache = null;
  const retryable = isRetryableStatus(response.status) || response.status === 401
    || ["UNAVAILABLE", "INTERNAL", "QUOTA_EXCEEDED"].includes(code);
  return { ok: false, retryable, error: `FCM ${response.status}${code ? ` ${code}` : ""}` };
}

// --- Drain ----------------------------------------------------------------------

async function deliver(row: OutboxRow, apns: ApnsConfig | null, fcm: FcmConfig | null): Promise<RowOutcome> {
  const devices = Array.isArray(row.devices) ? row.devices : [];
  if (!devices.length) return { delivered: false, invalidTokens: [], error: "no registered devices", retry: false };
  const results = await Promise.all(devices.map(async (device): Promise<SendResult & { token: string }> => {
    try {
      if (device.platform === "ios") {
        return apns ? { ...(await sendApns(apns, device, row)), token: device.token } : { ok: false, skipped: true, token: device.token };
      }
      if (device.platform === "android") {
        return fcm ? { ...(await sendFcm(fcm, device, row)), token: device.token } : { ok: false, skipped: true, token: device.token };
      }
      return { ok: false, skipped: true, token: device.token };
    } catch (error) {
      // Network failures and timeouts: try again later. The stored reason
      // never contains a token or a key.
      const name = error instanceof Error ? error.name : "";
      const message = error instanceof Error && /^FCM auth \d+$/.test(error.message) ? error.message : "";
      return { ok: false, retryable: true, error: message || (name === "TimeoutError" ? "request timed out" : "network error"), token: device.token };
    }
  }));
  const invalidTokens = results.filter((result) => result.invalidToken).map((result) => result.token);
  if (results.some((result) => result.ok)) return { delivered: true, invalidTokens, error: null, retry: false };

  const errors = [...new Set(results.filter((result) => result.error).map((result) => result.error as string))];
  if (results.some((result) => result.retryable)) {
    return { delivered: false, invalidTokens, error: errors.join("; ").slice(0, 500) || "temporary error", retry: true };
  }
  const reasons = [...errors];
  if (invalidTokens.length) reasons.push("device token no longer valid");
  if (results.some((result) => result.skipped)) reasons.push("push provider not configured for this device");
  return { delivered: false, invalidTokens, error: reasons.join("; ").slice(0, 500) || "not delivered", retry: false };
}

type RpcCall = (fn: string, args: Record<string, unknown>) => PromiseLike<{ error: { code?: string } | null }>;

async function recordOutcome(rpc: RpcCall, row: OutboxRow, outcome: RowOutcome) {
  const { error } = await rpc("push_outbox_record", {
    p_id: row.id,
    p_error: outcome.error,
    p_retry: outcome.retry,
    p_attempt: row.attempts,
  });
  if (!error) return;
  // A database without 20261011100000_native_push_delivery.sql yet.
  if (error.code === "PGRST202" || error.code === "42883") {
    const { error: finishError } = await rpc("push_outbox_finish", { p_id: row.id, p_error: outcome.error });
    if (finishError) console.error("[send-native-push] could not record a result", finishError.code || "");
    return;
  }
  console.error("[send-native-push] could not record a result", error.code || "");
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = env("SUPABASE_URL");
  const serviceRoleKey = env("SUPABASE_SERVICE_ROLE_KEY");
  const drainSecret = env("PUSH_DRAIN_SECRET");
  if (!supabaseUrl || !serviceRoleKey) return json({ error: "Function is not configured" }, 503);

  const authorization = request.headers.get("Authorization") || "";
  const providedSecret = request.headers.get("x-push-secret") || "";
  const authorized = safeEqual(authorization, `Bearer ${serviceRoleKey}`)
    || Boolean(drainSecret && providedSecret && safeEqual(providedSecret, drainSecret));
  if (!authorized) return json({ error: "Not authorized" }, 401);

  const apns = readApnsConfig();
  const fcm = readFcmConfig();
  if (!apns && !fcm) {
    console.log("[send-native-push] push not configured (no APNs key and no FCM service account); skipping");
    return json({ skipped: true, reason: "push not configured" });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const rpc: RpcCall = (fn, args) => admin.rpc(fn, args);
  const startedAt = Date.now();
  let claimed = 0;
  let delivered = 0;
  let retrying = 0;
  let closed = 0;
  const invalidTokens = new Set<string>();

  for (let batch = 0; batch < MAX_BATCHES && Date.now() - startedAt < DRAIN_BUDGET_MS; batch += 1) {
    const { data, error } = await admin.rpc("push_outbox_claim", { p_limit: BATCH_SIZE });
    if (error) {
      console.error("[send-native-push] could not claim the queue", error.code || "", error.message || "");
      if (batch === 0) return json({ error: "Could not read the push queue" }, 500);
      break;
    }
    const rows = (data || []) as OutboxRow[];
    claimed += rows.length;

    for (let start = 0; start < rows.length; start += PARALLEL_ROWS) {
      const chunk = rows.slice(start, start + PARALLEL_ROWS);
      await Promise.all(chunk.map(async (row) => {
        const outcome = await deliver(row, apns, fcm);
        outcome.invalidTokens.forEach((token) => invalidTokens.add(token));
        if (outcome.delivered) delivered += 1;
        else if (outcome.retry) retrying += 1;
        else closed += 1;
        await recordOutcome(rpc, row, outcome);
      }));
    }

    // A short batch means the queue is empty (retries wait for their time).
    if (rows.length < BATCH_SIZE) break;
  }

  if (invalidTokens.size) {
    const { error: deleteError } = await admin.from("push_device_tokens").delete().in("token", [...invalidTokens]);
    if (deleteError) console.error("[send-native-push] could not remove expired device tokens", deleteError.code || "");
  }

  if (!apns) console.log("[send-native-push] APNs not configured; iOS devices skipped");
  if (!fcm) console.log("[send-native-push] FCM not configured; Android devices skipped");
  return json({ claimed, delivered, retrying, failed: closed, removedTokens: invalidTokens.size });
});

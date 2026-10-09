// Drains public.push_outbox and delivers each queued push to the recipient's
// iOS devices (APNs, token-based auth) and Android devices (FCM HTTP v1).
//
// Called by a Supabase cron schedule (pg_cron + pg_net) or a Database Webhook
// on push_outbox inserts; see docs/2026-10-09-native-push-and-biometrics.md.
// The request body is ignored: every call drains up to BATCH_SIZE rows.
//
// Secrets come only from the function's environment (supabase secrets set):
//   APNS_KEY_P8, APNS_KEY_ID, APNS_TEAM_ID, APNS_BUNDLE_ID, APNS_ENV
//   FCM_SERVICE_ACCOUNT_JSON
//   PUSH_DRAIN_SECRET (optional shared secret for the cron / webhook caller)
// They are never logged or returned. With neither APNs nor FCM configured the
// function logs "push not configured" and leaves the queue untouched.

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
type SendResult = { ok: boolean; invalidToken?: boolean; skipped?: boolean; error?: string };

type ApnsConfig = { keyP8: string; keyId: string; teamId: string; bundleId: string; host: string };
type FcmConfig = { projectId: string; clientEmail: string; privateKey: string };

const BATCH_SIZE = 100;
const PARALLEL_ROWS = 10;
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

// --- APNs -------------------------------------------------------------------

function readApnsConfig(): ApnsConfig | null {
  const keyP8 = env("APNS_KEY_P8");
  const keyId = env("APNS_KEY_ID");
  const teamId = env("APNS_TEAM_ID");
  const bundleId = env("APNS_BUNDLE_ID") || "app.kunthai.mobile";
  if (!keyP8 || !keyId || !teamId) return null;
  const sandbox = ["development", "sandbox", "dev"].includes(env("APNS_ENV").toLowerCase());
  return { keyP8, keyId, teamId, bundleId, host: sandbox ? "api.sandbox.push.apple.com" : "api.push.apple.com" };
}

let apnsKey: CryptoKey | null = null;
let apnsJwtCache: { token: string; issuedAt: number } | null = null;

async function apnsJwt(config: ApnsConfig) {
  const now = Math.floor(Date.now() / 1000);
  // Apple accepts a provider token for an hour and rejects refreshing more
  // often than every 20 minutes; reuse one for 45 minutes.
  if (apnsJwtCache && now - apnsJwtCache.issuedAt < 45 * 60) return apnsJwtCache.token;
  apnsKey ??= await crypto.subtle.importKey("pkcs8", pemToDer(config.keyP8), { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const token = await signJwt({ alg: "ES256", kid: config.keyId }, { iss: config.teamId, iat: now }, apnsKey, { name: "ECDSA", hash: "SHA-256" });
  apnsJwtCache = { token, issuedAt: now };
  return token;
}

async function sendApns(config: ApnsConfig, device: Device, row: OutboxRow): Promise<SendResult> {
  const jwt = await apnsJwt(config);
  const response = await fetch(`https://${config.host}/3/device/${encodeURIComponent(device.token)}`, {
    method: "POST",
    headers: {
      authorization: `bearer ${jwt}`,
      "apns-topic": config.bundleId,
      "apns-push-type": "alert",
      "apns-priority": "10",
      "apns-expiration": String(Math.floor(Date.now() / 1000) + 24 * 60 * 60),
      "content-type": "application/json",
    },
    body: JSON.stringify({
      aps: { alert: { title: row.title, body: row.body }, sound: "default", "thread-id": row.kind || "kunthai" },
      route: row.route || "",
      kind: row.kind || "",
    }),
  });
  if (response.ok) return { ok: true };
  let reason = "";
  try {
    reason = String((await response.json())?.reason || "");
  } catch {
    reason = "";
  }
  if (response.status === 410 || ["BadDeviceToken", "Unregistered", "DeviceTokenNotForTopic"].includes(reason)) {
    return { ok: false, invalidToken: true };
  }
  if (reason === "ExpiredProviderToken" || reason === "InvalidProviderToken") apnsJwtCache = null;
  return { ok: false, error: `APNs ${response.status}${reason ? ` ${reason}` : ""}` };
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
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  if (!response.ok) throw new Error(`FCM auth ${response.status}`);
  const data = await response.json();
  fcmAccessCache = { token: String(data.access_token || ""), expiresAt: now + Number(data.expires_in || 3600) };
  return fcmAccessCache.token;
}

async function sendFcm(config: FcmConfig, device: Device, row: OutboxRow): Promise<SendResult> {
  const accessToken = await fcmAccessToken(config);
  const response = await fetch(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(config.projectId)}/messages:send`, {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    body: JSON.stringify({
      message: {
        token: device.token,
        notification: { title: row.title, body: row.body },
        data: { route: row.route || "", kind: row.kind || "" },
        android: { priority: "HIGH", notification: { sound: "default", tag: row.kind || "kunthai" } },
      },
    }),
  });
  if (response.ok) return { ok: true };
  let errorCode = "";
  let status = "";
  try {
    const data = await response.json();
    status = String(data?.error?.status || "");
    const details = Array.isArray(data?.error?.details) ? data.error.details : [];
    errorCode = String(details.find((detail: { errorCode?: string }) => detail?.errorCode)?.errorCode || "");
  } catch {
    errorCode = "";
  }
  if (response.status === 404 || errorCode === "UNREGISTERED" || (response.status === 400 && errorCode === "INVALID_ARGUMENT")) {
    return { ok: false, invalidToken: true };
  }
  if (response.status === 401) fcmAccessCache = null;
  return { ok: false, error: `FCM ${response.status}${errorCode || status ? ` ${errorCode || status}` : ""}` };
}

// --- Drain ----------------------------------------------------------------------

async function deliver(row: OutboxRow, apns: ApnsConfig | null, fcm: FcmConfig | null) {
  const devices = Array.isArray(row.devices) ? row.devices : [];
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
      return { ok: false, error: error instanceof Error ? error.message.slice(0, 200) : "send failed", token: device.token };
    }
  }));
  const delivered = results.some((result) => result.ok);
  const invalidTokens = results.filter((result) => result.invalidToken).map((result) => result.token);
  const errors = results.filter((result) => result.error).map((result) => result.error as string);
  return { delivered, invalidTokens, error: delivered || !errors.length ? null : errors.join("; ").slice(0, 500) };
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
  const { data, error } = await admin.rpc("push_outbox_claim", { p_limit: BATCH_SIZE });
  if (error) {
    console.error("[send-native-push] could not claim the queue", error.code || "", error.message || "");
    return json({ error: "Could not read the push queue" }, 500);
  }

  const rows = (data || []) as OutboxRow[];
  let delivered = 0;
  let failed = 0;
  const invalidTokens: string[] = [];

  for (let start = 0; start < rows.length; start += PARALLEL_ROWS) {
    const chunk = rows.slice(start, start + PARALLEL_ROWS);
    await Promise.all(chunk.map(async (row) => {
      const outcome = await deliver(row, apns, fcm);
      invalidTokens.push(...outcome.invalidTokens);
      if (outcome.delivered) delivered += 1;
      if (outcome.error) failed += 1;
      const { error: finishError } = await admin.rpc("push_outbox_finish", { p_id: row.id, p_error: outcome.error });
      if (finishError) console.error("[send-native-push] could not record a result", finishError.code || "");
    }));
  }

  if (invalidTokens.length) {
    const { error: deleteError } = await admin.from("push_device_tokens").delete().in("token", invalidTokens);
    if (deleteError) console.error("[send-native-push] could not remove expired device tokens", deleteError.code || "");
  }

  if (!apns) console.log("[send-native-push] APNs not configured; iOS devices skipped");
  if (!fcm) console.log("[send-native-push] FCM not configured; Android devices skipped");
  return json({ claimed: rows.length, delivered, failed, removedTokens: invalidTokens.length });
});

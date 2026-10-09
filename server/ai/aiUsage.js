// KAI — accounting: authentication, rate limits, usage logging and the
// shared response cache.
//
// Serverless functions are stateless and scale horizontally, so anything that
// must hold across requests lives in Postgres (service-role only). The
// in-memory pieces here are best-effort accelerators, never the only guard.

import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

import { CACHE, RATE_LIMITS } from "./aiConfig.js";
import { AI_ERROR_CODES, aiError } from "./aiErrors.js";

let adminClient = null;
let authClient = null;

function supabaseUrl() {
  return process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
}

/**
 * Service-role client. Used for the things only the server may do: writing the
 * usage log, reading the rate-limit snapshot, and sharing the response cache.
 * Returns null when the key is absent, and every caller degrades gracefully.
 */
export function getAdminClient() {
  if (adminClient) return adminClient;

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl() || !serviceRoleKey) return null;

  adminClient = createClient(supabaseUrl(), serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return adminClient;
}

/**
 * Client used purely to validate a caller's JWT.
 *
 * Deliberately separate from the admin client: checking "who is this token"
 * needs no elevated rights (it is exactly what the browser does with the
 * publishable anon key), so AI authentication keeps working even in an
 * environment where the service-role key is not present. Only the accounting
 * features below actually require elevation.
 */
function getAuthClient() {
  if (authClient) return authClient;

  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl() || !key) return null;

  authClient = createClient(supabaseUrl(), key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return authClient;
}

function bearerToken(req) {
  const match = String(req?.headers?.authorization || "").match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || "";
}

/**
 * Resolve the signed-in KunThai user from the request's Supabase JWT.
 *
 * Guests browse KunThai on an anonymous Supabase session. They are turned away
 * here: AI costs real money per call and an anonymous session can be minted
 * without any identity, which makes it the obvious abuse path.
 */
export async function authenticateAiRequest(req) {
  const token = bearerToken(req);
  if (!token) throw aiError(AI_ERROR_CODES.notAuthenticated, { details: "no-bearer" });

  const client = getAuthClient();
  if (!client) throw aiError(AI_ERROR_CODES.aiUnavailable, { details: "missing-supabase-config" });

  const { data, error } = await client.auth.getUser(token);
  if (error || !data?.user) {
    throw aiError(AI_ERROR_CODES.notAuthenticated, { details: "invalid-token" });
  }
  if (data.user.is_anonymous) {
    throw aiError(AI_ERROR_CODES.guestBlocked, { details: "anonymous-session" });
  }
  return data.user;
}

// --- Admin gate -------------------------------------------------------------
//
// Admin AI is checked on the server with KunThai's own authority: the caller's
// JWT is sent to the same get_my_admin_access RPC the admin app uses, so the
// database (not the browser, and not the model) decides who is an admin.

const ADMIN_ACCESS_TTL_MS = 60 * 1000;
const ADMIN_ACCESS_CACHE = new Map();

export async function verifyAdminAccess(req, userId, { rpc } = {}) {
  const cached = ADMIN_ACCESS_CACHE.get(userId);
  if (cached && Date.now() - cached.at < ADMIN_ACCESS_TTL_MS) {
    if (!cached.isAdmin) throw aiError(AI_ERROR_CODES.forbidden, { details: "not-admin-cached" });
    return cached.access;
  }

  const callRpc = rpc || (async () => {
    const url = supabaseUrl();
    const key = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
    const token = bearerToken(req);
    if (!url || !key || !token) throw aiError(AI_ERROR_CODES.aiUnavailable, { details: "admin-check-config" });
    // A client acting AS the caller: auth.uid() inside the RPC is the caller.
    const client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    return client.rpc("get_my_admin_access");
  });

  const { data, error } = await callRpc();
  if (error) throw aiError(AI_ERROR_CODES.forbidden, { details: "admin-check-failed" });
  const isAdmin = Boolean(data?.isAdmin ?? data?.is_admin);
  ADMIN_ACCESS_CACHE.set(userId, { at: Date.now(), isAdmin, access: data });
  if (ADMIN_ACCESS_CACHE.size > 200) ADMIN_ACCESS_CACHE.delete(ADMIN_ACCESS_CACHE.keys().next().value);
  if (!isAdmin) throw aiError(AI_ERROR_CODES.forbidden, { details: "not-admin" });
  return data;
}

export function clearAdminAccessCache() {
  ADMIN_ACCESS_CACHE.clear();
}

// --- Rate limiting ----------------------------------------------------------

// Per-instance fallback used only when the usage table cannot be reached, so a
// migration that has not landed yet degrades to weaker protection instead of
// taking the whole feature down. Minute, hour and day windows all apply.
const MEMORY_HITS = new Map();
const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

export function memoryRateCheck(userId, { now = Date.now(), limits = RATE_LIMITS } = {}) {
  const hits = (MEMORY_HITS.get(userId) || []).filter((at) => now - at < DAY_MS);
  const minute = hits.filter((at) => now - at < MINUTE_MS).length;
  const hour = hits.filter((at) => now - at < HOUR_MS).length;
  if (minute >= limits.perMinute) {
    throw aiError(AI_ERROR_CODES.rateLimited, { retryAfterSeconds: 30, details: "memory-minute-limit" });
  }
  if (hour >= limits.perHour) {
    throw aiError(AI_ERROR_CODES.rateLimited, { retryAfterSeconds: 600, details: "memory-hour-limit" });
  }
  if (hits.length >= limits.perDay) {
    throw aiError(AI_ERROR_CODES.budgetExceeded, { details: "memory-day-limit" });
  }
  hits.push(now);
  MEMORY_HITS.set(userId, hits);
  if (MEMORY_HITS.size > 500) {
    for (const [key, value] of MEMORY_HITS) {
      if (!value.some((at) => now - at < HOUR_MS)) MEMORY_HITS.delete(key);
    }
  }
}

// --- Per-IP guard ------------------------------------------------------------
//
// Every model call needs a signed-in member, so there is no anonymous AI path.
// This guard runs BEFORE the token is verified, to blunt floods of junk or
// stolen tokens from one address. Per instance and in memory only: the IP is
// never stored or logged.

const IP_HITS = new Map();

export function clientIp(req) {
  const forwarded = String(req?.headers?.["x-forwarded-for"] || "").split(",")[0].trim();
  return forwarded || String(req?.headers?.["x-real-ip"] || "").trim() || String(req?.socket?.remoteAddress || "");
}

export function enforceIpRateLimit(req, { now = Date.now(), perMinute = RATE_LIMITS.perIpPerMinute } = {}) {
  if (!perMinute) return;
  const ip = clientIp(req);
  if (!ip) return;
  const key = createHash("sha256").update(ip).digest("hex").slice(0, 24);
  const hits = (IP_HITS.get(key) || []).filter((at) => now - at < MINUTE_MS);
  if (hits.length >= perMinute) {
    throw aiError(AI_ERROR_CODES.rateLimited, { retryAfterSeconds: 30, details: "ip-limit" });
  }
  hits.push(now);
  IP_HITS.set(key, hits);
  if (IP_HITS.size > 2_000) {
    for (const [entry, value] of IP_HITS) {
      if (!value.some((at) => now - at < MINUTE_MS)) IP_HITS.delete(entry);
    }
  }
}

// --- Global daily spend ceiling ---------------------------------------------
//
// One number protects the bill whatever happens elsewhere: everyone's
// estimated spend over the last 24 hours together. Read from Postgres at most
// every AI_GLOBAL_SNAPSHOT_TTL_SECONDS per instance; between reads the
// instance adds its own spend so it cannot overshoot on a stale number.

const GLOBAL_SPEND = { readAt: 0, costMicros: 0, localSinceRead: 0, source: "none", warned: false };
// Used only when the database cannot answer: this instance's own spend.
const LOCAL_SPEND = [];

function localSpendLastDay(now) {
  while (LOCAL_SPEND.length && now - LOCAL_SPEND[0].at >= DAY_MS) LOCAL_SPEND.shift();
  return LOCAL_SPEND.reduce((sum, entry) => sum + entry.costMicros, 0);
}

/** Count spend this instance just caused toward the global ceiling. */
export function recordGlobalSpend(costMicros, { now = Date.now() } = {}) {
  const cost = Math.max(0, Math.round(Number(costMicros) || 0));
  if (!cost) return;
  GLOBAL_SPEND.localSinceRead += cost;
  LOCAL_SPEND.push({ at: now, costMicros: cost });
  if (LOCAL_SPEND.length > 20_000) LOCAL_SPEND.splice(0, LOCAL_SPEND.length - 20_000);
}

async function readGlobalSpend(now) {
  const ttlMs = RATE_LIMITS.globalSnapshotTtlSeconds * 1_000;
  if (GLOBAL_SPEND.source !== "none" && now - GLOBAL_SPEND.readAt < ttlMs) {
    return GLOBAL_SPEND.costMicros + GLOBAL_SPEND.localSinceRead;
  }
  const client = getAdminClient();
  if (client) {
    try {
      const { data, error } = await client.rpc("kunthai_ai_global_usage_snapshot");
      if (!error) {
        const row = Array.isArray(data) ? data[0] || {} : data || {};
        Object.assign(GLOBAL_SPEND, { readAt: now, costMicros: Number(row.day_cost_micros || 0), localSinceRead: 0, source: "database" });
        return GLOBAL_SPEND.costMicros;
      }
      if (!GLOBAL_SPEND.warned) console.warn(`[KAI] global usage snapshot unavailable (${error.code || "error"}); using this instance's spend`);
    } catch {
      if (!GLOBAL_SPEND.warned) console.warn("[KAI] global usage snapshot unavailable (exception); using this instance's spend");
    }
    GLOBAL_SPEND.warned = true;
  }
  return localSpendLastDay(now);
}

/**
 * Refuse new model calls for everyone once the combined daily spend passes
 * AI_GLOBAL_DAILY_COST_MICROS. Cached answers are still served.
 */
export async function enforceGlobalBudget({ now = Date.now(), ceiling = RATE_LIMITS.globalPerDayCostMicros } = {}) {
  if (!ceiling) return { source: "off" };
  const spent = await readGlobalSpend(now);
  if (spent >= ceiling) {
    throw aiError(AI_ERROR_CODES.aiResting, { retryAfterSeconds: 3_600, details: "global-day-cost-limit" });
  }
  return { spent };
}

export function resetGlobalSpend() {
  Object.assign(GLOBAL_SPEND, { readAt: 0, costMicros: 0, localSinceRead: 0, source: "none", warned: false });
  LOCAL_SPEND.length = 0;
}

/**
 * Enforce this user's request and spend budgets.
 *
 * One round trip: `kunthai_ai_usage_snapshot` returns the minute, hour and day
 * counts plus today's estimated spend.
 */
export async function enforceRateLimit(userId) {
  // The shared ceiling first: when KAI is resting for everyone, say so.
  await enforceGlobalBudget();

  const client = getAdminClient();
  if (!client) {
    memoryRateCheck(userId);
    return { source: "memory" };
  }

  const { data, error } = await client.rpc("kunthai_ai_usage_snapshot", { p_user: userId });

  if (error) {
    console.warn(`[KAI] usage snapshot unavailable (${error.code || "error"}); using in-memory limit`);
    memoryRateCheck(userId);
    return { source: "memory" };
  }

  const snapshot = Array.isArray(data) ? data[0] || {} : data || {};
  const minute = Number(snapshot.minute_count || 0);
  const hour = Number(snapshot.hour_count || 0);
  const day = Number(snapshot.day_count || 0);
  const dayCostMicros = Number(snapshot.day_cost_micros || 0);

  if (minute >= RATE_LIMITS.perMinute) {
    throw aiError(AI_ERROR_CODES.rateLimited, { retryAfterSeconds: 45, details: "minute-limit" });
  }
  if (hour >= RATE_LIMITS.perHour) {
    throw aiError(AI_ERROR_CODES.rateLimited, { retryAfterSeconds: 600, details: "hour-limit" });
  }
  if (day >= RATE_LIMITS.perDay) {
    throw aiError(AI_ERROR_CODES.budgetExceeded, { details: "day-limit" });
  }
  if (dayCostMicros >= RATE_LIMITS.perDayCostMicros) {
    throw aiError(AI_ERROR_CODES.budgetExceeded, { details: "day-cost-limit" });
  }

  return { source: "database", minute, hour, day, dayCostMicros };
}

// --- Usage logging ----------------------------------------------------------

const USAGE_COLUMNS = { cachedTokens: true };

function isMissingColumn(error) {
  return error?.code === "42703" || error?.code === "PGRST204" || /cached_tokens/.test(String(error?.message || ""));
}

/**
 * Record one AI call. Never throws: a logging failure must not fail a request
 * the user already paid latency for.
 *
 * Deliberately stores no prompt text and no model output — only the shape of
 * the call (task, surface, model, tokens, cost, outcome).
 */
export async function logAiUsage(entry) {
  // Counted toward the global ceiling even when the log cannot be written.
  recordGlobalSpend(entry?.costMicros);

  const client = getAdminClient();
  if (!client) return null;

  const row = {
    user_id: entry.userId,
    surface: String(entry.surface || "global").slice(0, 32),
    task: String(entry.task || "").slice(0, 64),
    model: String(entry.model || "").slice(0, 64),
    status: String(entry.status || "ok").slice(0, 32),
    error_code: entry.errorCode ? String(entry.errorCode).slice(0, 48) : null,
    input_tokens: Math.max(0, Math.round(Number(entry.inputTokens) || 0)),
    output_tokens: Math.max(0, Math.round(Number(entry.outputTokens) || 0)),
    total_tokens: Math.max(0, Math.round(Number(entry.totalTokens) || 0)),
    cost_micros: Math.max(0, Math.round(Number(entry.costMicros) || 0)),
    duration_ms: Math.max(0, Math.round(Number(entry.durationMs) || 0)),
    cached: Boolean(entry.cached),
  };
  if (USAGE_COLUMNS.cachedTokens) row.cached_tokens = Math.max(0, Math.round(Number(entry.cachedTokens) || 0));

  try {
    let { data, error } = await client.from("ai_usage_events").insert(row).select("id").maybeSingle();
    // The cached_tokens column arrives with a later migration; until then the
    // row is written without it rather than lost.
    if (error && row.cached_tokens !== undefined && isMissingColumn(error)) {
      USAGE_COLUMNS.cachedTokens = false;
      delete row.cached_tokens;
      ({ data, error } = await client.from("ai_usage_events").insert(row).select("id").maybeSingle());
    }
    if (error) {
      console.warn(`[KAI] usage log failed (${error.code || "error"})`);
      return null;
    }
    return data?.id || null;
  } catch {
    console.warn("[KAI] usage log failed (exception)");
    return null;
  }
}

/** Store a thumbs up/down against a previously logged call. */
export async function saveAiFeedback({ userId, usageId, rating, reason = "" }) {
  const client = getAdminClient();
  if (!client || !usageId) return false;

  try {
    const { error } = await client.from("ai_feedback").upsert(
      {
        usage_id: usageId,
        user_id: userId,
        rating: rating === "up" ? "up" : "down",
        reason: String(reason || "").slice(0, 400) || null,
      },
      { onConflict: "usage_id,user_id" },
    );
    return !error;
  } catch {
    return false;
  }
}

// --- Response cache ---------------------------------------------------------
//
// Identical, non-personal inputs (a translation, a tone rewrite) return the
// stored answer instead of billing another generation. Two layers: a per-
// instance map for the hot path, Postgres so warm instances share the win.

const MEMORY_CACHE = new Map();
const IN_FLIGHT = new Map();
// Bump to invalidate every stored answer at once (prompt or parser changes).
export const CACHE_KEY_VERSION = "v2";

export function buildCacheKey(parts) {
  return createHash("sha256").update(parts.filter(Boolean).join("\u0000")).digest("hex");
}

/**
 * Text as it should count for "the same request": Unicode-normalised, line
 * endings unified, runs of spaces/tabs collapsed and lines trimmed. Words,
 * case and line breaks are kept — they can change the answer.
 */
export function normalizeCacheText(value) {
  return String(value ?? "")
    .normalize("NFC")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t\u00a0]+/g, " ")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Key for one deterministic task answer. Built from exactly what reaches the
 * model — task, model id, the full system instruction (which carries the
 * section), the prompt (which carries the input and requested language), the
 * response schema and any image — so two requests share an answer only when
 * Gemini would see the same thing. `userId` scopes personal tasks to their
 * owner. Only the hash is ever stored or logged, never the text.
 */
export function buildTaskCacheKey({ taskId, model, systemInstruction, prompt, schema = null, media = null, locale = "", userId = "" }) {
  const hash = createHash("sha256");
  [
    CACHE_KEY_VERSION,
    String(taskId || ""),
    String(model || ""),
    String(locale || ""),
    userId ? `user:${userId}` : "shared",
    normalizeCacheText(systemInstruction),
    normalizeCacheText(prompt),
    schema ? JSON.stringify(schema) : "",
    ...(Array.isArray(media) ? media.map((item) => createHash("sha256").update(String(item?.data || "")).digest("hex")) : []),
  ].forEach((part) => hash.update(part).update("\u0000"));
  return hash.digest("hex");
}

/**
 * Run `work` once per key per instance: identical requests that arrive while
 * the first is still generating wait for its answer instead of paying again.
 */
// Returns { value, shared }: `shared` is true for the requests that joined.
export async function shareInFlight(key, work) {
  if (!key) return { value: await work(), shared: false };
  if (IN_FLIGHT.has(key)) return { value: await IN_FLIGHT.get(key), shared: true };
  const pending = Promise.resolve().then(work);
  IN_FLIGHT.set(key, pending);
  try {
    return { value: await pending, shared: false };
  } finally {
    IN_FLIGHT.delete(key);
  }
}

export async function readCachedResponse(key) {
  if (!CACHE.enabled || !key) return null;

  const local = MEMORY_CACHE.get(key);
  if (local && local.expiresAt > Date.now()) return local.value;
  if (local) MEMORY_CACHE.delete(key);

  const client = getAdminClient();
  if (!client) return null;

  try {
    const { data, error } = await client
      .from("ai_response_cache")
      .select("response,expires_at")
      .eq("cache_key", key)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    if (error || !data?.response) return null;

    MEMORY_CACHE.set(key, {
      value: data.response,
      expiresAt: new Date(data.expires_at).getTime(),
    });
    return data.response;
  } catch {
    return null;
  }
}

export async function writeCachedResponse(key, value, { task = "", model = "", ttlSeconds = CACHE.ttlSeconds } = {}) {
  if (!CACHE.enabled || !key || !value) return;

  const expiresAt = Date.now() + Math.max(1, Number(ttlSeconds) || CACHE.ttlSeconds) * 1_000;
  MEMORY_CACHE.set(key, { value, expiresAt });
  if (MEMORY_CACHE.size > CACHE.memoryEntries) {
    // Cheapest possible eviction: drop the oldest inserted key.
    MEMORY_CACHE.delete(MEMORY_CACHE.keys().next().value);
  }

  const client = getAdminClient();
  if (!client) return;

  try {
    await client.from("ai_response_cache").upsert(
      {
        cache_key: key,
        task: String(task).slice(0, 64),
        model: String(model).slice(0, 64),
        response: value,
        expires_at: new Date(expiresAt).toISOString(),
      },
      { onConflict: "cache_key" },
    );
    // No cron is spent on this: roughly one write in CACHE.cleanupEvery
    // deletes expired rows so the table stays small.
    if (CACHE.cleanupEvery > 0 && Math.random() * CACHE.cleanupEvery < 1) {
      await client.rpc("kunthai_ai_cache_cleanup");
    }
  } catch {
    // A cache miss next time is the only consequence.
  }
}

export function clearAiMemoryCaches() {
  MEMORY_CACHE.clear();
  MEMORY_HITS.clear();
  IP_HITS.clear();
  IN_FLIGHT.clear();
  resetGlobalSpend();
}

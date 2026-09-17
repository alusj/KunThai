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
// taking the whole feature down.
const MEMORY_HITS = new Map();

function memoryRateCheck(userId) {
  const now = Date.now();
  const hits = (MEMORY_HITS.get(userId) || []).filter((at) => now - at < 60_000);
  if (hits.length >= RATE_LIMITS.perMinute) {
    throw aiError(AI_ERROR_CODES.rateLimited, { retryAfterSeconds: 30, details: "memory-limit" });
  }
  hits.push(now);
  MEMORY_HITS.set(userId, hits);
  if (MEMORY_HITS.size > 500) {
    for (const [key, value] of MEMORY_HITS) {
      if (!value.some((at) => now - at < 60_000)) MEMORY_HITS.delete(key);
    }
  }
}

/**
 * Enforce this user's request and spend budgets.
 *
 * One round trip: `kunthai_ai_usage_snapshot` returns the minute, hour and day
 * counts plus today's estimated spend.
 */
export async function enforceRateLimit(userId) {
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

/**
 * Record one AI call. Never throws: a logging failure must not fail a request
 * the user already paid latency for.
 *
 * Deliberately stores no prompt text and no model output — only the shape of
 * the call (task, surface, model, tokens, cost, outcome).
 */
export async function logAiUsage(entry) {
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

  try {
    const { data, error } = await client.from("ai_usage_events").insert(row).select("id").maybeSingle();
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

export function buildCacheKey(parts) {
  return createHash("sha256").update(parts.filter(Boolean).join("\u0000")).digest("hex");
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

export async function writeCachedResponse(key, value, { task = "", model = "" } = {}) {
  if (!CACHE.enabled || !key || !value) return;

  const expiresAt = Date.now() + CACHE.ttlSeconds * 1_000;
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
  } catch {
    // A cache miss next time is the only consequence.
  }
}

export function clearAiMemoryCaches() {
  MEMORY_CACHE.clear();
  MEMORY_HITS.clear();
}

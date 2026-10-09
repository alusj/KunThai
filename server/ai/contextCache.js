// KAI — explicit Gemini context caching for the assistant's fixed prefix.
//
// The assistant sends the same long rules and tool declarations with every
// message. Gemini's implicit caching already discounts a repeated prefix when
// it can; an explicit cache (client.caches.create) guarantees the discount but
// is billed for storage while it lives, so it is opt-in (AI_CONTEXT_CACHE_ENABLED).
//
// One cache per distinct (model, system instruction, tools) — in practice one
// per section/role/screen-capability combination. The cache name is shared
// across serverless instances through the response-cache table, so a cold
// instance reuses the warm one's cache instead of paying to create another.
// Every failure degrades to an ordinary uncached call.

import { createHash } from "node:crypto";

import { CONTEXT_CACHE } from "./aiConfig.js";
import { readCachedResponse, writeCachedResponse } from "./aiUsage.js";

const ENTRIES = new Map();
const CREATING = new Map();
// After a failed create, do not retry that prefix for a while.
const FAILURE_BACKOFF_MS = 10 * 60 * 1000;
// Stop using a cache this long before Gemini expires it.
const EXPIRY_MARGIN_MS = 2 * 60 * 1000;
const MAX_ENTRIES = 64;

export function contextCacheKey({ model, systemInstruction, tools }) {
  return createHash("sha256")
    .update(JSON.stringify({ v: 1, model: String(model || ""), systemInstruction: systemInstruction || "", tools: tools || [] }))
    .digest("hex");
}

/** Rough token count of the prefix (4 characters per token). */
export function estimatePrefixTokens({ systemInstruction, tools }) {
  const chars = String(systemInstruction || "").length + JSON.stringify(tools || []).length;
  return Math.ceil(chars / 4);
}

function remember(key, entry) {
  ENTRIES.set(key, entry);
  if (ENTRIES.size > MAX_ENTRIES) ENTRIES.delete(ENTRIES.keys().next().value);
}

/**
 * The name of a live cache for this prefix, creating one when allowed, or ""
 * to call without one. Never throws.
 *
 * `client` is a GoogleGenAI instance (anything with caches.create).
 */
export async function getContextCacheName({ client, model, systemInstruction, tools, now = Date.now(), config = CONTEXT_CACHE, shared = true }) {
  if (!config.enabled || !client?.caches?.create || !model) return "";
  if (estimatePrefixTokens({ systemInstruction, tools }) < config.minTokens) return "";

  const key = contextCacheKey({ model, systemInstruction, tools });
  const local = ENTRIES.get(key);
  if (local?.name && local.expiresAt - EXPIRY_MARGIN_MS > now) return local.name;
  if (local?.failedUntil && local.failedUntil > now) return "";

  if (CREATING.has(key)) return CREATING.get(key);

  const work = (async () => {
    if (shared) {
      const stored = await readCachedResponse(`ctx:${key}`).catch(() => null);
      if (stored?.name && Number(stored.expiresAt) - EXPIRY_MARGIN_MS > now) {
        remember(key, { name: stored.name, expiresAt: Number(stored.expiresAt) });
        return stored.name;
      }
    }
    try {
      const created = await client.caches.create({
        model,
        config: {
          systemInstruction,
          ...(tools ? { tools } : {}),
          ttl: `${Math.round(config.ttlSeconds)}s`,
          displayName: `kai-${key.slice(0, 16)}`,
        },
      });
      const name = String(created?.name || "");
      if (!name) throw new Error("no-cache-name");
      const expiresAt = created?.expireTime ? new Date(created.expireTime).getTime() : now + config.ttlSeconds * 1000;
      remember(key, { name, expiresAt });
      if (shared) {
        const ttlSeconds = Math.max(60, Math.floor((expiresAt - now - EXPIRY_MARGIN_MS) / 1000));
        await writeCachedResponse(`ctx:${key}`, { name, expiresAt }, { task: "context-cache", model, ttlSeconds }).catch(() => {});
      }
      return name;
    } catch (error) {
      // Status only: the provider message can echo the request.
      console.warn(`[KAI] context cache unavailable (${Number(error?.status || 0) || "error"}); calling without it`);
      remember(key, { failedUntil: now + FAILURE_BACKOFF_MS });
      return "";
    }
  })();

  CREATING.set(key, work);
  try {
    return await work;
  } finally {
    CREATING.delete(key);
  }
}

/** Drop a cache that Gemini no longer accepts (expired or deleted). */
export async function forgetContextCache(name, { now = Date.now(), shared = true } = {}) {
  const keys = [...ENTRIES].filter(([, entry]) => entry.name === name).map(([key]) => key);
  keys.forEach((key) => ENTRIES.set(key, { failedUntil: now + 30_000 }));
  if (!shared) return;
  // Other instances must not keep handing out the dead name either.
  await Promise.all(keys.map((key) => writeCachedResponse(`ctx:${key}`, { name: "", expiresAt: 0 }, { task: "context-cache", ttlSeconds: 60 }).catch(() => {})));
}

/** Whether a failed call should be retried without the cache. */
export function isContextCacheFailure(error) {
  const status = Number(error?.status || error?.code || 0);
  // A plain 400 is usually something else (e.g. a thinking control), so only
  // a 400 that names the cache counts.
  return status === 403 || status === 404 || /cached ?content|cache/i.test(String(error?.message || ""));
}

export function clearContextCaches() {
  ENTRIES.clear();
  CREATING.clear();
}

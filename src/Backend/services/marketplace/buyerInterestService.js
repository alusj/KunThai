// What a signed-in buyer looks at in UrMall, so UrMall can suggest more of
// it and tell them when a store they viewed adds something new (see
// migration 20261014150000). Private: rows are readable only by their owner.
//
// Recording never slows or breaks the screen: signals are queued and sent in
// small batches, guests are skipped, and every failure is ignored.

import supabase from "../../lib/supabaseClient";
import { getUrMallBuyerSettings } from "./marketplaceBuyerSettings";

const FLUSH_DELAY_MS = 4000;
const MAX_BATCH = 20;
const INTEREST_CACHE_MS = 10 * 60_000;
const SEARCH_REPEAT_MS = 60_000;

let queue = [];
let flushTimer = 0;
let interestCache = { at: 0, userId: "", promise: null };
const recentSearches = new Map();

function clip(value, max) {
  return String(value || "").trim().slice(0, max);
}

async function signedInUserId() {
  try {
    const { data } = await supabase.auth.getSession();
    const user = data?.session?.user;
    return user && !user.is_anonymous ? user.id : "";
  } catch {
    return "";
  }
}

async function flush() {
  flushTimer = 0;
  if (!queue.length) return;
  const batch = queue.splice(0, MAX_BATCH);
  const userId = await signedInUserId();
  if (!userId) return;
  try {
    await supabase.from("marketplace_buyer_signals").insert(batch.map((signal) => ({ ...signal, user_id: userId })));
  } catch {
    // Best-effort: a lost signal only makes suggestions slightly less personal.
  }
  if (queue.length) scheduleFlush();
}

function scheduleFlush() {
  if (!flushTimer && typeof window !== "undefined") flushTimer = window.setTimeout(flush, FLUSH_DELAY_MS);
}

if (typeof document !== "undefined") {
  // Leaving the app sends what is waiting.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden" && queue.length) {
      window.clearTimeout(flushTimer);
      flush();
    }
  });
}

/**
 * kind: "view" | "dwell" | "search" | "cart" | "message".
 * item: a product or vertical listing ({ id, businessId, name, category }).
 */
export function recordBuyerSignal(kind, { item = null, query = "", category = "", seconds = 0 } = {}) {
  try {
    // UrMall Settings > Personalised suggestions off: nothing is recorded.
    if (getUrMallBuyerSettings().personalizedSuggestions === false) return;
    const signal = {
      kind,
      business_id: item?.businessId || item?.seller?.id || null,
      // Only marketplace_products ids; vertical listings keep the store only.
      product_id: item?.id && !item?.isVertical ? item.id : null,
      item_name: clip(item?.name || item?.title, 160),
      // Vertical listings show a translated category; their fixed type
      // (restaurant / hotel / property) keeps interests language-independent.
      category: clip(category || (item?.isVertical ? item?.verticalType : item?.category) || "", 80).toLowerCase(),
      query: clip(query, 120),
      seconds: Math.max(0, Math.min(3600, Math.round(Number(seconds) || 0))),
    };
    if (kind === "search") {
      const key = `${signal.query.toLowerCase()}|${signal.category}`;
      if (!signal.query || Date.now() - (recentSearches.get(key) || 0) < SEARCH_REPEAT_MS) return;
      recentSearches.set(key, Date.now());
      if (recentSearches.size > 50) recentSearches.clear();
    }
    if (kind === "dwell" && signal.seconds < 3) return;
    queue.push(signal);
    if (queue.length >= MAX_BATCH) {
      window.clearTimeout(flushTimer);
      flush();
    } else {
      scheduleFlush();
    }
  } catch {
    // Never let interest tracking affect the screen.
  }
}

/** Starts timing a listing that just opened; call the result when it closes. */
export function startBuyerViewTimer(item) {
  if (!item) return () => {};
  recordBuyerSignal("view", { item });
  const openedAt = Date.now();
  let done = false;
  return () => {
    if (done) return;
    done = true;
    recordBuyerSignal("dwell", { item, seconds: (Date.now() - openedAt) / 1000 });
  };
}

/**
 * The buyer's favourite categories as a Map(category -> 0..1), strongest = 1.
 * Cached for 10 minutes; empty for guests or when unavailable.
 */
export async function getBuyerInterests() {
  if (getUrMallBuyerSettings().personalizedSuggestions === false) return new Map();
  const userId = await signedInUserId();
  if (!userId) return new Map();
  const fresh = interestCache.promise && interestCache.userId === userId && Date.now() - interestCache.at < INTEREST_CACHE_MS;
  if (!fresh) {
    interestCache = {
      at: Date.now(),
      userId,
      promise: supabase
        .rpc("get_my_marketplace_interests", { p_limit: 8 })
        .then(({ data, error }) => (error ? [] : data || []))
        .catch(() => []),
    };
  }
  const rows = await interestCache.promise;
  const top = Math.max(0, ...rows.map((row) => Number(row.score) || 0));
  return new Map(rows.filter((row) => row.category && top > 0).map((row) => [String(row.category).toLowerCase(), (Number(row.score) || 0) / top]));
}

/** Forget cached interests (after the buyer clears their activity). */
export function resetBuyerInterestCache() {
  interestCache = { at: 0, userId: "", promise: null };
  queue = [];
}

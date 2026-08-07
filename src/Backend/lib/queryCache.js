// Lightweight client-side read cache for Supabase queries.
//
// Purpose: cut Supabase Egress. The Area View and the UrRide/UrMall dashboards
// re-run the same reads constantly — realtime change events, poll intervals, map
// panning and re-mounts all trigger identical fetches. Without a cache each one
// downloads the full result set again, which is what pushed Egress past quota.
//
// Two mechanisms:
//   1. TTL cache      — a fresh result is reused until it expires, so a burst of
//                       triggers within the window costs a single fetch.
//   2. In-flight dedup — concurrent callers for the same key share one promise,
//                       so parallel loaders never fan out into duplicate reads.
//
// This is a read-through cache only. Mutations must call invalidateCache() with
// the affected prefix so the next read re-fetches fresh data.

const store = new Map(); // key -> { data, expiresAt }
const inflight = new Map(); // key -> Promise

/**
 * Read `key` through the cache, calling `fetcher` only on a miss.
 * @param {string} key       Stable cache key (include every input that changes the result).
 * @param {() => Promise<any>} fetcher  Runs on a cache miss.
 * @param {number} ttlMs     How long a result stays fresh.
 * @param {object} [options]
 * @param {boolean} [options.force]  Bypass the cached value and re-fetch.
 */
export async function cachedQuery(key, fetcher, ttlMs = 15000, { force = false } = {}) {
  const now = Date.now();

  if (!force) {
    const cached = store.get(key);
    if (cached && cached.expiresAt > now) return cached.data;

    const pending = inflight.get(key);
    if (pending) return pending;
  }

  const promise = Promise.resolve()
    .then(fetcher)
    .then((data) => {
      store.set(key, { data, expiresAt: Date.now() + ttlMs });
      inflight.delete(key);
      return data;
    })
    .catch((error) => {
      inflight.delete(key);
      throw error;
    });

  inflight.set(key, promise);
  return promise;
}

/**
 * Drop cached results. Pass a prefix to clear one family of keys, or nothing to
 * clear everything. Call this from mutations that make cached reads stale.
 */
export function invalidateCache(prefix = "") {
  if (!prefix) {
    store.clear();
    return;
  }
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}

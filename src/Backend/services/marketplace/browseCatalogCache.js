// Persist the UrMall buyer Browse catalog to localStorage so the grid paints
// instantly on a full page reload — matching the "silent loading" other screens
// already have. Without this, Browse only cached the catalog in an in-memory Map
// (survives tab switches, lost on reload), so a cold reload showed a skeleton and
// re-fetched the whole catalog (Egress).
//
// Best-effort and bounded: one snapshot for the most-recently loaded filter set,
// capped product counts, inline data:/blob: media stripped so a base64 image can
// never bloat localStorage. On any read the caller still revalidates in the
// background, so a stale snapshot is only ever a first-paint convenience.

const STORAGE_KEY = "kunthai.urmall.browse.catalog.v1";
const MAX_SNAPSHOT_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_SNAPSHOTS = 4;
const MAX_PER_BUCKET = 12;
const CATALOG_BUCKETS = ["newProducts", "discountedProducts", "highDemandProducts", "topRatedProducts"];

function stripInlineMedia(value) {
  return typeof value === "string" && (value.startsWith("data:") || value.startsWith("blob:")) ? "" : value || "";
}

function sanitizeProduct(product) {
  if (!product || typeof product !== "object") return null;
  // Keep the product shape the card reads, but never store inline base64 media.
  return {
    ...product,
    imageUrl: stripInlineMedia(product.imageUrl),
    videoUrl: stripInlineMedia(product.videoUrl),
  };
}

function sanitizeCatalog(catalog) {
  const out = {};
  for (const bucket of CATALOG_BUCKETS) {
    const items = Array.isArray(catalog?.[bucket]) ? catalog[bucket] : [];
    out[bucket] = items.slice(0, MAX_PER_BUCKET).map(sanitizeProduct).filter(Boolean);
  }
  return out;
}

/**
 * Read the persisted catalog for `cacheKey`, or null when there is no usable
 * snapshot (missing, different filter set, or older than the max age).
 */
export function readBrowseCatalogSnapshot(cacheKey) {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (!raw || typeof raw !== "object") return null;
    // Read the original single-entry shape too, so this upgrade never blanks
    // an existing user's previously cached Browse screen.
    const snapshot = raw.entries?.[cacheKey] || (raw.cacheKey === cacheKey ? raw : null);
    if (!snapshot || Date.now() - Number(snapshot.savedAt || 0) > MAX_SNAPSHOT_AGE_MS) return null;
    return snapshot.catalog && typeof snapshot.catalog === "object" && !Array.isArray(snapshot.catalog)
      ? snapshot.catalog
      : null;
  } catch {
    return null;
  }
}

/** Persist `catalog` for `cacheKey`. Silently no-ops if storage is unavailable/full. */
export function writeBrowseCatalogSnapshot(cacheKey, catalog) {
  if (typeof localStorage === "undefined") return;
  try {
    const current = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    const entries = current?.entries && typeof current.entries === "object"
      ? { ...current.entries }
      : current?.cacheKey
        ? { [current.cacheKey]: { savedAt: current.savedAt, catalog: current.catalog } }
        : {};
    entries[cacheKey] = { savedAt: Date.now(), catalog: sanitizeCatalog(catalog) };

    const boundedEntries = Object.fromEntries(
      Object.entries(entries)
        .filter(([, snapshot]) => Date.now() - Number(snapshot?.savedAt || 0) <= MAX_SNAPSHOT_AGE_MS)
        .sort(([, left], [, right]) => Number(right.savedAt || 0) - Number(left.savedAt || 0))
        .slice(0, MAX_SNAPSHOTS),
    );

    localStorage.setItem(STORAGE_KEY, JSON.stringify({ entries: boundedEntries }));
  } catch {
    // Storage full or unavailable — the in-memory cache still applies.
  }
}

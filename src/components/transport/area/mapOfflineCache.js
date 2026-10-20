// Area View map data kept on the phone, so the map opens at once after a
// restart and keeps working without a connection where it has been used.
//
// Every map request (style, tile index, vector/raster tiles, fonts, icons) goes
// through the "ktmap://" protocol registered with MapLibre. A saved copy is
// answered straight away (and refreshed in the background when old); otherwise
// it is fetched, saved and answered. With no connection, anything saved
// before still draws. The area around the person is also saved ahead of time
// (saveAreaAround), so streets they have not scrolled to yet show offline too.
//
// Storage: IndexedDB ("kunthai-map", store "res"), keyed by the real https URL.

import maplibregl from "maplibre-gl";

const PROTOCOL = "ktmap";
const DB_NAME = "kunthai-map";
const STORE = "res";
const DB_VERSION = 1;
// Tiles, fonts and icons rarely change; the style and tile index more often.
const TILE_MAX_AGE_MS = 21 * 24 * 60 * 60 * 1000;
const INDEX_MAX_AGE_MS = 24 * 60 * 60 * 1000;
// Kept small enough for any phone: oldest entries go first past this count.
const MAX_ENTRIES = 9000;
const PRUNE_TO = 7500;

let dbPromise = null;
let registered = false;
let writesSincePrune = 0;
const inflight = new Map();

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: "url" });
          store.createIndex("at", "at");
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

async function readEntry(url) {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const request = db.transaction(STORE, "readonly").objectStore(STORE).get(url);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function writeEntry(url, data) {
  const db = await openDb();
  if (!db) return;
  try {
    db.transaction(STORE, "readwrite").objectStore(STORE).put({ url, data, at: Date.now() });
  } catch {
    // Storage full or unavailable: the map still works online.
  }
  writesSincePrune += 1;
  if (writesSincePrune >= 400) {
    writesSincePrune = 0;
    pruneOldEntries(db);
  }
}

function pruneOldEntries(db) {
  try {
    const store = db.transaction(STORE, "readwrite").objectStore(STORE);
    const countRequest = store.count();
    countRequest.onsuccess = () => {
      let excess = countRequest.result - PRUNE_TO;
      if (countRequest.result <= MAX_ENTRIES || excess <= 0) return;
      const cursorRequest = store.index("at").openCursor();
      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result;
        if (!cursor || excess <= 0) return;
        cursor.delete();
        excess -= 1;
        cursor.continue();
      };
    };
  } catch {
    // Pruning is housekeeping only.
  }
}

// ktmap://host/path -> https://host/path
function realUrl(url) {
  return String(url).replace(/^ktmap:\/\//, "https://");
}

// https://... -> ktmap://... (only http(s) URLs; templates like {z} stay).
export function toOfflineUrl(url) {
  return typeof url === "string" ? url.replace(/^https?:\/\//, `${PROTOCOL}://`) : url;
}

// Inner URLs of a style or tile index also go through the saved copies.
function rewriteJson(json) {
  if (!json || typeof json !== "object") return json;
  if (Array.isArray(json.tiles)) json.tiles = json.tiles.map(toOfflineUrl);
  if (typeof json.glyphs === "string") json.glyphs = toOfflineUrl(json.glyphs);
  if (typeof json.sprite === "string") json.sprite = toOfflineUrl(json.sprite);
  else if (Array.isArray(json.sprite)) json.sprite = json.sprite.map((sprite) => ({ ...sprite, url: toOfflineUrl(sprite.url) }));
  if (json.sources && typeof json.sources === "object") {
    Object.values(json.sources).forEach((source) => {
      if (!source || typeof source !== "object") return;
      if (typeof source.url === "string") source.url = toOfflineUrl(source.url);
      if (Array.isArray(source.tiles)) source.tiles = source.tiles.map(toOfflineUrl);
    });
  }
  return json;
}

function isIndexUrl(url) {
  return /\.json(\?|$)/.test(url) && !/sprite/.test(url);
}

function online() {
  return typeof navigator === "undefined" || navigator.onLine !== false;
}

async function fetchAndSave(url, signal) {
  const response = await fetch(url, { signal, credentials: "omit" });
  if (!response.ok) {
    const error = new Error(`Map request failed (${response.status})`);
    error.status = response.status;
    throw error;
  }
  const data = await response.arrayBuffer();
  // Never keep an error page or an empty tile body as map data for long.
  writeEntry(url, data);
  return data;
}

// The saved copy at once when there is one; otherwise the network (and save).
async function loadBytes(url, signal, maxAgeMs) {
  const entry = await readEntry(url);
  if (entry?.data) {
    const stale = Date.now() - Number(entry.at || 0) > maxAgeMs;
    if (stale && online() && !inflight.has(url)) {
      const refresh = fetchAndSave(url).catch(() => null).finally(() => inflight.delete(url));
      inflight.set(url, refresh);
    }
    return entry.data;
  }
  if (inflight.has(url)) {
    const shared = await inflight.get(url);
    if (shared) return shared;
  }
  const request = fetchAndSave(url, signal).finally(() => inflight.delete(url));
  inflight.set(url, request);
  return request;
}

const textDecoder = typeof TextDecoder !== "undefined" ? new TextDecoder() : null;

async function protocolHandler(params, abortController) {
  const url = realUrl(params.url);
  const indexRequest = params.type === "json" || isIndexUrl(url);
  const bytes = await loadBytes(url, abortController?.signal, indexRequest ? INDEX_MAX_AGE_MS : TILE_MAX_AGE_MS);
  if (params.type === "json") {
    const json = JSON.parse(textDecoder ? textDecoder.decode(bytes) : String.fromCharCode(...new Uint8Array(bytes)));
    return { data: rewriteJson(json) };
  }
  if (params.type === "string") {
    return { data: textDecoder ? textDecoder.decode(bytes) : "" };
  }
  // Tiles, fonts, and images (sprites, raster tiles) as raw bytes.
  return { data: bytes.slice(0) };
}

export function registerOfflineMapProtocol() {
  if (registered || typeof indexedDB === "undefined") return registered;
  try {
    maplibregl.addProtocol(PROTOCOL, protocolHandler);
    registered = true;
    openDb();
  } catch {
    registered = false;
  }
  return registered;
}

export function offlineMapsAvailable() {
  return registered;
}

// ---------------------------------------------------------------------------
// Saving the area around the person ahead of time.

const PREFETCH_KEY = "kunthai.mapPrefetch.v1";
const PREFETCH_MOVE_METERS = 2500;
const PREFETCH_EVERY_MS = 12 * 60 * 60 * 1000;
const PREFETCH_RADIUS_METERS = 5000;
const PREFETCH_CONCURRENCY = 4;
let prefetching = false;

function lngToTileX(lng, zoom) {
  return Math.floor(((lng + 180) / 360) * 2 ** zoom);
}

function latToTileY(lat, zoom) {
  const rad = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * 2 ** zoom);
}

function metersBetween(a, b) {
  const r = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(h));
}

function saveDataMode() {
  const connection = typeof navigator !== "undefined" ? navigator.connection || navigator.webkitConnection : null;
  const type = String(connection?.effectiveType || "").toLowerCase();
  return Boolean(connection?.saveData) || type === "slow-2g" || type === "2g";
}

function tileUrlsAround(templates, center, minZoom, maxZoom) {
  const urls = [];
  const latSpan = PREFETCH_RADIUS_METERS / 111320;
  const lngSpan = PREFETCH_RADIUS_METERS / (111320 * Math.max(0.2, Math.cos((center.lat * Math.PI) / 180)));
  for (let zoom = minZoom; zoom <= maxZoom; zoom += 1) {
    const x0 = lngToTileX(center.lng - lngSpan, zoom);
    const x1 = lngToTileX(center.lng + lngSpan, zoom);
    const y0 = latToTileY(center.lat + latSpan, zoom);
    const y1 = latToTileY(center.lat - latSpan, zoom);
    for (let x = x0; x <= x1; x += 1) {
      for (let y = y0; y <= y1; y += 1) {
        templates.forEach((template) => {
          urls.push(template.replace("{z}", zoom).replace("{x}", x).replace("{y}", y));
        });
      }
    }
  }
  return urls;
}

// Every font stack the style uses, for the common letter ranges.
function glyphUrls(style) {
  const template = typeof style?.glyphs === "string" ? style.glyphs : "";
  if (!template) return [];
  const stacks = new Set();
  (style.layers || []).forEach((layer) => {
    const font = layer?.layout?.["text-font"];
    if (Array.isArray(font) && font.every((item) => typeof item === "string")) stacks.add(font.join(","));
  });
  const ranges = ["0-255", "256-511", "8192-8447"];
  const urls = [];
  stacks.forEach((stack) => ranges.forEach((range) => {
    urls.push(template.replace("{fontstack}", encodeURIComponent(stack)).replace("{range}", range));
  }));
  return urls;
}

async function saveUrls(urls) {
  let index = 0;
  async function worker() {
    while (index < urls.length) {
      const url = realUrl(urls[index]);
      index += 1;
      if (!online()) return;
      try {
        const entry = await readEntry(url);
        if (!entry || Date.now() - Number(entry.at || 0) > TILE_MAX_AGE_MS) await fetchAndSave(url);
      } catch {
        // A missing tile (sea, no data) is fine; carry on.
      }
    }
  }
  await Promise.all(Array.from({ length: PREFETCH_CONCURRENCY }, worker));
}

/**
 * Saves the map around `center` ({ lat, lng }) for offline use: the tiles of
 * every source in the style (zoom 10 up to the source's own maximum, capped at
 * 15) within 5 km, and the fonts. Once per area and at most twice a day; never
 * offline or on a data-saving connection. Runs in the background.
 */
export async function saveAreaAround(map, center) {
  if (!registered || prefetching || !map || !center || !online() || saveDataMode()) return;
  if (!Number.isFinite(center.lat) || !Number.isFinite(center.lng)) return;
  try {
    const last = JSON.parse(localStorage.getItem(PREFETCH_KEY) || "null");
    if (last && Date.now() - last.at < PREFETCH_EVERY_MS && metersBetween(last, center) < PREFETCH_MOVE_METERS) return;
  } catch {
    // No record: save now.
  }
  prefetching = true;
  try {
    const style = map.getStyle?.();
    const urls = [];
    Object.keys(style?.sources || {}).forEach((id) => {
      const source = map.getSource?.(id);
      const templates = (source?.tiles || style.sources[id]?.tiles || []).filter((tile) => typeof tile === "string" && tile.includes("{z}"));
      if (!templates.length) return;
      const maxZoom = Math.min(15, Number(source?.maxzoom ?? style.sources[id]?.maxzoom ?? 14));
      urls.push(...tileUrlsAround(templates, center, 10, Math.max(10, maxZoom)));
    });
    urls.push(...glyphUrls(style));
    await saveUrls(urls);
    try {
      localStorage.setItem(PREFETCH_KEY, JSON.stringify({ lat: center.lat, lng: center.lng, at: Date.now() }));
    } catch {
      // Without the record it simply runs again next time.
    }
  } finally {
    prefetching = false;
  }
}

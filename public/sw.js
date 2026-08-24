/*
 * KunThai service worker: push notifications only.
 * App code stays network-only so a stale cache can never break deployments.
 * Area View map tiles are the narrow exception: caching immutable tile images
 * makes recently travelled areas redraw immediately on weak connections.
 */

const AREA_TILE_CACHE = "kunthai-area-tiles-v1";
const AREA_TILE_CACHE_LIMIT = 280;

function isAreaTileRequest(request) {
  if (request.method !== "GET") return false;
  try {
    const url = new URL(request.url);
    return url.hostname === "tile.openstreetmap.org" || url.hostname.endsWith(".tile.openstreetmap.org") || url.hostname === "api.maptiler.com";
  } catch {
    return false;
  }
}

async function trimAreaTileCache(cache) {
  const keys = await cache.keys();
  if (keys.length <= AREA_TILE_CACHE_LIMIT) return;
  await Promise.all(keys.slice(0, keys.length - AREA_TILE_CACHE_LIMIT).map((key) => cache.delete(key)));
}

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Post outbox Background Sync (Phase 1). When the browser wakes us on reconnect,
// ask any KunThai client to drain its outbox — publishing always runs through
// the app's real, correct code path, so the worker never reimplements it. If no
// client is reachable, the post stays safely queued and drains the next time the
// app is opened. Supported on Chromium; a no-op elsewhere.
async function askClientsToDrainOutbox() {
  const clientList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  for (const client of clientList) {
    client.postMessage({ type: "kunthai-drain-outbox" });
  }
}

self.addEventListener("sync", (event) => {
  if (event.tag === "kunthai-post-outbox") {
    event.waitUntil(askClientsToDrainOutbox());
  }
});

self.addEventListener("fetch", (event) => {
  if (!isAreaTileRequest(event.request)) return;

  event.respondWith((async () => {
    const cache = await caches.open(AREA_TILE_CACHE);
    const cached = await cache.match(event.request);
    if (cached) return cached;

    const response = await fetch(event.request);
    if (response?.ok || response?.type === "opaque") {
      event.waitUntil(cache.put(event.request, response.clone()).then(() => trimAreaTileCache(cache)));
    }
    return response;
  })());
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data ? event.data.text() : "" };
  }

  const title = payload.title || "KunThai";
  const options = {
    body: payload.body || "",
    icon: payload.icon || "/icons/kunthai-192.png",
    badge: "/icons/kunthai-192.png",
    tag: payload.tag || "kunthai",
    data: { url: payload.url || "/", target: payload.target || "" },
  };

  event.waitUntil(
    (async () => {
      // When the app is focused, the in-app banner already presents this
      // event; a duplicate system notification would feel noisy.
      const clientList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const appIsFocused = clientList.some((client) => client.focused && client.visibilityState === "visible");
      if (appIsFocused) return;
      await self.registration.showNotification(title, options);
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const targetUrl = data.url || "/";

  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of clientList) {
        if ("focus" in client) {
          await client.focus();
          client.postMessage({ type: "kunthai-notification-click", url: targetUrl, target: data.target || "" });
          return;
        }
      }
      await self.clients.openWindow(targetUrl);
    })(),
  );
});

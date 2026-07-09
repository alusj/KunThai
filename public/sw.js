/*
 * KunThai service worker: push notifications only.
 * No fetch caching on purpose — the app stays served live by the host, so a
 * stale cache can never break deployments. This worker exists to receive Web
 * Push events in the background and route notification taps back into the app.
 */

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
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

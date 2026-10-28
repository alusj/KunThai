import { recordLifecycle } from "./lifecycleAudit";
import { isPostOutboxDraining } from "./explore/postOutbox";

// Opened again after 15 minutes or more away, the app starts fresh, the same
// as when the phone closes it in the background: new data, and Swip's first
// clips downloaded again before it is shown (swipStartupPrefetch). The native
// app decides it (it knows how long KunThai was away), puts the KunThai logo
// splash up the moment the app comes back, before the old screen shows, and
// asks the page to reload under it; the splash leaves once the reloaded app
// has drawn its first screen (KunThaiBridgeViewController.quietReload on
// iPhone, MainActivity.quietReload on Android).
//
// Not while a post is still being sent: then the app carries on as it was.

export function installQuietReload() {
  if (typeof window === "undefined") return;
  window.__ktQuietReload = () => {
    if (isPostOutboxDraining()) return "declined";
    recordLifecycle("quiet-reload", "app");
    window.location.reload();
    return "reloading";
  };
}

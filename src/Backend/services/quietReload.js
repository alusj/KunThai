import { Capacitor } from "@capacitor/core";

import { recordLifecycle } from "./lifecycleAudit";
import { isPostOutboxDraining } from "./explore/postOutbox";
import { isDashboardResumeHeld } from "./dashboardResume";

// Opened again after 15 minutes or more away, the app starts fresh, the same
// as when the phone closes it in the background: new data, and Swip's first
// clips downloaded again before it is shown (swipStartupPrefetch). The native
// app decides it (it knows how long KunThai was away): the KunThai logo
// splash goes up as the app comes back, it asks this page, and on "reloading"
// it reloads the page under the splash, which leaves once the reloaded app
// has drawn (KunThaiBridgeViewController.quietReload on iPhone,
// MainActivity.quietReload on Android). The native side reloads, not the
// page: on Android the page is still paused at that moment and a reload it
// asks for itself is dropped.
//
// Declined while a post is being sent, or while a live trip or Area View
// navigation holds the screen (dashboardResume.js): the app then carries on
// as it was.

export function installQuietReload() {
  if (typeof window === "undefined") return;
  try {
    if (!Capacitor.isNativePlatform()) return;
  } catch {
    return;
  }
  // App.jsx's own 15-minute reset (web) stands aside for this.
  window.__ktNativeQuietReload = true;
  window.__ktQuietReload = () => {
    if (isPostOutboxDraining() || isDashboardResumeHeld()) return "declined";
    recordLifecycle("quiet-reload", "app");
    // Fresh on a main dashboard, not on an inner screen from a deep link.
    try {
      if (window.location.hash) window.history.replaceState(null, "", window.location.pathname + window.location.search);
    } catch {
      // The hash stays; the app still starts fresh.
    }
    return "reloading";
  };
}

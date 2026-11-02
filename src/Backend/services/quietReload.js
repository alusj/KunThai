import { Capacitor } from "@capacitor/core";

import { recordLifecycle } from "./lifecycleAudit";
import { LEAN_DEBUG } from "../../debugLean";

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
// Whenever that splash shows, the app reloads once, with no exception: a
// post still being sent stays in the outbox and is sent again after the
// reload (postOutbox.js), and a live trip or Area View is opened again from
// the server.

// The native side opens the start page with this marker rather than reloading
// in place (a reload keeps sessionStorage, which then restored the old tab,
// UrMall screen and scroll as if nothing had happened). Runs before any screen
// reads sessionStorage, so the reloaded app starts like a cold launch.
const FRESH_START_PARAM = "ktFresh";

export function consumeFreshStart() {
  if (typeof window === "undefined") return false;
  let params;
  try {
    params = new URLSearchParams(window.location.search);
  } catch {
    return false;
  }
  if (!params.has(FRESH_START_PARAM)) return false;
  try {
    sessionStorage.clear();
  } catch {
    // Storage blocked: the app still starts, on the restored screens.
  }
  params.delete(FRESH_START_PARAM);
  const query = params.toString();
  try {
    window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
  } catch {
    // The marker stays in the address; harmless.
  }
  recordLifecycle("fresh-start", "app");
  return true;
}

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
    // Debugging the iPhone restarts (debugLean.js): the native app keeps the
    // page as it is when told "skip".
    if (LEAN_DEBUG) {
      recordLifecycle("quiet-reload", "app", "skipped (lean debug)");
      return "skip";
    }
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

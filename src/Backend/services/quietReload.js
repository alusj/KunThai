import { Capacitor } from "@capacitor/core";

import { recordLifecycle } from "./lifecycleAudit";

// There is no fresh start after a long time away any more (removed
// 2026-11-02). It reloaded KunThai under the logo whenever it came back after
// 15 minutes, many times a day; with only the screen on show kept in memory
// (App.jsx), KunThai now carries on where it was. The native apps still reload
// a page iOS or Android cleared in the background.

// A build from before the change may still open the start page with this
// marker: it starts like a cold launch (sessionStorage cleared, so no old tab
// or screen comes back).
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

// In the phone apps, App.jsx's web-only 15-minute reset stays off as well.
export function installQuietReload() {
  if (typeof window === "undefined") return;
  try {
    if (!Capacitor.isNativePlatform()) return;
  } catch {
    return;
  }
  window.__ktNativeQuietReload = true;
}

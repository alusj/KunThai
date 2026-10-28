import { Capacitor, registerPlugin } from "@capacitor/core";

import { recordLifecycle } from "./lifecycleAudit";
import { isPostOutboxDraining } from "./explore/postOutbox";

// Opened again after 15 minutes or more away, the app starts fresh, the same
// as when the phone closes it in the background: new data, and Swip's first
// clips downloaded again before it is shown (swipStartupPrefetch). The reload
// shows nothing: the native app covers the page in the app's own colour from
// the start of the reload until the first screen has drawn (on iPhone the
// cover that already hides a page iOS cleared; on Android KunThaiLaunchPlugin
// .coverForReload), and saved feeds fill the screens straight away.
//
// Only in the iOS / Android app. Not while a post is still being sent.

const STALE_AFTER_MS = 15 * 60 * 1000;
const KunThaiLaunch = registerPlugin("KunThaiLaunch");

let hiddenAt = 0;
let installed = false;

function isNativeApp() {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

function coverForReload() {
  try {
    if (Capacitor.getPlatform() !== "android" || !Capacitor.isPluginAvailable("KunThaiLaunch")) return Promise.resolve();
  } catch {
    return Promise.resolve();
  }
  // Never wait long for the cover: the reload goes ahead regardless.
  return Promise.race([
    KunThaiLaunch.coverForReload().catch(() => {}),
    new Promise((resolve) => window.setTimeout(resolve, 300)),
  ]);
}

export function installQuietReload() {
  if (installed || typeof document === "undefined" || !isNativeApp()) return;
  installed = true;

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      hiddenAt = Date.now();
      return;
    }
    const away = hiddenAt ? Date.now() - hiddenAt : 0;
    hiddenAt = 0;
    if (away < STALE_AFTER_MS || isPostOutboxDraining()) return;
    recordLifecycle("quiet-reload", "app", `away ${Math.round(away / 1000)}s`);
    coverForReload().then(() => window.location.reload());
  });
}

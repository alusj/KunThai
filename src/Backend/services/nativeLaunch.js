import { Capacitor, registerPlugin } from "@capacitor/core";

// Tells the native app that KunThai has drawn its first real screen (the
// loading skeleton or the page itself), so the native splash can leave.
// Until then the splash stays up (at most a few seconds), so reopening the
// app never shows a blank screen while the web content loads or, on iPhone,
// reloads after iOS cleared it in the background.
// Native: ios/App/App/KunThaiBridgeViewController.swift (KunThaiLaunchPlugin)
// and android/app/src/main/java/app/kunthai/mobile/KunThaiLaunchPlugin.java.

const KunThaiLaunch = registerPlugin("KunThaiLaunch");

export function notifyNativeAppReady() {
  if (typeof window === "undefined") return;
  // Read by the iPhone app when KunThai returns from the background: missing
  // means iOS cleared the page and it is reloading.
  window.__ktReady = true;
  try {
    if (!Capacitor.isNativePlatform() || !Capacitor.isPluginAvailable("KunThaiLaunch")) return;
  } catch {
    return;
  }
  KunThaiLaunch.ready().catch(() => {});
}

// Whether a member is signed in on this phone. The native app reads it at the
// next fresh start: the KunThai splash only for a returning signed-in member;
// a first-time visitor, or anyone after signing out or "Add account", goes
// straight to the sign-up screen.
export function setNativeSignedIn(signedIn) {
  try {
    if (!Capacitor.isNativePlatform() || !Capacitor.isPluginAvailable("KunThaiLaunch")) return Promise.resolve();
  } catch {
    return Promise.resolve();
  }
  return KunThaiLaunch.setSignedIn({ signedIn: Boolean(signedIn) }).catch(() => {});
}

// KunThai's Appearance (dark or light, "System" already resolved). The native
// app paints the background behind the page in it, so a frame the WebView has
// not drawn yet (a screen switch, a swipe) is never the other theme's colour,
// and uses it behind the splash at the next start.
let lastNativeAppearance = null;
export function setNativeAppearance(dark) {
  const value = Boolean(dark);
  if (lastNativeAppearance === value) return Promise.resolve();
  try {
    if (!Capacitor.isNativePlatform() || !Capacitor.isPluginAvailable("KunThaiLaunch")) return Promise.resolve();
  } catch {
    return Promise.resolve();
  }
  lastNativeAppearance = value;
  return KunThaiLaunch.setAppearance({ dark: value }).catch(() => {
    lastNativeAppearance = null;
  });
}
